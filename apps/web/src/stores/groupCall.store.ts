import { create } from 'zustand';
import { api } from '../lib/api';

export interface GroupCallView {
  id: string;
  chatId: string;
  startedById: string;
  withVideo: boolean;
  endedAt: string | null;
  participants: { userId: string; user: { firstName?: string; lastName?: string | null } | null }[];
}

export interface GroupCallSession {
  callId: string;
  chatId: string;
  url: string;
  token: string;
  withVideo: boolean;
}

interface GroupCallState {
  /** The running call of each chat the user looked at; `null` when none is running. */
  byChat: Record<string, GroupCallView | null>;
  configured: Record<string, boolean>;
  session: GroupCallSession | null;
  setCall: (chatId: string, call: GroupCallView | null) => void;
  load: (chatId: string) => Promise<void>;
  start: (chatId: string, withVideo: boolean) => Promise<void>;
  join: (callId: string) => Promise<void>;
  leave: () => Promise<void>;
  end: () => Promise<void>;
}

interface JoinResponse {
  call: GroupCallView;
  url: string;
  token: string;
}

const toSession = (r: JoinResponse): GroupCallSession => ({
  callId: r.call.id,
  chatId: r.call.chatId,
  url: r.url,
  token: r.token,
  withVideo: r.call.withVideo,
});

export const useGroupCallStore = create<GroupCallState>((set, get) => ({
  byChat: {},
  configured: {},
  session: null,

  setCall: (chatId, call) =>
    set((s) => ({ byChat: { ...s.byChat, [chatId]: call && !call.endedAt ? call : null } })),

  load: async (chatId) => {
    try {
      const res = await api.get<{ configured: boolean; call: GroupCallView | null }>(`/chats/${chatId}/group-call`);
      set((s) => ({ configured: { ...s.configured, [chatId]: res.configured }, byChat: { ...s.byChat, [chatId]: res.call } }));
    } catch {
      set((s) => ({ configured: { ...s.configured, [chatId]: false } }));
    }
  },

  start: async (chatId, withVideo) => {
    const res = await api.post<JoinResponse>(`/chats/${chatId}/group-call`, { withVideo });
    get().setCall(chatId, res.call);
    set({ session: toSession(res) });
  },

  join: async (callId) => {
    const res = await api.post<JoinResponse>(`/group-calls/${callId}/join`, {});
    get().setCall(res.call.chatId, res.call);
    set({ session: toSession(res) });
  },

  leave: async () => {
    const session = get().session;
    set({ session: null });
    if (session) await api.post(`/group-calls/${session.callId}/leave`, {}).catch(() => undefined);
  },

  end: async () => {
    const session = get().session;
    set({ session: null });
    if (session) await api.post(`/group-calls/${session.callId}/end`, {}).catch(() => undefined);
  },
}));
