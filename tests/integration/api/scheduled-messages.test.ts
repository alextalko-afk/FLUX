import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, openPrivateChat, removeUser, resetRateLimits, wait } from './helpers';

describe('scheduled messages', () => {
  let alice: TestUser;
  let bob: TestUser;
  let outsider: TestUser;
  let chat: string;

  beforeAll(async () => {
    await resetRateLimits();
    alice = await createUser('sch_a');
    bob = await createUser('sch_b');
    outsider = await createUser('sch_o');
    chat = await openPrivateChat(alice.token, bob.id);
  });

  afterAll(async () => {
    await removeUser(alice);
    await removeUser(bob);
    await removeUser(outsider);
  });

  const schedule = (token: string, content: string, inMs: number) =>
    api('POST', `/chats/${chat}/messages/scheduled`, { content, sendAt: new Date(Date.now() + inMs).toISOString() }, token);

  it('rejects past times and non-members', async () => {
    expect((await schedule(alice.token, 'x', -1000)).status).toBe(400);
    expect((await schedule(outsider.token, 'x', 60_000)).status).toBe(403);
  });

  it('keeps a scheduled message out of history, lists it only for its author, and can cancel it', async () => {
    const created = await schedule(alice.token, 'later', 3_600_000);
    expect(created.status).toBe(201);

    const history = await api('GET', `/chats/${chat}/messages`, undefined, bob.token);
    expect(history.text).not.toContain('later');
    expect((await api('GET', `/chats/${chat}/messages/scheduled`, undefined, alice.token)).json.items).toHaveLength(1);
    expect((await api('GET', `/chats/${chat}/messages/scheduled`, undefined, bob.token)).json.items).toHaveLength(0);

    expect((await api('DELETE', `/chats/${chat}/messages/scheduled/${created.json.id}`, undefined, bob.token)).status).toBe(404);
    expect((await api('DELETE', `/chats/${chat}/messages/scheduled/${created.json.id}`, undefined, alice.token)).status).toBe(200);
  });

  it('delivers the message once it is due', async () => {
    await schedule(alice.token, 'due soon', 12_000);
    await wait(30_000);
    const history = await api('GET', `/chats/${chat}/messages`, undefined, bob.token);
    expect(history.text).toContain('due soon');
    expect((await api('GET', `/chats/${chat}/messages/scheduled`, undefined, alice.token)).json.items).toHaveLength(0);
  }, 45_000);
});
