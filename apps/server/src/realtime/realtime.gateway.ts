import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'ws';
import { IncomingMessage } from 'http';
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
} from '@nestjs/websockets';
import { WsTicketService } from './ws-ticket.service';
import {
  isDurableRealtimeEvent,
  RealtimeEvent,
  REALTIME_PROTOCOL_VERSION,
} from '@FLUX/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PrivacyService } from '../privacy/privacy.service';
import { RealtimeEventLogService } from './realtime-event-log.service';

interface ClientConnection {
  ws: any;
  userId: string;
  sessionId: string;
  isAlive: boolean;
}

/** Largest client frame accepted; signalling and typing frames are tiny. */
const MAX_FRAME_BYTES = 256 * 1024;
/** A well-behaved client sends far fewer frames than this in a window. */
const MAX_FRAMES_PER_WINDOW = 200;
const FRAME_WINDOW_MS = 10_000;

@WebSocketGateway({ path: '/ws', maxPayload: MAX_FRAME_BYTES })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private userConnections = new Map<string, Set<ClientConnection>>();

  /** Open WebSocket connections across all users. */
  connectionCount(): number {
    let total = 0;
    this.userConnections.forEach((set) => (total += set.size));
    return total;
  }

  /** Users with at least one open connection. */
  onlineUserCount(): number {
    return this.userConnections.size;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly privacy: PrivacyService,
    private readonly eventLog: RealtimeEventLogService,
    private readonly tickets: WsTicketService,
  ) {}

  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
    
    const interval = setInterval(() => {
      this.userConnections.forEach((connections) => {
        connections.forEach((conn) => {
          if (!conn.isAlive) {
            conn.ws.terminate();
            return;
          }
          conn.isAlive = false;
          conn.ws.ping();
        });
      });
    }, 30000);

    this.server.on('close', () => clearInterval(interval));
  }

  async handleConnection(client: any, request: IncomingMessage) {
    try {
      const url = new URL(request.url || '', 'http://localhost');
      const ticket = url.searchParams.get('ticket');
      const redeemed = ticket ? await this.tickets.redeem(ticket) : null;

      if (!redeemed) {
        client.close(4001, 'Unauthorized');
        return;
      }

      const payload = { sub: redeemed.userId, sessionId: redeemed.sessionId };
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

      if (!user || user.isBlocked || user.deletedAt) {
        client.close(4002, 'User unavailable');
        return;
      }

      const session = await this.prisma.session.findUnique({
        where: { id: payload.sessionId },
        select: { userId: true, isActive: true },
      });
      if (!session || !session.isActive || session.userId !== user.id) {
        client.close(4003, 'Session revoked');
        return;
      }

      const connection: ClientConnection = {
        ws: client,
        userId: user.id,
        sessionId: payload.sessionId,
        isAlive: true,
      };

      // The identity has to live on the socket itself: message handlers get
      // the raw client and previously saw `undefined` here, which silently
      // dropped every call signal.
      client.userId = user.id;
      client.sessionId = payload.sessionId;

      client.on('pong', () => {
        connection.isAlive = true;
      });

      // Flood protection: a socket that sends frames faster than any real
      // client would is closed instead of being allowed to burn CPU on handlers.
      let framesInWindow = 0;
      const windowTimer = setInterval(() => {
        framesInWindow = 0;
      }, FRAME_WINDOW_MS);
      client.on('message', () => {
        framesInWindow += 1;
        if (framesInWindow > MAX_FRAMES_PER_WINDOW) {
          this.logger.warn(`Closing socket of ${user.id}: too many frames`);
          client.close(4008, 'Rate limit exceeded');
        }
      });
      client.on('close', () => clearInterval(windowTimer));

      // The handshake carries the newest sequence id *before* the socket is
      // registered for live delivery, so no live event can overtake it. Anything
      // appended between this read and the registration below is picked up by
      // the client's `GET /sync` that follows the handshake.
      const lastSequenceId = await this.eventLog.head(user.id).catch((err) => {
        this.logger.warn(`Could not read event head for ${user.id}: ${err}`);
        return 0;
      });

      client.send(
        this.envelope(RealtimeEvent.CONNECTION_AUTHENTICATED, {
          userId: user.id,
          sessionId: payload.sessionId,
          lastSequenceId,
        }),
      );

      if (!this.userConnections.has(user.id)) {
        this.userConnections.set(user.id, new Set());
      }
      this.userConnections.get(user.id)!.add(connection);

      await this.prisma.user.update({
        where: { id: user.id },
        data: { presence: 'ONLINE', lastSeenAt: new Date() },
      });

      void this.broadcastPresence(user.id, true);
    } catch (err) {
      this.logger.warn(`Connection failed: ${err}`);
      client.close(4001, 'Unauthorized');
    }
  }

  async handleDisconnect(client: any) {
    let disconnectedUserId: string | null = null;

    this.userConnections.forEach((connections, userId) => {
      for (const conn of connections) {
        if (conn.ws === client) {
          connections.delete(conn);
          if (connections.size === 0) {
            this.userConnections.delete(userId);
            disconnectedUserId = userId;
          }
          break;
        }
      }
    });

    if (disconnectedUserId) {
      await this.prisma.user.update({
        where: { id: disconnectedUserId },
        data: { presence: 'OFFLINE', lastSeenAt: new Date() },
      });
      void this.broadcastPresence(disconnectedUserId, false);
    }
  }

  /**
   * Closes every open socket of `userId` whose session is no longer active.
   *
   * Call it after any code path that ends sessions (sign-out of a device,
   * "sign out everywhere", password change/reset, ban, account deletion). The
   * HTTP guard already rejects the dead access token; this is what stops an
   * already-open socket from receiving events until it next reconnects.
   */
  async enforceActiveSessions(userId: string): Promise<void> {
    const connections = this.userConnections.get(userId);
    if (!connections || connections.size === 0) return;

    const active = new Set(
      (
        await this.prisma.session.findMany({
          where: { userId, isActive: true },
          select: { id: true },
        })
      ).map((session) => session.id),
    );

    const revoked: string[] = [];
    for (const conn of [...connections]) {
      if (active.has(conn.sessionId)) continue;

      revoked.push(conn.sessionId);
      if (conn.ws.readyState === 1) {
        conn.ws.send(this.envelope(RealtimeEvent.SESSION_REVOKED, { sessionId: conn.sessionId }));
      }
      conn.ws.close(4003, 'Session revoked');
    }

    // The user's remaining devices refresh their session list.
    for (const sessionId of new Set(revoked)) {
      this.emitToUser(userId, RealtimeEvent.SESSION_REVOKED, { sessionId });
    }
  }

  private async broadcastPresence(userId: string, online: boolean) {
    // A user who hid their online status simply does not produce presence
    // events; clients never learn about the transition.
    const flags = await this.privacy.getFlags(userId);
    if (!flags.showOnlineStatus) return;

    const event = online ? RealtimeEvent.USER_PRESENCE_ONLINE : RealtimeEvent.USER_PRESENCE_OFFLINE;
    this.broadcast(event, { userId, timestamp: Date.now() });
  }

  /**
   * Relays WebRTC signalling between two signed-in peers.
   *
   * This lives on the main `/ws` gateway on purpose: it is the only socket the
   * browser opens, and it is where `client.userId` is populated. The separate
   * `CallsGateway` was bound to `/ws/calls`, which nobody connects to, so every
   * offer/answer/ICE frame was dropped and no call could ever connect.
   */
  @SubscribeMessage('call.signal')
  handleCallSignal(@ConnectedSocket() client: any, @MessageBody() body: any) {
    const userId = client.userId;
    // `@nestjs/platform-ws` hands over `message.data`; tolerate a nested
    // envelope just in case a client wraps it again.
    const signal = body?.payload ?? body?.data ?? body;

    if (!userId || !signal?.callId || !signal?.targetUserId) {
      return { event: 'error', data: { message: 'Invalid signal data' } };
    }

    // The client listens on a single `call.sdp` channel, so the role has to
    // travel with the payload.
    const isIce = signal.signalType === 'ice' || Boolean(signal.candidate);
    const signalType = isIce
      ? 'ice'
      : signal.signalType === 'answer'
        ? 'answer'
        : 'offer';

    this.emitToUser(
      signal.targetUserId,
      isIce ? RealtimeEvent.CALL_ICE : RealtimeEvent.CALL_SDP,
      {
        callId: signal.callId,
        fromUserId: userId,
        signalType,
        sdp: signal.sdp,
        candidate: signal.candidate,
        timestamp: Date.now(),
      },
    );

    return { event: 'ack', data: { ok: true } };
  }

  /**
   * Fans an ephemeral typing flag out to the other members of a chat.
   *
   * Nothing is persisted: "is typing" only means anything while the socket is
   * open, and a dropped stop frame self-heals because the client expires the
   * indicator on its own after a few seconds.
   */
  @SubscribeMessage('chat.typing')
  async handleTyping(@ConnectedSocket() client: any, @MessageBody() body: any) {
    const userId = client.userId;
    const data = body?.payload ?? body?.data ?? body;
    const chatId = data?.chatId;

    if (!userId || !chatId) {
      return { event: 'error', data: { message: 'Invalid typing payload' } };
    }

    const memberIds = await this.getChatMemberIds(chatId);
    if (!memberIds.includes(userId)) {
      // Never relay a typing flag for a chat the sender is not part of.
      return { event: 'ack', data: { ok: false } };
    }

    // An account that hid its typing status stays silent.
    if (!(await this.privacy.showsTypingStatus(userId))) {
      return { event: 'ack', data: { ok: false } };
    }

    const isTyping = data.isTyping !== false;
    const event = isTyping
      ? RealtimeEvent.CHAT_TYPING_START
      : RealtimeEvent.CHAT_TYPING_STOP;

    for (const memberId of memberIds) {
      if (memberId === userId) continue;
      this.emitToUser(memberId, event, {
        chatId,
        userId,
        timestamp: Date.now(),
      });
    }

    return { event: 'ack', data: { ok: true } };
  }

  private async getChatMemberIds(chatId: string): Promise<string[]> {
    const members = await this.prisma.chatMember.findMany({
      where: { chatId },
      select: { userId: true },
    });
    return members.map((member) => member.userId);
  }

  /**
   * Builds the wire envelope for every outbound event.
   *
   * Centralised so the protocol version is stamped in exactly one place: a new
   * field on `IRealtimeMessage` must never be forgotten on one of the three
   * send paths (handshake ack, targeted emit, broadcast).
   */
  private envelope(
    event: RealtimeEvent | string,
    payload: any,
    extra: { sequenceId?: number; timestamp?: number } = {},
  ): string {
    return JSON.stringify({
      event,
      payload,
      timestamp: extra.timestamp ?? Date.now(),
      version: REALTIME_PROTOCOL_VERSION,
      ...(extra.sequenceId !== undefined ? { sequenceId: extra.sequenceId } : {}),
    });
  }

  private sendToConnections(userId: string, message: string) {
    const connections = this.userConnections.get(userId);
    if (!connections) return;

    for (const conn of connections) {
      if (conn.ws.readyState === 1) {
        conn.ws.send(message);
      }
    }
  }

  /**
   * Delivers an event to every open socket of a user.
   *
   * Durable events are first written to the user's replay log, which also
   * allocates their sequence id; this happens even when the user has no open
   * socket, so an offline device finds the event through `GET /sync` once it
   * reconnects. Ephemeral events (typing, call signalling, presence) are only
   * sent to sockets that are open right now.
   */
  emitToUser(userId: string, event: RealtimeEvent | string, payload: any) {
    if (!isDurableRealtimeEvent(event)) {
      this.sendToConnections(userId, this.envelope(event, payload));
      return;
    }

    void this.emitDurable(userId, event, payload);
  }

  private async emitDurable(userId: string, event: string, payload: any) {
    const timestamp = Date.now();

    try {
      const sequenceId = await this.eventLog.append(userId, event, payload, timestamp);
      this.sendToConnections(userId, this.envelope(event, payload, { sequenceId, timestamp }));
    } catch (err) {
      // Redis is down: still deliver live so online users keep working. Without
      // a sequence id the client cannot detect that this event was replayable.
      this.logger.warn(`Event log unavailable, sending ${event} unsequenced: ${err}`);
      this.sendToConnections(userId, this.envelope(event, payload, { timestamp }));
    }
  }

  broadcast(event: RealtimeEvent | string, payload: any) {
    const message = this.envelope(event, payload);

    this.server.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }
}
