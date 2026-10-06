import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits, sendText } from './helpers';

describe('channel comments, statistics and scheduled posts', () => {
  let owner: TestUser;
  let sub: TestUser;
  let channel: string;
  let post: string;

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('ce_o');
    sub = await createUser('ce_s');
    channel = (await api('POST', '/chats/channel', { title: 'C' }, owner.token)).json.id;
    await api('POST', `/chats/${channel}/members`, { userIds: [sub.id] }, owner.token);
    post = (await sendText(owner.token, channel, 'first post')).json.id;
  });

  afterAll(async () => {
    await removeUser(owner);
    await removeUser(sub);
  });

  it('keeps comments off until an admin enables them', async () => {
    const url = `/chats/${channel}/messages/${post}/comments`;
    expect((await api('POST', url, { content: 'hi' }, sub.token)).json.code).toBe('COMMENTS_DISABLED');
    expect((await api('PATCH', `/chats/${channel}`, { commentsEnabled: true }, sub.token)).status).toBe(403);
    expect((await api('PATCH', `/chats/${channel}`, { commentsEnabled: true }, owner.token)).status).toBe(200);
  });

  it('lets subscribers comment, counts them and limits deletion', async () => {
    const url = `/chats/${channel}/messages/${post}/comments`;
    const mine = await api('POST', url, { content: 'nice' }, sub.token);
    expect(mine.status).toBe(201);
    expect(mine.json.author.id).toBe(sub.id);
    const other = await api('POST', url, { content: 'by owner' }, owner.token);

    const list = await api('GET', url, undefined, sub.token);
    expect(list.json.items.map((c: { content: string }) => c.content)).toEqual(['nice', 'by owner']);
    const hist = await api('GET', `/chats/${channel}/messages`, undefined, sub.token);
    expect(hist.json.items.find((m: { id: string }) => m.id === post).commentsCount).toBe(2);

    expect((await api('DELETE', `${url}/${other.json.id}`, undefined, sub.token)).status).toBe(403);
    expect((await api('DELETE', `${url}/${mine.json.id}`, undefined, owner.token)).status).toBe(200);
    expect((await api('DELETE', `${url}/${other.json.id}`, undefined, owner.token)).status).toBe(200);
  });

  it('shows statistics to admins only, with views from read receipts', async () => {
    await api('POST', `/chats/${channel}/messages/read`, { upToMessageId: post }, sub.token);
    expect((await api('GET', `/chats/${channel}/stats`, undefined, sub.token)).status).toBe(403);
    const res = await api('GET', `/chats/${channel}/stats`, undefined, owner.token);
    expect(res.status).toBe(200);
    expect(res.json.subscribers).toBe(2);
    expect(res.json.topPosts[0]).toMatchObject({ id: post, views: 1 });
    expect(res.json.joinsByDay).toHaveLength(14);
  });

  it('lets admins schedule channel posts but not subscribers', async () => {
    const sendAt = new Date(Date.now() + 3600_000).toISOString();
    const url = `/chats/${channel}/messages/scheduled`;
    expect((await api('POST', url, { content: 'later', sendAt }, sub.token)).json.code).toBe('CHANNEL_READ_ONLY');
    expect((await api('POST', url, { content: 'later', sendAt }, owner.token)).status).toBe(201);
  });
});
