import { useGroupCallStore } from '../stores/groupCall.store';
import type { IRealtimeMessage, IRealtimeSyncResponse } from '@FLUX/shared';
import { api } from './api';
import { useAuthStore } from '../stores/auth.store';
import { useChatsStore } from '../stores/chats.store';
import { useMessagesStore } from '../stores/messages.store';
import { usePresenceStore } from '../stores/presence.store';

type EventHandler = (payload: any) => void;

/** Give up on replaying after this many back-to-back sync passes. */
const MAX_SYNC_PASSES = 5;
const SYNC_RETRY_DELAY_MS = 3_000;

const seqStorageKey = (userId: string) => `flux:rt:seq:${userId}`;

function readStoredSequence(userId: string): number | null {
  try {
    const raw = window.localStorage.getItem(seqStorageKey(userId));
    const parsed = raw === null ? NaN : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredSequence(userId: string, sequenceId: number): void {
  try {
    window.localStorage.setItem(seqStorageKey(userId), String(sequenceId));
  } catch {
    // Private mode or blocked storage: the cursor then only lives in memory,
    // and the next page load starts from the server's current head.
  }
}

class RealtimeClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private handlers = new Map<string, Set<EventHandler>>();
  private pingTimer: number | null = null;

  // Replay state. `lastSequenceId` is the newest durable event applied for
  // `sequenceUserId`; `null` until the handshake tells us where we are.
  private sequenceUserId: string | null = null;
  private lastSequenceId: number | null = null;
  private syncing = false;
  private syncRequested = false;
  private syncRetryTimer: number | null = null;
  // Live sequenced events received while the cursor is unknown or a sync is
  // running. They are applied after the replay, in order, skipping duplicates.
  private pending: IRealtimeMessage[] = [];

  private fetchingTicket = false;

  connect(): void {
    const token = useAuthStore.getState().accessToken;
    if (!token || this.fetchingTicket) return;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // The socket is opened with a one-time ticket, so the access token never appears in a URL.
    this.fetchingTicket = true;
    api
      .post<{ ticket: string }>('/sync/ticket')
      .then(({ ticket }) => this.open(ticket))
      .catch(() => this.scheduleReconnect())
      .finally(() => {
        this.fetchingTicket = false;
      });
  }

  private open(ticket: string): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // Hosts that cannot proxy WebSocket (Netlify) point the client at the server directly.
    const base = import.meta.env.VITE_WS_ORIGIN || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    const wsUrl = `${base}/ws?ticket=${encodeURIComponent(ticket)}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    };

    this.ws.onclose = () => {
      this.stopPing();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // handled by onclose
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.syncRetryTimer) {
      clearTimeout(this.syncRetryTimer);
      this.syncRetryTimer = null;
    }
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    // The stored cursor stays (it is per user); only the in-memory state of
    // this session is dropped so the next login starts from a clean handshake.
    this.sequenceUserId = null;
    this.lastSequenceId = null;
    this.syncing = false;
    this.syncRequested = false;
    this.pending = [];
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // ws ping handled by server
      }
    }, 25_000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts++;
    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleMessage(message: IRealtimeMessage): void {
    const { event, payload } = message;
    if (!event) return;

    if (event === 'connection.authenticated') {
      this.dispatch(event, payload);
      this.onAuthenticated(payload);
      return;
    }

    if (typeof message.sequenceId === 'number') {
      this.receiveSequenced(message);
      return;
    }

    this.dispatch(event, payload);
  }

  private dispatch(event: string, payload: any): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(payload));
    }

    this.routeToStores(event, payload);
  }

  /**
   * Handshake: learn the server's newest sequence id and start catching up.
   *
   * With no stored cursor (first sign-in on this browser) we begin at the
   * server's head, because the REST API is about to load the current state. A
   * sync is always requested afterwards: it is cheap when nothing is missing
   * and it also covers events appended between the handshake and the moment
   * the server registered this socket for live delivery.
   */
  private onAuthenticated(payload: { userId?: string; lastSequenceId?: number }): void {
    if (!payload?.userId) return;

    this.sequenceUserId = payload.userId;
    const stored = readStoredSequence(payload.userId);
    this.setLastSequence(stored ?? payload.lastSequenceId ?? 0);
    void this.sync();
  }

  private setLastSequence(sequenceId: number): void {
    this.lastSequenceId = sequenceId;
    if (this.sequenceUserId) {
      writeStoredSequence(this.sequenceUserId, sequenceId);
    }
  }

  private receiveSequenced(message: IRealtimeMessage): void {
    if (this.lastSequenceId === null || this.syncing) {
      this.pending.push(message);
      return;
    }

    const sequenceId = message.sequenceId as number;

    if (sequenceId <= this.lastSequenceId) {
      return; // already applied (replay and live delivery overlapped)
    }

    if (sequenceId === this.lastSequenceId + 1) {
      this.dispatch(message.event, message.payload);
      this.setLastSequence(sequenceId);
      return;
    }

    // A number was skipped: hold this event and fetch what is missing.
    this.pending.push(message);
    void this.sync();
  }

  /**
   * Replays everything after the cursor through `GET /sync`, then applies the
   * live events that arrived meanwhile. A `reset` answer means the gap is
   * larger than the server's replay window: caches are discarded through the
   * `sync.reset` event and the cursor jumps to the server's head.
   */
  private async sync(): Promise<void> {
    if (this.syncing) {
      this.syncRequested = true;
      return;
    }

    this.syncing = true;

    try {
      for (let pass = 0; pass < MAX_SYNC_PASSES; pass++) {
        this.syncRequested = false;
        await this.replayFromServer();

        const queued = this.pending.sort((a, b) => (a.sequenceId ?? 0) - (b.sequenceId ?? 0));
        this.pending = [];
        let gap = false;

        for (const message of queued) {
          const sequenceId = message.sequenceId as number;
          const last = this.lastSequenceId ?? 0;

          if (sequenceId <= last) continue;

          if (sequenceId === last + 1 && !gap) {
            this.dispatch(message.event, message.payload);
            this.setLastSequence(sequenceId);
          } else {
            gap = true;
            this.pending.push(message);
          }
        }

        if (!gap && !this.syncRequested) return;
      }
    } catch (err) {
      console.warn('Realtime sync failed, retrying', err);
      this.syncRetryTimer = window.setTimeout(() => {
        this.syncRetryTimer = null;
        void this.sync();
      }, SYNC_RETRY_DELAY_MS);
    } finally {
      this.syncing = false;
    }
  }

  private async replayFromServer(): Promise<void> {
    for (;;) {
      const after = this.lastSequenceId ?? 0;
      const response = await api.get<IRealtimeSyncResponse>(`/sync?after=${after}`);

      if (response.reset) {
        this.pending = [];
        this.setLastSequence(response.head);
        this.dispatch('sync.reset', { head: response.head });
        return;
      }

      for (const message of response.events) {
        const sequenceId = message.sequenceId as number;
        if (sequenceId <= (this.lastSequenceId ?? 0)) continue;
        this.dispatch(message.event, message.payload);
        this.setLastSequence(sequenceId);
      }

      if (!response.hasMore) {
        this.setLastSequence(Math.max(this.lastSequenceId ?? 0, response.head));
        return;
      }
    }
  }

  private routeToStores(event: string, payload: any): void {
    switch (event) {
      case 'message.new':
        useMessagesStore.getState().handleIncomingMessage(payload);
        break;
      case 'story.new':
        window.dispatchEvent(new Event('flux:story'));
        break;
      case 'groupcall.updated':
        useGroupCallStore.getState().setCall(payload.chatId, payload.call);
        break;
      case 'message.updated':
        useMessagesStore.getState().handleMessageUpdated(payload);
        break;
      case 'message.deleted':
        useMessagesStore.getState().handleMessageDeleted(payload);
        break;
      case 'message.read':
        useMessagesStore.getState().handleMessageRead(payload);
        break;
      case 'message.pin.updated':
        // Pinned state lives on the message so the context menu can say Pin/Unpin.
        useMessagesStore
          .getState()
          .updateMessage(payload.chatId, payload.messageId, {
            pin: payload.isPinned ? { id: payload.messageId } : null,
          } as any);
        break;
      case 'chat.created':
      case 'chat.updated':
        useChatsStore.getState().handleChatUpsert(payload);
        break;
      case 'chat.deleted':
        useChatsStore.getState().handleChatDeleted(payload);
        break;
      case 'user.presence.online':
      case 'user.presence.offline':
        usePresenceStore.getState().handlePresence(payload);
        break;
    }
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  /**
   * Sends an event to the server.
   *
   * `@nestjs/platform-ws` reads `message.event` to pick the
   * `@SubscribeMessage` handler and passes `message.data` to `@MessageBody()`,
   * so the envelope must use the `data` key (a `payload` key leaves the body
   * `undefined` and the frame is dropped without a trace).
   */
  send(event: string, payload: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data: payload, timestamp: Date.now() }));
    }
  }
}

export const realtime = new RealtimeClient();
