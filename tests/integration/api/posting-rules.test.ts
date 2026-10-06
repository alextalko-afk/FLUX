import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits, sendText, wait } from './helpers';

describe('who may post', () => {
  let owner: TestUser;
  let member: TestUser;
  let restricted: TestUser;
  let group: string;
  let channel: string;

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('pr_o');
    member = await createUser('pr_m');
    restricted = await createUser('pr_r');
    group = (await api('POST', '/chats/group', { title: 'G', memberIds: [member.id, restricted.id] }, owner.token)).json.id;
    channel = (await api('POST', '/chats/channel', { title: 'C' }, owner.token)).json.id;
    await api('POST', `/chats/${channel}/members`, { userIds: [member.id] }, owner.token);
    await api('PATCH', `/chats/${group}/members/${restricted.id}`, { role: 'RESTRICTED' }, owner.token);
  });

  afterAll(async () => {
    await removeUser(owner);
    await removeUser(member);
    await removeUser(restricted);
  });

  it('keeps ordinary members out of a channel but lets the owner post', async () => {
    const denied = await sendText(member.token, channel, 'spam');
    expect(denied.status).toBe(403);
    expect(denied.json.code).toBe('CHANNEL_READ_ONLY');
    expect((await sendText(owner.token, channel, 'news')).status).toBe(201);
  });

  it('keeps restricted members from posting', async () => {
    const res = await sendText(restricted.token, group, 'hi');
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('MEMBER_RESTRICTED');
  });

  it('applies slow mode to members but not to the owner', async () => {
    expect((await api('PATCH', `/chats/${group}`, { slowModeSeconds: 10 }, owner.token)).status).toBe(200);
    expect((await sendText(member.token, group, 'one')).status).toBe(201);
    const second = await sendText(member.token, group, 'two');
    expect(second.status).toBe(429);
    expect(second.json.code).toBe('SLOW_MODE');
    expect((await sendText(owner.token, group, 'a')).status).toBe(201);
    expect((await sendText(owner.token, group, 'b')).status).toBe(201);
  });

  it('refuses slow mode outside groups and unknown intervals', async () => {
    expect((await api('PATCH', `/chats/${channel}`, { slowModeSeconds: 10 }, owner.token)).status).toBe(400);
    expect((await api('PATCH', `/chats/${group}`, { slowModeSeconds: 7 }, owner.token)).status).toBe(400);
  });
});
