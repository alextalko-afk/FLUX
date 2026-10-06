import { useChatsStore } from './chats.store';
import { useAuthStore } from './auth.store';
import { create } from 'zustand';

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  type: string;
  content: string;
  createdAt: string;
  status: string;
  isEdited: boolean;
  isDeleted: boolean;
  sender?: { id: string; firstName: string; lastName?: string | null; avatarUrl?: string | null };
  replyTo?: any;
  reactions?: any[];
}

export interface HistoryPaging {
  /** Cursor of the next older page, or null when the whole history is loaded. */
  cursor: string | null;
  /** How many older messages were prepended, which drives the list's first index. */
  prepended: number;
}

interface MessagesState {
  paging: Record<string, HistoryPaging>;
  setPaging: (chatId: string, paging: HistoryPaging) => void;
  messagesByChat: Record<string, Message[]>;
  isLoading: Record<string, boolean>;
  setMessages: (chatId: string, messages: Message[]) => void;
  prependMessages: (chatId: string, messages: Message[]) => void;
  addMessage: (chatId: string, message: Message) => void;
  updateMessage: (chatId: string, messageId: string, updates: Partial<Message>) => void;
  removeMessage: (chatId: string, messageId: string) => void;
  handleIncomingMessage: (payload: any) => void;
  handleMessageUpdated: (payload: any) => void;
  handleMessageDeleted: (payload: any) => void;
  handleMessageRead: (payload: any) => void;
  setLoading: (chatId: string, loading: boolean) => void;
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  paging: {},
  setPaging: (chatId, paging) =>
    set((state) => ({ paging: { ...state.paging, [chatId]: paging } })),
  messagesByChat: {},
  isLoading: {},

  setMessages: (chatId, messages) =>
    set((state) => ({
      messagesByChat: { ...state.messagesByChat, [chatId]: messages },
    })),

  prependMessages: (chatId, messages) =>
    set((state) => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatId]: [...messages, ...(state.messagesByChat[chatId] || [])],
      },
    })),

  addMessage: (chatId, message) =>
    set((state) => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatId]: [...(state.messagesByChat[chatId] || []), message],
      },
    })),

  updateMessage: (chatId, messageId, updates) =>
    set((state) => {
      const list = state.messagesByChat[chatId] || [];
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: list.map((m) => (m.id === messageId ? { ...m, ...updates } : m)),
        },
      };
    }),

  removeMessage: (chatId, messageId) =>
    set((state) => {
      const list = state.messagesByChat[chatId] || [];
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: list.filter((m) => m.id !== messageId),
        },
      };
    }),

  handleIncomingMessage: (payload) => {
    const { chatId, message, isSelf, clientTempId } = payload;
    const { messagesByChat } = get();
    const list = messagesByChat[chatId] || [];

    // The chat list's preview, order and unread counter follow every message,
    // including the ones whose bubble is already on screen.
    useChatsStore.getState().applyIncomingMessage(chatId, message, Boolean(isSelf));

    // Already delivered (e.g. the REST response won the race).
    if (list.some((m) => m.id === message.id)) return;

    // The event acknowledges our optimistic copy: replace it in place so the
    // same message never shows up twice.
    if (clientTempId && list.some((m) => m.id === clientTempId)) {
      get().updateMessage(chatId, clientTempId, { ...message, status: 'SENT' });
      return;
    }

    get().addMessage(chatId, message);
  },

  handleMessageUpdated: (payload) => {
    const { chatId, message, messageId, reactions, poll, commentsCount, location } = payload;
    if (message) {
      get().updateMessage(chatId, message.id, message);
    } else if (messageId && reactions) {
      get().updateMessage(chatId, messageId, { reactions });
    } else if (messageId && location) {
      get().updateMessage(chatId, messageId, { location } as any);
    } else if (messageId && commentsCount !== undefined) {
      get().updateMessage(chatId, messageId, { commentsCount } as any);
    } else if (messageId && poll) {
      get().updateMessage(chatId, messageId, { poll } as any);
    }
  },

  handleMessageDeleted: (payload) => {
    const { chatId, messageId } = payload;
    get().removeMessage(chatId, messageId);
  },

  handleMessageRead: (payload) => {
    const { chatId, messageIds, userId, unreadCount } = payload;

    // Our own read marker, possibly from another of our devices: it only
    // changes the unread counter. Ticks are for messages *others* have read.
    if (userId && userId === useAuthStore.getState().user?.id) {
      if (typeof unreadCount === 'number') {
        useChatsStore.getState().setUnreadCount(chatId, unreadCount);
      }
      return;
    }

    useChatsStore.getState().markLastMessageRead(chatId, messageIds);

    const list = get().messagesByChat[chatId] || [];
    const updates = list.map((m) =>
      messageIds.includes(m.id) ? { ...m, status: 'READ' } : m,
    );
    set((state) => ({
      messagesByChat: { ...state.messagesByChat, [chatId]: updates },
    }));
  },

  setLoading: (chatId, loading) =>
    set((state) => ({
      isLoading: { ...state.isLoading, [chatId]: loading },
    })),
}));
