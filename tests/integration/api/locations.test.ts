import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits, wait } from './helpers';

describe('location sharing', () => {
  let a: TestUser;
  let b: TestUser;
  let chat: string;

  beforeAll(async () => {
    await resetRateLimits();
    a = await createUser('lo_a');
    b = await createUser('lo_b');
    chat = (await api('POST', '/chats/group', { title: 'G', memberIds: [b.id] }, a.token)).json.id;
  });

  afterAll(async () => {
    await removeUser(a);
    await removeUser(b);
  });

  it('validates coordinates', async () => {
    expect((await api('POST', `/chats/${chat}/location`, { latitude: 91, longitude: 0 }, a.token)).status).toBe(400);
    expect((await api('POST', `/chats/${chat}/location`, { latitude: 0, longitude: 181 }, a.token)).status).toBe(400);
    expect((await api('POST', `/chats/${chat}/location`, { latitude: 0, longitude: 0, liveSeconds: 5 }, a.token)).status).toBe(400);
  });

  it('shares a static location that is visible in history and cannot be updated', async () => {
    const res = await api('POST', `/chats/${chat}/location`, { latitude: 52.52, longitude: 13.405, label: 'Berlin' }, a.token);
    expect(res.status).toBe(201);
    expect(res.json.type).toBe('LOCATION');
    expect(res.json.location).toMatchObject({ latitude: 52.52, longitude: 13.405, label: 'Berlin', isLive: false });
    const hist = await api('GET', `/chats/${chat}/messages`, undefined, b.token);
    expect(hist.json.items[0].location.label).toBe('Berlin');
    const upd = await api('POST', `/chats/${chat}/messages/${res.json.id}/location`, { latitude: 1, longitude: 1 }, a.token);
    expect(upd.json.code).toBe('LOCATION_ENDED');
  });

  it('updates and stops a live location, only for its sender', async () => {
    const res = await api('POST', `/chats/${chat}/location`, { latitude: 10, longitude: 10, liveSeconds: 60 }, a.token);
    expect(res.json.location.isLive).toBe(true);
    const url = `/chats/${chat}/messages/${res.json.id}/location`;
    expect((await api('POST', url, { latitude: 11, longitude: 11 }, b.token)).status).toBe(403);
    expect((await api('POST', url, { latitude: 11, longitude: 11 }, a.token)).json.code).toBe('LOCATION_RATE');
    await wait(2200);
    expect((await api('POST', url, { latitude: 11, longitude: 12 }, a.token)).json).toMatchObject({ latitude: 11, longitude: 12, isLive: true });
    expect((await api('POST', `${url}/stop`, {}, a.token)).json.isLive).toBe(false);
    expect((await api('POST', url, { latitude: 1, longitude: 1 }, a.token)).json.code).toBe('LOCATION_ENDED');
  });
});
