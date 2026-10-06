import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TestUser,
  api,
  createUser,
  openPrivateChat,
  openSocket,
  removeUser,
  resetRateLimits,
  wait,
  waitFor,
} from './helpers';

describe('invite links', () => {
  let owner: TestUser;
  let member: TestUser;
  let guest: TestUser;
  let group: string;

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('inv_o');
    member = await createUser('inv_m');
    guest = await createUser('inv_g');

    const created = await api(
      'POST',
      '/chats/group',
      { title: 'Open house', description: 'Everyone welcome', memberIds: [member.id] },
      owner.token,
    );
    group = created.json.id;
  });

  afterAll(async () => {
    await removeUser(owner);
    await removeUser(member);
    await removeUser(guest);
  });

  let token: string;

  it('starts without a link and lets the owner create one', async () => {
    expect((await api('GET', `/chats/${group}/invite-link`, undefined, owner.token)).json.token).toBeNull();

    const created = await api('POST', `/chats/${group}/invite-link`, undefined, owner.token);
    expect(created.status).toBe(200);
    token = created.json.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const read = await api('GET', `/chats/${group}/invite-link`, undefined, owner.token);
    expect(read.json.token).toBe(token);
  });

  it('keeps the link away from ordinary members and from private chats', async () => {
    const asMember = await api('GET', `/chats/${group}/invite-link`, undefined, member.token);
    expect(asMember.status).toBe(403);
    expect(asMember.json.code).toBe('INVITE_NOT_ALLOWED');
    expect((await api('POST', `/chats/${group}/invite-link`, undefined, member.token)).status).toBe(403);

    const dm = await openPrivateChat(owner.token, member.id);
    const forDm = await api('POST', `/chats/${dm}/invite-link`, undefined, owner.token);
    expect(forDm.status).toBe(400);
    expect(forDm.json.code).toBe('INVITE_NOT_SUPPORTED');

    expect((await api('GET', `/chats/${group}/invite-link`, undefined, guest.token)).status).toBe(404);
  });

  it('previews the chat without revealing its id to an outsider', async () => {
    const preview = await api('GET', `/chats/invite/${token}`, undefined, guest.token);
    expect(preview.status).toBe(200);
    expect(preview.json).toMatchObject({
      type: 'GROUP',
      title: 'Open house',
      description: 'Everyone welcome',
      memberCount: 2,
      alreadyMember: false,
      chatId: null,
    });
  });

  it('lets an outsider join, tells everyone, and is idempotent', async () => {
    const memberSocket = await openSocket(member.token);
    const guestSocket = await openSocket(guest.token);
    await wait(300);

    const joined = await api('POST', `/chats/invite/${token}/join`, undefined, guest.token);
    expect(joined.status).toBe(200);
    expect(joined.json).toEqual({ chatId: group, joined: true, pending: false });

    const created = await waitFor(() => guestSocket.frames.find((f) => f.event === 'chat.created'));
    expect(created?.payload.id).toBe(group);

    const added = await waitFor(() => memberSocket.frames.find((f) => f.event === 'chat.member_added'));
    expect(added?.payload).toMatchObject({ chatId: group, userId: guest.id });
    memberSocket.close();
    guestSocket.close();

    const chat = await api('GET', `/chats/${group}`, undefined, guest.token);
    expect(chat.json.members.map((m: any) => m.userId)).toContain(guest.id);
    expect(chat.json.members.find((m: any) => m.userId === guest.id).role).toBe('MEMBER');

    const again = await api('POST', `/chats/invite/${token}/join`, undefined, guest.token);
    expect(again.json).toEqual({ chatId: group, joined: false });

    const preview = await api('GET', `/chats/invite/${token}`, undefined, guest.token);
    expect(preview.json).toMatchObject({ alreadyMember: true, chatId: group, memberCount: 3 });
  });

  it('retires the old link when it is replaced', async () => {
    const rotated = await api('POST', `/chats/${group}/invite-link`, undefined, owner.token);
    const fresh = rotated.json.token;
    expect(fresh).not.toBe(token);

    const old = await api('GET', `/chats/invite/${token}`, undefined, guest.token);
    expect(old.status).toBe(404);
    expect(old.json.code).toBe('INVITE_INVALID');

    expect((await api('GET', `/chats/invite/${fresh}`, undefined, guest.token)).status).toBe(200);
    token = fresh;
  });

  it('stops working once revoked', async () => {
    const revoked = await api('DELETE', `/chats/${group}/invite-link`, undefined, owner.token);
    expect(revoked.json).toEqual({ token: null });

    expect((await api('GET', `/chats/invite/${token}`, undefined, member.token)).status).toBe(404);
    expect((await api('POST', `/chats/invite/${token}/join`, undefined, member.token)).status).toBe(404);
  });

  it('answers a malformed token exactly like an unknown one', async () => {
    const malformed = await api('GET', '/chats/invite/short', undefined, guest.token);
    const unknown = await api('GET', `/chats/invite/${'A'.repeat(22)}`, undefined, guest.token);

    expect(malformed.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(malformed.json.code).toBe(unknown.json.code);
  });

  it('works for channels as well', async () => {
    const channel = (await api('POST', '/chats/channel', { title: 'News', isPublic: true }, owner.token)).json.id;
    const link = (await api('POST', `/chats/${channel}/invite-link`, undefined, owner.token)).json.token;

    const joined = await api('POST', `/chats/invite/${link}/join`, undefined, member.token);
    expect(joined.json).toEqual({ chatId: channel, joined: true, pending: false });
  });

  it('requires authentication', async () => {
    const response = await fetch(`${process.env.API_URL ?? 'http://localhost:3000/api/v1'}/chats/invite/${token}`);
    expect(response.status).toBe(401);
  });
});
