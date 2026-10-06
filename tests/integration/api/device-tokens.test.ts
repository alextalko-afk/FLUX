import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits } from './helpers';

const expoToken = () => `ExponentPushToken[${Math.random().toString(36).slice(2).padEnd(12, 'x')}]`;

describe('phone push tokens', () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    await resetRateLimits();
    a = await createUser('dt_a');
    b = await createUser('dt_b');
  });

  afterAll(async () => {
    await removeUser(a);
    await removeUser(b);
  });

  it('rejects malformed registrations', async () => {
    expect((await api('POST', '/notifications/devices', { provider: 'apns', platform: 'ios', token: expoToken() }, a.token)).status).toBe(400);
    expect((await api('POST', '/notifications/devices', { provider: 'expo', platform: 'ios', token: 'short' }, a.token)).status).toBe(400);
    const bad = await api('POST', '/notifications/devices', { provider: 'expo', platform: 'android', token: 'not-an-expo-token-but-long-enough' }, a.token);
    expect(bad.json.code).toBe('DEVICE_TOKEN_INVALID');
  });

  it('registers, lists and removes a device', async () => {
    const token = expoToken();
    expect((await api('POST', '/notifications/devices', { provider: 'expo', platform: 'android', token }, a.token)).status).toBe(200);
    // Registering the same token twice keeps a single row.
    await api('POST', '/notifications/devices', { provider: 'expo', platform: 'android', token }, a.token);
    const list = await api('GET', '/notifications/devices', undefined, a.token);
    expect(list.json.items).toHaveLength(1);
    expect(list.json.items[0]).toMatchObject({ provider: 'expo', platform: 'android' });
    expect(list.json.items[0]).not.toHaveProperty('token');

    expect((await api('DELETE', '/notifications/devices', { token }, b.token)).status).toBe(200);
    expect((await api('GET', '/notifications/devices', undefined, a.token)).json.items).toHaveLength(1);
    await api('DELETE', '/notifications/devices', { token }, a.token);
    expect((await api('GET', '/notifications/devices', undefined, a.token)).json.items).toHaveLength(0);
  });

  it('moves a token to the account that registers it last', async () => {
    const token = expoToken();
    await api('POST', '/notifications/devices', { provider: 'expo', platform: 'ios', token }, a.token);
    await api('POST', '/notifications/devices', { provider: 'expo', platform: 'ios', token }, b.token);
    expect((await api('GET', '/notifications/devices', undefined, a.token)).json.items).toHaveLength(0);
    expect((await api('GET', '/notifications/devices', undefined, b.token)).json.items).toHaveLength(1);
  });

  it('accepts an FCM token of any shape', async () => {
    const res = await api('POST', '/notifications/devices', { provider: 'fcm', platform: 'android', token: `fcm:${'a'.repeat(60)}` }, a.token);
    expect(res.status).toBe(200);
  });
});
