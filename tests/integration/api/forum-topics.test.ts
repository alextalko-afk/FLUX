import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits, sendText } from './helpers';

describe('forum topics', () => {
  let owner: TestUser;
  let member: TestUser;
  let group: string;

  const post = (user: TestUser, content: string, topicId?: string) =>
    sendText(user.token, group, content, topicId ? { topicId } : {});

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('ft_o');
    member = await createUser('ft_m');
    group = (await api('POST', '/chats/group', { title: 'F', memberIds: [member.id] }, owner.token)).json.id;
  });

  afterAll(async () => {
    await removeUser(owner);
    await removeUser(member);
  });

  it('needs forum mode and admin rights to create topics', async () => {
    expect((await api('POST', `/chats/${group}/topics`, { title: 'T' }, owner.token)).json.code).toBe('NOT_A_FORUM');
    expect((await api('PATCH', `/chats/${group}`, { isForum: true }, member.token)).status).toBe(403);
    expect((await api('PATCH', `/chats/${group}`, { isForum: true }, owner.token)).status).toBe(200);
    expect((await api('POST', `/chats/${group}/topics`, { title: 'T' }, member.token)).status).toBe(403);
  });

  it('separates history per topic and honours closing', async () => {
    const a = (await api('POST', `/chats/${group}/topics`, { title: 'A', iconEmoji: '🔥' }, owner.token)).json;
    const b = (await api('POST', `/chats/${group}/topics`, { title: 'B' }, owner.token)).json;
    expect((await post(member, 'in a', a.id)).status).toBe(201);
    expect((await post(member, 'in b', b.id)).status).toBe(201);
    expect((await post(member, 'general')).status).toBe(201);
    expect((await post(member, 'bad', '00000000-0000-4000-8000-000000000000')).json.code).toBe('TOPIC_NOT_FOUND');

    const texts = async (topic: string) =>
      (await api('GET', `/chats/${group}/messages?topicId=${topic}`, undefined, owner.token)).json.items.map((m: { content: string }) => m.content);
    expect(await texts(a.id)).toEqual(['in a']);
    expect(await texts('general')).toEqual(['general']);

    expect((await api('PATCH', `/chats/${group}/topics/${a.id}`, { isClosed: true }, owner.token)).json.isClosed).toBe(true);
    expect((await post(member, 'late', a.id)).json.code).toBe('TOPIC_CLOSED');
    expect((await post(owner, 'admin ok', a.id)).status).toBe(201);

    const list = (await api('GET', `/chats/${group}/topics`, undefined, member.token)).json.items;
    expect(list.map((t: { messageCount: number }) => t.messageCount)).toEqual([2, 1]);
  });

  it('deleting a topic removes its messages', async () => {
    const t = (await api('POST', `/chats/${group}/topics`, { title: 'Tmp' }, owner.token)).json;
    await post(member, 'gone', t.id);
    expect((await api('DELETE', `/chats/${group}/topics/${t.id}`, undefined, member.token)).status).toBe(403);
    expect((await api('DELETE', `/chats/${group}/topics/${t.id}`, undefined, owner.token)).status).toBe(200);
    const all = (await api('GET', `/chats/${group}/messages`, undefined, owner.token)).json.items.map((m: { content: string }) => m.content);
    expect(all).not.toContain('gone');
  });
});
