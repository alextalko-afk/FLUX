import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits } from './helpers';

describe('bot inline buttons', () => {
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let chat: string;
  let token: string;
  let botId: string;
  let messageId: string;

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('bc_o');
    member = await createUser('bc_m');
    outsider = await createUser('bc_x');
    chat = (await api('POST', '/chats/group', { title: 'Bots', memberIds: [member.id] }, owner.token)).json.id;
    const bot = await api('POST', '/bots', { name: 'Press bot', username: `press_${Date.now().toString(36)}` }, owner.token);
    expect(bot.status).toBeLessThan(300);
    botId = bot.json.id ?? bot.json.bot?.id;
    token = bot.json.token ?? bot.json.apiToken;
    expect(token).toBeTruthy();
    const sent = await fetch(`${process.env.API_URL ?? 'http://localhost:3000/api/v1'}/bots/api/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bot-token': token },
      body: JSON.stringify({ chatId: chat, text: 'Pick', keyboard: [{ row: [{ text: 'Yes', callbackData: 'yes' }] }] }),
    });
    messageId = (await sent.json()).messageId;
    expect(messageId).toBeTruthy();
  });

  afterAll(async () => {
    await api('DELETE', `/bots/${botId}`, undefined, owner.token);
    await removeUser(owner);
    await removeUser(member);
    await removeUser(outsider);
  });

  const press = (user: TestUser, data: string) => api('POST', '/bots/callback', { messageId, data }, user.token);

  it('rejects unknown buttons and non-members', async () => {
    expect((await press(member, 'nope')).json.code).toBe('BOT_BUTTON_UNKNOWN');
    expect((await press(outsider, 'yes')).status).toBe(403);
  });

  it('accepts a real button; undelivered while the bot has no webhook, queued once it has', async () => {
    const first = await press(member, 'yes');
    expect(first.status).toBe(200);
    expect(first.json.delivered).toBe(false);

    const hook = await api('POST', `/bots/${botId}/webhooks`, { url: 'http://localhost:9/hook', secret: 'x'.repeat(24) }, owner.token);
    expect(hook.status).toBeLessThan(300);
    expect((await press(member, 'yes')).json.delivered).toBe(true);
  });
});
