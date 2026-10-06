import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TestUser,
  api,
  createUser,
  openPrivateChat,
  openSocket,
  removeUser,
  resetRateLimits,
  sendText,
  waitFor,
} from './helpers';

/**
 * Another account's profile must only be shown through their privacy switches.
 * Chats, message history, search and realtime events all embed that profile,
 * so each of them is checked, not just the profile endpoint.
 */
describe('privacy switches apply wherever a profile is embedded', () => {
  let hidden: TestUser; // hides everything
  let viewer: TestUser;
  let chatId: string;

  const SECRET_BIO = 'bio that must stay private';
  const FORBIDDEN_KEYS = ['role', 'isBlocked', 'privacySettings', 'deletedAt', 'emails', 'phones'];

  const expectNoLeak = (profile: any) => {
    expect(profile).toBeTruthy();
    expect(profile.bio ?? null).toBeNull();
    expect(profile.avatarUrl ?? null).toBeNull();
    expect(profile.lastSeenAt ?? null).toBeNull();
    expect(profile.presence).toBe('OFFLINE');
    for (const key of FORBIDDEN_KEYS) expect(profile).not.toHaveProperty(key);
  };

  beforeAll(async () => {
    await resetRateLimits();
    hidden = await createUser('priv_h');
    viewer = await createUser('priv_v');

    await api('PATCH', '/users/me', { bio: SECRET_BIO }, hidden.token);
    const flags = await api(
      'PATCH',
      '/users/me/privacy',
      { showBio: false, showProfilePhoto: false, showLastSeen: false, showOnlineStatus: false },
      hidden.token,
    );
    expect(flags.status).toBe(200);

    chatId = await openPrivateChat(viewer.token, hidden.id);
    await sendText(hidden.token, chatId, 'findable privacy message');
  });

  afterAll(async () => {
    await removeUser(hidden);
    await removeUser(viewer);
  });

  const hiddenMember = (chat: any) => chat.members.find((m: any) => m.userId === hidden.id)?.user;

  it('hides the profile in the chat list', async () => {
    const list = await api('GET', '/chats', undefined, viewer.token);
    const chat = list.json.items.find((c: any) => c.id === chatId);
    expectNoLeak(hiddenMember(chat));
  });

  it('hides the profile in a single chat', async () => {
    const chat = await api('GET', `/chats/${chatId}`, undefined, viewer.token);
    expectNoLeak(hiddenMember(chat.json));
  });

  it('hides the sender in message history', async () => {
    const history = await api('GET', `/chats/${chatId}/messages`, undefined, viewer.token);
    const message = history.json.items.find((m: any) => m.senderId === hidden.id);
    expectNoLeak(message.sender);
  });

  it('hides the sender in message search and chat search', async () => {
    const messages = await api('GET', '/search/messages?q=findable', undefined, viewer.token);
    expectNoLeak(messages.json.items[0].sender);

    const chats = await api('GET', '/search/chats?q=priv', undefined, viewer.token);
    // A private chat has no title, so search may legitimately return nothing; if it
    // does return the chat, the member profile must still be filtered.
    for (const chat of chats.json.items) {
      const member = hiddenMember(chat);
      if (member) expectNoLeak(member);
    }
  });

  it('hides the sender in the realtime message event', async () => {
    const socket = await openSocket(viewer.token);
    await sendText(hidden.token, chatId, 'live privacy message');

    const frame = await waitFor(() =>
      socket.frames.find(
        (f) => f.event === 'message.new' && f.payload.message.content === 'live privacy message',
      ),
    );
    socket.close();

    expect(frame).toBeDefined();
    expectNoLeak(frame.payload.message.sender);
  });

  it('still shows the owner their own full profile', async () => {
    // "Online" only exists while a socket is open.
    const socket = await openSocket(hidden.token);
    await waitFor(() => socket.frames.find((f) => f.event === 'connection.authenticated'));

    const history = await api('GET', `/chats/${chatId}/messages`, undefined, hidden.token);
    socket.close();
    const mine = history.json.items.find((m: any) => m.senderId === hidden.id);

    expect(mine.sender.bio).toBe(SECRET_BIO);
    expect(mine.sender.presence).toBe('ONLINE');
  });

  it('shows the profile again once the owner stops hiding it', async () => {
    await api('PATCH', '/users/me/privacy', { showBio: true }, hidden.token);

    const history = await api('GET', `/chats/${chatId}/messages`, undefined, viewer.token);
    const message = history.json.items.find((m: any) => m.senderId === hidden.id);
    expect(message.sender.bio).toBe(SECRET_BIO);
  });
});
