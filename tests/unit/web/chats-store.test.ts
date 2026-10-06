import { describe, it, expect, beforeEach } from 'vitest';
import {
  sortChats,
  useChatsStore,
  type ChatListItem,
} from '../../../apps/web/src/stores/chats.store';

const chat = (id: string, overrides: Partial<ChatListItem> = {}): ChatListItem => ({
  id,
  type: 'PRIVATE',
  title: id,
  avatarUrl: null,
  lastMessage: null,
  unreadCount: 0,
  members: [],
  updatedAt: '2026-10-05T10:00:00.000Z',
  ...overrides,
});

const at = (iso: string) => ({
  id: `m-${iso}`,
  content: 'x',
  senderId: 'u',
  createdAt: iso,
});

describe('sortChats', () => {
  it('orders unpinned chats by their latest activity', () => {
    const sorted = sortChats([
      chat('old', { lastMessage: at('2026-10-05T09:00:00.000Z') }),
      chat('new', { lastMessage: at('2026-10-05T11:00:00.000Z') }),
      chat('none', { updatedAt: '2026-10-05T10:00:00.000Z' }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['new', 'none', 'old']);
  });

  it('puts pinned chats first, most recently pinned on top, regardless of activity', () => {
    const sorted = sortChats([
      chat('busy', { lastMessage: at('2026-10-05T12:00:00.000Z') }),
      chat('pinnedEarly', { isPinned: true, pinnedAt: '2026-10-01T00:00:00.000Z' }),
      chat('pinnedLate', { isPinned: true, pinnedAt: '2026-10-04T00:00:00.000Z' }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['pinnedLate', 'pinnedEarly', 'busy']);
  });

  it('does not mutate its input', () => {
    const input = [chat('a'), chat('b', { isPinned: true })];
    sortChats(input);
    expect(input.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('chats store', () => {
  beforeEach(() => {
    useChatsStore.setState({ chats: [], activeChatId: null });
  });

  const ids = () => useChatsStore.getState().chats.map((c) => c.id);

  it('shows a new message as the preview, raises the chat and counts it as unread', () => {
    useChatsStore.getState().setChats([
      chat('a', { lastMessage: at('2026-10-05T09:00:00.000Z') }),
      chat('b', { lastMessage: at('2026-10-05T08:00:00.000Z') }),
    ]);

    useChatsStore.getState().applyIncomingMessage('b', {
      id: 'm1',
      content: 'hello',
      senderId: 'other',
      createdAt: '2026-10-05T12:00:00.000Z',
    }, false);

    const state = useChatsStore.getState();
    expect(ids()).toEqual(['b', 'a']);
    expect(state.chats[0]!.lastMessage?.content).toBe('hello');
    expect(state.chats[0]!.unreadCount).toBe(1);
  });

  it('does not count your own message as unread', () => {
    useChatsStore.getState().setChats([chat('a')]);
    useChatsStore.getState().applyIncomingMessage('a', {
      id: 'm1', content: 'mine', senderId: 'me', createdAt: '2026-10-05T12:00:00.000Z',
    }, true);
    expect(useChatsStore.getState().chats[0]!.unreadCount).toBe(0);
  });

  it('ignores messages for chats it has not loaded', () => {
    useChatsStore.getState().setChats([chat('a')]);
    useChatsStore.getState().applyIncomingMessage('zzz', {
      id: 'm', content: 'x', senderId: 'o', createdAt: '2026-10-05T12:00:00.000Z',
    }, false);
    expect(ids()).toEqual(['a']);
  });

  it('removes a chat that was archived and adds one that was moved back', () => {
    useChatsStore.getState().setChats([chat('a'), chat('b')]);

    useChatsStore.getState().handleChatUpsert(chat('a', { isArchived: true }));
    expect(ids()).toEqual(['b']);

    useChatsStore.getState().handleChatUpsert(chat('a', { isArchived: false }));
    expect(ids().sort()).toEqual(['a', 'b']);
  });

  it('re-sorts when a chat is pinned', () => {
    useChatsStore.getState().setChats([
      chat('a', { lastMessage: at('2026-10-05T12:00:00.000Z') }),
      chat('b', { lastMessage: at('2026-10-05T08:00:00.000Z') }),
    ]);
    useChatsStore.getState().handleChatUpsert(
      chat('b', { isPinned: true, pinnedAt: '2026-10-05T13:00:00.000Z' }),
    );
    expect(ids()).toEqual(['b', 'a']);
  });

  it('defaults list-only fields for a chat announced by an event', () => {
    const announced = { ...chat('n'), unreadCount: undefined, lastMessage: undefined } as unknown as ChatListItem;
    useChatsStore.getState().handleChatUpsert(announced);
    expect(useChatsStore.getState().chats[0]).toMatchObject({ unreadCount: 0, lastMessage: null });
  });

  it('sets, clamps and resets the unread counter', () => {
    useChatsStore.getState().setChats([chat('a', { unreadCount: 2 })]);
    useChatsStore.getState().updateUnreadCount('a', -5);
    expect(useChatsStore.getState().chats[0]!.unreadCount).toBe(0);

    useChatsStore.getState().setUnreadCount('a', 7);
    expect(useChatsStore.getState().chats[0]!.unreadCount).toBe(7);

    useChatsStore.getState().resetUnreadCount('a');
    expect(useChatsStore.getState().chats[0]!.unreadCount).toBe(0);
  });

  it('marks the preview as read only when it is one of the read messages', () => {
    useChatsStore.getState().setChats([
      chat('a', { lastMessage: { ...at('2026-10-05T09:00:00.000Z'), id: 'last', status: 'SENT' } }),
    ]);

    useChatsStore.getState().markLastMessageRead('a', ['other']);
    expect(useChatsStore.getState().chats[0]!.lastMessage?.status).toBe('SENT');

    useChatsStore.getState().markLastMessageRead('a', ['last']);
    expect(useChatsStore.getState().chats[0]!.lastMessage?.status).toBe('READ');
  });
});
