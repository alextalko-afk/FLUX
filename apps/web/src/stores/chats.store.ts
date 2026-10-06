import { create } from 'zustand';

export interface ChatListItem {
  id: string;
  type: string;
  title: string | null;
  avatarUrl: string | null;
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    createdAt: string;
    type?: string;
    status?: string;
    sender?: { firstName: string; lastName?: string | null };
  } | null;
  unreadCount: number;
  members: { userId: string; user?: any; role?: string; isMuted?: boolean }[];
  updatedAt: string;
  /** Pinned/archived/muted are the signed-in user's own choices for this chat. */
  isPinned?: boolean;
  pinnedAt?: string | null;
  isArchived?: boolean;
  isMuted?: boolean;
}

interface ChatsState {
  chats: ChatListItem[];
  activeChatId: string | null;
  isLoading: boolean;
  setChats: (chats: ChatListItem[]) => void;
  setActiveChatId: (id: string | null) => void;
  handleChatUpsert: (chat: ChatListItem) => void;
  handleChatDeleted: (payload: { chatId: string }) => void;
  updateUnreadCount: (chatId: string, delta: number) => void;
  resetUnreadCount: (chatId: string) => void;
  setUnreadCount: (chatId: string, count: number) => void;
  /** Someone read our messages: tick the preview if it is one of them. */
  markLastMessageRead: (chatId: string, messageIds: string[]) => void;
  /** A message arrived (or was sent): refresh the preview, bump the chat, count it as unread if it is not ours. */
  applyIncomingMessage: (chatId: string, message: any, isSelf: boolean) => void;
}

const activityTime = (chat: ChatListItem) =>
  new Date(chat.lastMessage?.createdAt ?? chat.updatedAt).getTime() || 0;

/**
 * Pinned chats first (most recently pinned on top), then everything else by
 * latest activity. The server returns the same order; this keeps it while
 * messages arrive without a refetch.
 */
export function sortChats(chats: ChatListItem[]): ChatListItem[] {
  return [...chats].sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
    if (a.isPinned && b.isPinned) {
      return (new Date(b.pinnedAt ?? 0).getTime() || 0) - (new Date(a.pinnedAt ?? 0).getTime() || 0);
    }
    return activityTime(b) - activityTime(a);
  });
}

export const useChatsStore = create<ChatsState>((set, get) => ({
  chats: [],
  activeChatId: null,
  isLoading: false,

  setChats: (chats) => set({ chats }),
  setActiveChatId: (id) => set({ activeChatId: id }),

  handleChatUpsert: (chat) => {
    const { chats } = get();

    // Moving a chat to the archive removes it from the main list; the archive
    // view loads its own list from the server.
    if (chat.isArchived === true) {
      set({ chats: chats.filter((c) => c.id !== chat.id) });
      return;
    }

    const existing = chats.find((c) => c.id === chat.id);
    if (existing) {
      set({ chats: sortChats(chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c))) });
    } else {
      // A chat announced by an event may not carry list-only fields yet.
      const fresh = { ...chat, unreadCount: chat.unreadCount ?? 0, lastMessage: chat.lastMessage ?? null };
      set({ chats: sortChats([fresh, ...chats]) });
    }
  },

  handleChatDeleted: (payload) => {
    set({ chats: get().chats.filter((c) => c.id !== payload.chatId) });
  },

  updateUnreadCount: (chatId, delta) => {
    set({
      chats: get().chats.map((c) =>
        c.id === chatId ? { ...c, unreadCount: Math.max(0, c.unreadCount + delta) } : c,
      ),
    });
  },

  resetUnreadCount: (chatId) => {
    set({
      chats: get().chats.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)),
    });
  },

  setUnreadCount: (chatId, count) => {
    set({
      chats: get().chats.map((c) => (c.id === chatId ? { ...c, unreadCount: count } : c)),
    });
  },

  markLastMessageRead: (chatId, messageIds) => {
    set({
      chats: get().chats.map((c) =>
        c.id === chatId && c.lastMessage && messageIds.includes(c.lastMessage.id)
          ? { ...c, lastMessage: { ...c.lastMessage, status: 'READ' } }
          : c,
      ),
    });
  },

  applyIncomingMessage: (chatId, message, isSelf) => {
    const { chats } = get();
    if (!chats.some((c) => c.id === chatId)) return;

    set({
      chats: sortChats(
        chats.map((c) =>
          c.id === chatId
            ? {
                ...c,
                lastMessage: {
                  id: message.id,
                  content: message.content,
                  senderId: message.senderId,
                  createdAt: message.createdAt,
                  type: message.type,
                  status: message.status,
                  sender: message.sender,
                },
                updatedAt: message.createdAt ?? new Date().toISOString(),
                unreadCount: isSelf ? c.unreadCount : c.unreadCount + 1,
              }
            : c,
        ),
      ),
    });
  },
}));

/** Chat type (`PRIVATE`, `SECRET`, ...) of a chat already loaded into the store. */
/** True for a group whose messages are end-to-end encrypted. */
export function isE2eeChat(chatId: string): boolean {
  return Boolean((useChatsStore.getState().chats.find((c) => c.id === chatId) as { e2ee?: boolean } | undefined)?.e2ee);
}

export function getChatType(chatId: string): string | undefined {
  return useChatsStore.getState().chats.find((c) => c.id === chatId)?.type;
}
