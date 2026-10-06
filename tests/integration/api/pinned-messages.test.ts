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
  wait,
  waitFor,
} from './helpers';

describe('pinned messages', () => {
  let alice: TestUser;
  let bob: TestUser;
  let outsider: TestUser;
  let dm: string;
  let group: string;

  const messageId = async (token: string, chatId: string, text: string) =>
    (await sendText(token, chatId, text)).json.id as string;

  beforeAll(async () => {
    await resetRateLimits();
    alice = await createUser('pin_a');
    bob = await createUser('pin_b');
    outsider = await createUser('pin_o');
    dm = await openPrivateChat(alice.token, bob.id);

    const created = await api('POST', '/chats/group', { title: 'Pins', memberIds: [bob.id] }, alice.token);
    group = created.json.id;
  });

  afterAll(async () => {
    await removeUser(alice);
    await removeUser(bob);
    await removeUser(outsider);
  });

  it('lets either member pin and unpin in a private chat, and lists the pin', async () => {
    const id = await messageId(alice.token, dm, 'remember this');

    const pin = await api('POST', `/chats/${dm}/messages/${id}/pin`, undefined, bob.token);
    expect(pin.status).toBe(200);
    expect(pin.json).toEqual({ pinned: true });

    const list = await api('GET', `/chats/${dm}/messages/pinned`, undefined, alice.token);
    expect(list.json.items).toHaveLength(1);
    expect(list.json.items[0].message.id).toBe(id);
    expect(list.json.items[0].message.sender.firstName).toBe('pin_a');
    expect(list.json.items[0].pinnedById).toBe(bob.id);

    const history = await api('GET', `/chats/${dm}/messages`, undefined, alice.token);
    expect(history.json.items.find((m: any) => m.id === id).pin).toBeTruthy();

    const unpin = await api('DELETE', `/chats/${dm}/messages/${id}/pin`, undefined, alice.token);
    expect(unpin.json).toEqual({ pinned: false });
    const after = await api('GET', `/chats/${dm}/messages/pinned`, undefined, alice.token);
    expect(after.json.items).toHaveLength(0);
  });

  it('is idempotent: pinning twice keeps one pin and sends one event', async () => {
    const id = await messageId(alice.token, dm, 'twice');
    const socket = await openSocket(bob.token);
    await wait(200);

    await api('POST', `/chats/${dm}/messages/${id}/pin`, undefined, alice.token);
    await api('POST', `/chats/${dm}/messages/${id}/pin`, undefined, alice.token);
    await wait(400);

    const events = socket.frames.filter((f) => f.event === 'message.pin.updated');
    socket.close();
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ chatId: dm, messageId: id, isPinned: true });
    expect(typeof events[0].sequenceId).toBe('number'); // durable: replayable after reconnect

    const list = await api('GET', `/chats/${dm}/messages/pinned`, undefined, alice.token);
    expect(list.json.items.filter((p: any) => p.message.id === id)).toHaveLength(1);
  });

  it('only lets administrators pin in a group', async () => {
    const id = await messageId(alice.token, group, 'announcement');

    const byMember = await api('POST', `/chats/${group}/messages/${id}/pin`, undefined, bob.token);
    expect(byMember.status).toBe(403);
    expect(byMember.json.code).toBe('PIN_NOT_ALLOWED');

    const byOwner = await api('POST', `/chats/${group}/messages/${id}/pin`, undefined, alice.token);
    expect(byOwner.status).toBe(200);

    // Every member can read the pinned list.
    const asMember = await api('GET', `/chats/${group}/messages/pinned`, undefined, bob.token);
    expect(asMember.json.items).toHaveLength(1);

    const unpinByMember = await api('DELETE', `/chats/${group}/messages/${id}/pin`, undefined, bob.token);
    expect(unpinByMember.status).toBe(403);
  });

  it('hides pins from people outside the chat', async () => {
    const id = await messageId(alice.token, dm, 'private note');

    expect((await api('GET', `/chats/${dm}/messages/pinned`, undefined, outsider.token)).status).toBe(404);
    expect((await api('POST', `/chats/${dm}/messages/${id}/pin`, undefined, outsider.token)).status).toBe(404);
  });

  it('refuses to pin a message from another chat', async () => {
    const other = await messageId(alice.token, group, 'elsewhere');
    const response = await api('POST', `/chats/${dm}/messages/${other}/pin`, undefined, alice.token);
    expect(response.status).toBe(404);
  });

  it('unpins a message when it is deleted for everyone', async () => {
    const id = await messageId(alice.token, dm, 'soon gone');
    await api('POST', `/chats/${dm}/messages/${id}/pin`, undefined, alice.token);

    const socket = await openSocket(bob.token);
    await wait(200);
    await api('DELETE', `/chats/${dm}/messages/${id}?forAll=true`, undefined, alice.token);

    const unpinned = await waitFor(() =>
      socket.frames.find((f) => f.event === 'message.pin.updated' && f.payload.isPinned === false),
    );
    socket.close();
    expect(unpinned?.payload.messageId).toBe(id);

    const list = await api('GET', `/chats/${dm}/messages/pinned`, undefined, bob.token);
    expect(list.json.items.some((p: any) => p.message.id === id)).toBe(false);
  });

  it('caps a chat at 20 pinned messages', async () => {
    const fresh = await openPrivateChat(bob.token, outsider.id);
    const ids: string[] = [];
    for (let i = 0; i < 21; i++) ids.push(await messageId(bob.token, fresh, `pin cap ${i}`));

    for (const id of ids.slice(0, 20)) {
      expect((await api('POST', `/chats/${fresh}/messages/${id}/pin`, undefined, bob.token)).status).toBe(200);
    }

    const over = await api('POST', `/chats/${fresh}/messages/${ids[20]}/pin`, undefined, bob.token);
    expect(over.status).toBe(400);
    expect(over.json.code).toBe('PIN_LIMIT_REACHED');
  });
});
