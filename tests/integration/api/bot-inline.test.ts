import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TestUser, api, createUser, removeUser, resetRateLimits } from './helpers';

describe('bot inline mode', () => {
  let owner: TestUser;
  let user: TestUser;
  let botId: string;
  let server: Server;
  let username: string;
  let lastBody: { query?: string } = {};

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('bi_o');
    user = await createUser('bi_u');
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        lastBody = JSON.parse(raw);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ results: [{ id: 'a', title: 'Echo', text: `you said ${lastBody.query}` }, { id: 'b' }] }));
      });
    }).listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    username = `inl_${Date.now().toString(36)}`;
    const bot = await api('POST', '/bots', { name: 'Inline bot', username }, owner.token);
    botId = bot.json.id ?? bot.json.bot?.id;
    const hook = await api(
      'POST',
      `/bots/${botId}/webhooks`,
      { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, secret: 'x'.repeat(24) },
      owner.token,
    );
    expect(hook.status).toBeLessThan(300);
  });

  afterAll(async () => {
    server.close();
    await api('DELETE', `/bots/${botId}`, undefined, owner.token);
    await removeUser(owner);
    await removeUser(user);
  });

  it('returns the results from the bot webhook, dropping empty ones', async () => {
    const res = await api('GET', `/bots/inline?bot=@${username}&q=hi`, undefined, user.token);
    expect(res.status).toBe(200);
    expect(lastBody.query).toBe('hi');
    expect(res.json.results).toEqual([{ id: 'a', title: 'Echo', text: 'you said hi' }]);
  });

  it('404s for unknown bots', async () => {
    expect((await api('GET', '/bots/inline?bot=nobody_here&q=x', undefined, user.token)).status).toBe(404);
  });
});
