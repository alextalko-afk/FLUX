import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits, sendText } from './helpers';

describe('chat media summary', () => {
  let a: TestUser;
  let b: TestUser;
  let outsider: TestUser;
  let chat: string;

  beforeAll(async () => {
    await resetRateLimits();
    a = await createUser('ms_a');
    b = await createUser('ms_b');
    outsider = await createUser('ms_o');
    chat = (await api('POST', '/chats/group', { title: 'Media', memberIds: [b.id] }, a.token)).json.id;
    await sendText(a.token, chat, 'plain message');
    await sendText(a.token, chat, 'look at https://example.com/page');
    await sendText(b.token, chat, 'and http://example.org');
  });

  afterAll(async () => {
    for (const u of [a, b, outsider]) await removeUser(u);
  });

  it('counts links and zero for the rest, for members only', async () => {
    const res = await api('GET', `/chats/${chat}/media-summary`, undefined, b.token);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ images: 0, videos: 0, files: 0, voice: 0, links: 2 });
    expect((await api('GET', `/chats/${chat}/media-summary`, undefined, outsider.token)).status).toBe(403);
  });

  it('pages through one kind, newest first, and validates the kind', async () => {
    const first = await api('GET', `/chats/${chat}/media?kind=links&limit=1`, undefined, a.token);
    expect(first.json.items).toHaveLength(1);
    expect(first.json.items[0].content).toContain('example.org');
    expect(first.json.next).toBeTruthy();
    const second = await api('GET', `/chats/${chat}/media?kind=links&limit=1&before=${encodeURIComponent(first.json.next)}`, undefined, a.token);
    expect(second.json.items[0].content).toContain('example.com');
    expect((await api('GET', `/chats/${chat}/media?kind=bogus`, undefined, a.token)).status).toBe(400);
  });
});
