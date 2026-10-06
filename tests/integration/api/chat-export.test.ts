import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { API_URL, TestUser, api, createUser, removeUser, resetRateLimits, sendText } from './helpers';

describe('chat export', () => {
  let a: TestUser;
  let b: TestUser;
  let outsider: TestUser;
  let chat: string;

  const get = (id: string, query: string, token: string) =>
    fetch(`${API_URL}/chats/${id}/export${query}`, { headers: { authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    await resetRateLimits();
    a = await createUser('ex_a');
    b = await createUser('ex_b');
    outsider = await createUser('ex_o');
    chat = (await api('POST', '/chats/group', { title: 'Exports <&>', memberIds: [b.id] }, a.token)).json.id;
    await sendText(a.token, chat, 'first <b>message</b>');
    await sendText(b.token, chat, 'second');
  });

  afterAll(async () => {
    await removeUser(a);
    await removeUser(b);
    await removeUser(outsider);
  });

  it('exports messages as JSON for members only', async () => {
    const res = await get(chat, '', b.token);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const json = await res.json();
    expect(json.messages.map((m: { text: string }) => m.text)).toEqual(['first <b>message</b>', 'second']);
    expect((await get(chat, '', outsider.token)).status).toBe(403);
  });

  it('escapes HTML and rejects unknown formats', async () => {
    const html = await (await get(chat, '?format=html', a.token)).text();
    expect(html).toContain('first &lt;b&gt;message&lt;/b&gt;');
    expect(html).not.toContain('<b>message</b>');
    expect((await get(chat, '?format=pdf', a.token)).status).toBe(400);
  });
});
