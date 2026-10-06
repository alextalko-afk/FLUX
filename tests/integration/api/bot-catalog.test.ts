import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits } from './helpers';

describe('bot catalog', () => {
  let owner: TestUser;
  let other: TestUser;
  let botId: string;
  const username = `cat_${Date.now().toString(36)}`;

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('bk_o');
    other = await createUser('bk_x');
    const bot = await api('POST', '/bots', { name: 'Weather', username, description: 'forecasts' }, owner.token);
    botId = bot.json.id ?? bot.json.bot?.id;
  });

  afterAll(async () => {
    await api('DELETE', `/bots/${botId}`, undefined, owner.token);
    await removeUser(owner);
    await removeUser(other);
  });

  it('hides private bots, lists public ones, searches by name', async () => {
    expect((await api('GET', `/bots/catalog?q=${username}`, undefined, other.token)).json.items).toHaveLength(0);
    expect((await api('PATCH', `/bots/${botId}`, { isPublic: true }, other.token)).status).toBe(404);
    expect((await api('PATCH', `/bots/${botId}`, { isPublic: true }, owner.token)).json.isPublic).toBe(true);
    const found = await api('GET', `/bots/catalog?q=@${username}`, undefined, other.token);
    expect(found.json.items.map((b: { username: string }) => b.username)).toEqual([username]);
    expect(found.json.items[0]).not.toHaveProperty('tokenHash');
  });
});
