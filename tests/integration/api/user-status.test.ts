import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits } from './helpers';

describe('emoji status', () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    await resetRateLimits();
    a = await createUser('st_a');
    b = await createUser('st_b');
  });

  afterAll(async () => {
    await removeUser(a);
    await removeUser(b);
  });

  it('sets, shows to others, and clears a status', async () => {
    expect((await api('PATCH', '/users/me', { statusEmoji: '🔥', statusHours: 4 }, a.token)).status).toBe(200);
    expect((await api('GET', `/users/${a.id}/public`, undefined, b.token)).json.statusEmoji).toBe('🔥');
    expect((await api('GET', '/users/me', undefined, a.token)).json.statusEmoji).toBe('🔥');
    await api('PATCH', '/users/me', { statusEmoji: '' }, a.token);
    expect((await api('GET', `/users/${a.id}/public`, undefined, b.token)).json.statusEmoji).toBeNull();
  });

  it('validates the duration', async () => {
    expect((await api('PATCH', '/users/me', { statusEmoji: '🔥', statusHours: 0 }, a.token)).status).toBe(400);
  });
});
