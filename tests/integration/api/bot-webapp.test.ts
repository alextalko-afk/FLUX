import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { TestUser, API_URL, api, createUser, removeUser, resetRateLimits } from './helpers';

describe('bot mini-apps', () => {
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let chat: string;
  let token: string;
  let botId: string;
  let messageId: string;
  const url = 'https://app.example.com/game';

  const send = (keyboard: unknown) =>
    fetch(`${API_URL}/bots/api/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bot-token': token },
      body: JSON.stringify({ chatId: chat, text: 'Play', keyboard }),
    });

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('wa_o');
    member = await createUser('wa_m');
    outsider = await createUser('wa_x');
    chat = (await api('POST', '/chats/group', { title: 'Apps', memberIds: [member.id] }, owner.token)).json.id;
    const bot = await api('POST', '/bots', { name: 'Game bot', username: `game_${Date.now().toString(36)}` }, owner.token);
    botId = bot.json.id;
    token = bot.json.token;
    messageId = (await (await send([{ row: [{ text: 'Open', webAppUrl: url }] }])).json()).messageId;
  });

  afterAll(async () => {
    await api('DELETE', `/bots/${botId}`, undefined, owner.token);
    for (const u of [owner, member, outsider]) await removeUser(u);
  });

  it('rejects insecure urls and empty buttons', async () => {
    expect((await (await send([{ row: [{ text: 'x', webAppUrl: 'http://evil.example.com' }] }])).json()).code).toBe('BOT_WEBAPP_URL');
    expect((await (await send([{ row: [{ text: 'x' }] }])).json()).code).toBe('BOT_BUTTON_EMPTY');
  });

  it('gives members signed init data the bot can verify, and nobody else', async () => {
    const res = await api('POST', '/bots/webapp', { messageId, url }, member.token);
    expect(res.status).toBe(200);
    expect(res.json.url).toBe(url);

    const params = new URLSearchParams(res.json.initData);
    const hash = params.get('hash')!;
    params.delete('hash');
    const check = [...params.keys()].sort().map((k) => `${k}=${params.get(k)}`).join('\n');
    const secret = createHash('sha256').update(token).digest('hex');
    expect(createHmac('sha256', secret).update(check).digest('hex')).toBe(hash);
    expect(JSON.parse(params.get('user')!).id).toBe(member.id);

    expect((await api('POST', '/bots/webapp', { messageId, url }, outsider.token)).status).toBe(403);
    expect((await api('POST', '/bots/webapp', { messageId, url: 'https://other.example.com' }, member.token)).json.code).toBe(
      'BOT_WEBAPP_UNKNOWN',
    );
  });
});
