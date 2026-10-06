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

const entry = (list: any, chatId: string) => list.json.items.find((c: any) => c.id === chatId);

describe('unread counters and the read cursor', () => {
  let alice: TestUser;
  let bob: TestUser;
  let chatId: string;
  let ids: string[];

  beforeAll(async () => {
    await resetRateLimits();
    alice = await createUser('rd_a');
    bob = await createUser('rd_b');
    chatId = await openPrivateChat(alice.token, bob.id);
    ids = [];
    for (const text of ['one', 'two', 'three']) {
      ids.push((await sendText(alice.token, chatId, text)).json.id);
    }
  });

  afterAll(async () => {
    await removeUser(alice);
    await removeUser(bob);
  });

  it('shows the last message and counts only other people’s unread messages', async () => {
    const forBob = entry(await api('GET', '/chats', undefined, bob.token), chatId);
    expect(forBob.lastMessage.content).toBe('three');
    expect(forBob.unreadCount).toBe(3);

    const forAlice = entry(await api('GET', '/chats', undefined, alice.token), chatId);
    expect(forAlice.unreadCount).toBe(0);
    expect(forAlice).not.toHaveProperty('messages');
  });

  it('marks everything up to a message as read and moves the counter', async () => {
    const aliceSocket = await openSocket(alice.token);
    const bobSocket = await openSocket(bob.token);
    await wait(300);

    const response = await api('POST', `/chats/${chatId}/messages/read`, { upToMessageId: ids[1] }, bob.token);
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ read: true, count: 2, unreadCount: 1 });

    // The sender sees read receipts; the reader's own device gets the new counter.
    const receipt = await waitFor(() => aliceSocket.frames.find((f) => f.event === 'message.read'));
    expect(receipt?.payload.messageIds.sort()).toEqual([ids[0], ids[1]].sort());
    expect(receipt?.payload.unreadCount).toBeUndefined();

    const own = await waitFor(() => bobSocket.frames.find((f) => f.event === 'message.read'));
    expect(own?.payload.unreadCount).toBe(1);
    aliceSocket.close();
    bobSocket.close();

    const list = entry(await api('GET', '/chats', undefined, bob.token), chatId);
    expect(list.unreadCount).toBe(1);
  });

  it('never moves the cursor backwards', async () => {
    await api('POST', `/chats/${chatId}/messages/read`, { upToMessageId: ids[2] }, bob.token);
    expect(entry(await api('GET', '/chats', undefined, bob.token), chatId).unreadCount).toBe(0);

    await api('POST', `/chats/${chatId}/messages/read`, { upToMessageId: ids[0] }, bob.token);
    expect(entry(await api('GET', '/chats', undefined, bob.token), chatId).unreadCount).toBe(0);
  });

  it('shows the sender which of their messages were read, even after a reload', async () => {
    const history = await api('GET', `/chats/${chatId}/messages`, undefined, alice.token);
    const byId = new Map(history.json.items.map((m: any) => [m.id, m]));

    expect(ids.map((id) => (byId.get(id) as any).status)).toEqual(['READ', 'READ', 'READ']);
    expect(history.json.items.every((m: any) => !('readReceipts' in m))).toBe(true);

    const preview = entry(await api('GET', '/chats', undefined, alice.token), chatId).lastMessage;
    expect(preview.status).toBe('READ');
  });

  it('counts a new message as unread again, but not a deleted one', async () => {
    const fresh = (await sendText(alice.token, chatId, 'four')).json.id;
    expect(entry(await api('GET', '/chats', undefined, bob.token), chatId).unreadCount).toBe(1);

    await api('DELETE', `/chats/${chatId}/messages/${fresh}?forAll=true`, undefined, alice.token);
    const after = entry(await api('GET', '/chats', undefined, bob.token), chatId);
    expect(after.unreadCount).toBe(0);
    expect(after.lastMessage.content).toBe('three');
  });

  it('ignores your own messages and ids from elsewhere when marking read', async () => {
    const own = (await sendText(bob.token, chatId, 'mine')).json.id;
    const response = await api('POST', `/chats/${chatId}/messages/read`, { messageIds: [own, crypto.randomUUID()] }, bob.token);
    expect(response.json.count).toBe(0);
  });

  it('requires a target and validates ids', async () => {
    const none = await api('POST', `/chats/${chatId}/messages/read`, {}, bob.token);
    expect(none.status).toBe(400);
    expect(none.json.code).toBe('READ_TARGET_REQUIRED');

    const bad = await api('POST', `/chats/${chatId}/messages/read`, { messageIds: ['nope'] }, bob.token);
    expect(bad.status).toBe(400);
  });

  it('keeps receipts private when the reader hides them, yet syncs the reader’s own devices', async () => {
    await api('PATCH', '/users/me/privacy', { showReadReceipts: false }, bob.token);
    const next = (await sendText(alice.token, chatId, 'quiet read')).json.id;

    const aliceSocket = await openSocket(alice.token);
    const bobSocket = await openSocket(bob.token);
    await wait(300);

    await api('POST', `/chats/${chatId}/messages/read`, { upToMessageId: next }, bob.token);
    await wait(500);

    expect(aliceSocket.frames.some((f) => f.event === 'message.read')).toBe(false);
    expect(bobSocket.frames.some((f) => f.event === 'message.read' && f.payload.unreadCount === 0)).toBe(true);
    aliceSocket.close();
    bobSocket.close();

    // Nor does the stored status give it away on the sender's next load.
    const history = await api('GET', `/chats/${chatId}/messages`, undefined, alice.token);
    expect(history.json.items.find((m: any) => m.id === next).status).not.toBe('READ');
  });

  it('refuses people who are not in the chat', async () => {
    const outsider = await createUser('rd_o');
    const response = await api('POST', `/chats/${chatId}/messages/read`, { upToMessageId: ids[0] }, outsider.token);
    expect(response.status).toBe(403);
    await removeUser(outsider);
  });
});

describe('pinning and archiving chats', () => {
  let owner: TestUser;
  let peers: TestUser[];
  let chats: string[];

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('org_o');
    peers = [];
    chats = [];
    for (let i = 0; i < 3; i++) {
      const peer = await createUser(`org_p${i}`);
      peers.push(peer);
      const id = await openPrivateChat(owner.token, peer.id);
      chats.push(id);
      await sendText(peer.token, id, `hello ${i}`);
      await wait(30);
    }
  });

  afterAll(async () => {
    await removeUser(owner);
    for (const peer of peers) await removeUser(peer);
  });

  const order = async (query = '') =>
    (await api('GET', `/chats${query}`, undefined, owner.token)).json.items.map((c: any) => c.id);

  it('lists the newest conversation first', async () => {
    expect(await order()).toEqual([chats[2], chats[1], chats[0]]);
  });

  it('puts a pinned chat first without touching anybody else’s list, and pushes it to the owner’s devices', async () => {
    const socket = await openSocket(owner.token);
    await wait(300);

    const pinned = await api('PATCH', `/chats/${chats[0]}/pin`, { isPinned: true }, owner.token);
    expect(pinned.json).toEqual({ isPinned: true });
    expect(await order()).toEqual([chats[0], chats[2], chats[1]]);

    const pushed = await waitFor(() =>
      socket.frames.find((f) => f.event === 'chat.updated' && f.payload.id === chats[0] && f.payload.isPinned),
    );
    expect(pushed).toBeDefined();
    socket.close();

    // The other person's list is unaffected: pinning is personal.
    const theirs = (await api('GET', '/chats', undefined, peers[0]!.token)).json.items[0];
    expect(theirs.isPinned).toBe(false);
  });

  it('caps pinned chats at 10', async () => {
    // Groups of two need no extra accounts, which keeps registrations low.
    const extra: string[] = [];
    for (let i = 0; i < 10; i++) {
      const group = await api(
        'POST',
        '/chats/group',
        { title: `cap ${i}`, memberIds: [peers[0]!.id] },
        owner.token,
      );
      extra.push(group.json.id);
    }

    let rejected: any;
    for (const id of extra) {
      const response = await api('PATCH', `/chats/${id}/pin`, { isPinned: true }, owner.token);
      if (response.status === 400) {
        rejected = response;
        break;
      }
    }
    expect(rejected.json.code).toBe('PINNED_CHATS_LIMIT');
  });

  it('moves an archived chat out of the main list and unpins it', async () => {
    const archived = await api('PATCH', `/chats/${chats[0]}/archive`, { isArchived: true }, owner.token);
    expect(archived.json).toEqual({ isArchived: true });

    expect(await order()).not.toContain(chats[0]);
    expect(await order('?archived=true')).toEqual([chats[0]]);

    const entryNow = (await api('GET', '/chats?archived=true', undefined, owner.token)).json.items[0];
    expect(entryNow.isPinned).toBe(false);

    await api('PATCH', `/chats/${chats[0]}/archive`, { isArchived: false }, owner.token);
    expect(await order()).toContain(chats[0]);
  });

  it('keeps counting unread messages while a chat is archived', async () => {
    await api('PATCH', `/chats/${chats[1]}/archive`, { isArchived: true }, owner.token);
    await sendText(peers[1]!.token, chats[1], 'still talking');

    const archivedList = (await api('GET', '/chats?archived=true', undefined, owner.token)).json.items;
    expect(archivedList.find((c: any) => c.id === chats[1]).unreadCount).toBeGreaterThan(0);
  });

  it('does not let strangers pin or archive', async () => {
    const stranger = peers[2]!;
    expect((await api('PATCH', `/chats/${chats[0]}/pin`, { isPinned: true }, stranger.token)).status).toBe(404);
    expect((await api('PATCH', `/chats/${chats[0]}/archive`, { isArchived: true }, stranger.token)).status).toBe(404);
  });
});

describe('chat folders', () => {
  let owner: TestUser;
  let other: TestUser;
  let peer: TestUser;
  let chatA: string;
  let chatB: string;
  let foreign: string;

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('fol_o');
    other = await createUser('fol_x');
    peer = await createUser('fol_p');
    chatA = await openPrivateChat(owner.token, peer.id);
    const second = await createUser('fol_q');
    chatB = await openPrivateChat(owner.token, second.id);
    foreign = await openPrivateChat(other.token, peer.id);
    await removeUser(second);
  });

  afterAll(async () => {
    await removeUser(owner);
    await removeUser(other);
    await removeUser(peer);
  });

  let folderId: string;

  it('creates a folder with chats and lists it', async () => {
    const socket = await openSocket(owner.token);
    await wait(300);

    const created = await api('POST', '/folders', { name: '  Work  ', chatIds: [chatA] }, owner.token);
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ name: 'Work', chatIds: [chatA] });
    folderId = created.json.id;

    const pushed = await waitFor(() => socket.frames.find((f) => f.event === 'folder.updated'));
    expect(pushed?.payload.items.map((f: any) => f.id)).toContain(folderId);
    expect(typeof pushed?.sequenceId).toBe('number');
    socket.close();

    const list = await api('GET', '/folders', undefined, owner.token);
    expect(list.json.items).toHaveLength(1);
  });

  it('filters the chat list by folder', async () => {
    const inside = (await api('GET', `/chats?folderId=${folderId}`, undefined, owner.token)).json.items;
    expect(inside.map((c: any) => c.id)).toEqual([chatA]);
  });

  it('replaces the chats of a folder and renames it', async () => {
    const updated = await api('PATCH', `/folders/${folderId}`, { name: 'Home', chatIds: [chatB] }, owner.token);
    expect(updated.json).toMatchObject({ name: 'Home', chatIds: [chatB] });
  });

  it('rejects chats the owner is not in', async () => {
    const response = await api('PATCH', `/folders/${folderId}`, { chatIds: [foreign] }, owner.token);
    expect(response.status).toBe(400);
    expect(response.json.code).toBe('FOLDER_CHAT_NOT_FOUND');
  });

  it('keeps folders private to their owner', async () => {
    expect((await api('GET', '/folders', undefined, other.token)).json.items).toEqual([]);
    expect((await api('PATCH', `/folders/${folderId}`, { name: 'Mine' }, other.token)).status).toBe(404);
    expect((await api('DELETE', `/folders/${folderId}`, undefined, other.token)).status).toBe(404);
    expect((await api('GET', `/chats?folderId=${folderId}`, undefined, other.token)).status).toBe(404);
  });

  it('validates names and caps the number of folders', async () => {
    expect((await api('POST', '/folders', { name: '   ' }, owner.token)).status).toBe(400);
    expect((await api('POST', '/folders', { name: 'x'.repeat(33) }, owner.token)).status).toBe(400);

    let limited: any;
    for (let i = 0; i < 12 && !limited; i++) {
      const response = await api('POST', '/folders', { name: `f${i}` }, owner.token);
      if (response.status === 400) limited = response;
    }
    expect(limited.json.code).toBe('FOLDER_LIMIT_REACHED');
  });

  it('reorders and deletes folders', async () => {
    const all = (await api('GET', '/folders', undefined, owner.token)).json.items;
    const reversed = all.map((f: any) => f.id).reverse();

    const reordered = await api('PUT', '/folders/order', { folderIds: reversed }, owner.token);
    expect(reordered.json.items.map((f: any) => f.id)).toEqual(reversed);

    expect((await api('DELETE', `/folders/${folderId}`, undefined, owner.token)).json).toEqual({ deleted: true });
    const rest = (await api('GET', '/folders', undefined, owner.token)).json.items;
    expect(rest.some((f: any) => f.id === folderId)).toBe(false);
  });
});
