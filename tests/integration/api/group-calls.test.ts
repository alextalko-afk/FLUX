import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits } from './helpers';

const claims = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

describe('group calls', () => {
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let group: string;
  let channel: string;
  let callId: string;

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('gc_o');
    member = await createUser('gc_m');
    outsider = await createUser('gc_x');
    group = (await api('POST', '/chats/group', { title: 'G', memberIds: [member.id] }, owner.token)).json.id;
    channel = (await api('POST', '/chats/channel', { title: 'C' }, owner.token)).json.id;
    await api('POST', `/chats/${channel}/members`, { userIds: [member.id] }, owner.token);
  });

  afterAll(async () => {
    await removeUser(owner);
    await removeUser(member);
    await removeUser(outsider);
  });

  it('is for members of groups and channels only', async () => {
    expect((await api('POST', `/chats/${group}/group-call`, {}, outsider.token)).status).toBe(403);
    const dm = (await api('POST', '/chats/private', { targetUserId: member.id }, owner.token)).json.id;
    expect((await api('POST', `/chats/${dm}/group-call`, {}, owner.token)).json.code).toBe('GROUP_CALL_BAD_CHAT');
    expect((await api('POST', `/chats/${channel}/group-call`, {}, member.token)).json.code).toBe('CHANNEL_READ_ONLY');
  });

  it('starts a call and returns a room-scoped token', async () => {
    const res = await api('POST', `/chats/${group}/group-call`, { withVideo: true }, owner.token);
    expect(res.status).toBe(200);
    callId = res.json.call.id;
    expect(res.json.call.participants.map((p: { userId: string }) => p.userId)).toEqual([owner.id]);
    expect(res.json.url).toMatch(/^wss?:\/\//);
    const c = claims(res.json.token);
    expect(c.sub).toBe(owner.id);
    expect(c.video).toMatchObject({ room: `${group}:${callId}`, roomJoin: true });
  });

  it('lets another member join the running call, but not an outsider', async () => {
    const cur = await api('GET', `/chats/${group}/group-call`, undefined, member.token);
    expect(cur.json.call.id).toBe(callId);
    expect((await api('POST', `/group-calls/${callId}/join`, {}, outsider.token)).status).toBe(403);

    const joined = await api('POST', `/group-calls/${callId}/join`, {}, member.token);
    expect(joined.json.call.participants).toHaveLength(2);
    // Starting while a call runs joins it instead of opening a second one.
    expect((await api('POST', `/chats/${group}/group-call`, {}, member.token)).json.call.id).toBe(callId);
  });

  it('ends the call when the last participant leaves', async () => {
    expect((await api('POST', `/group-calls/${callId}/leave`, {}, owner.token)).json.call.participants).toHaveLength(1);
    expect((await api('GET', `/chats/${group}/group-call`, undefined, owner.token)).json.call).not.toBeNull();
    await api('POST', `/group-calls/${callId}/leave`, {}, member.token);
    expect((await api('GET', `/chats/${group}/group-call`, undefined, owner.token)).json.call).toBeNull();
    expect((await api('POST', `/group-calls/${callId}/join`, {}, member.token)).json.code).toBe('GROUP_CALL_ENDED');
  });

  it('lets only the starter or an admin end a call for everyone', async () => {
    const started = (await api('POST', `/chats/${group}/group-call`, {}, member.token)).json.call.id;
    await api('POST', `/group-calls/${started}/join`, {}, owner.token);
    expect((await api('POST', `/group-calls/${started}/end`, {}, outsider.token)).status).toBe(403);
    expect((await api('POST', `/group-calls/${started}/end`, {}, owner.token)).json.call.endedAt).not.toBeNull();
    expect((await api('GET', `/chats/${group}/group-call`, undefined, member.token)).json.call).toBeNull();
  });
});
