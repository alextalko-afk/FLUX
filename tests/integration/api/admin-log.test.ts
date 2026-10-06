import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits } from './helpers';

describe('admin log', () => {
  let owner: TestUser;
  let member: TestUser;
  let extra: TestUser;
  let group: string;

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('al_o');
    member = await createUser('al_m');
    extra = await createUser('al_x');
    group = (await api('POST', '/chats/group', { title: 'Log', memberIds: [member.id] }, owner.token)).json.id;
  });

  afterAll(async () => {
    await removeUser(owner);
    await removeUser(member);
    await removeUser(extra);
  });

  it('records what administrators do, newest first', async () => {
    await api('PATCH', `/chats/${group}`, { title: 'Renamed' }, owner.token);
    await api('POST', `/chats/${group}/members`, { userIds: [extra.id] }, owner.token);
    await api('PATCH', `/chats/${group}/members/${member.id}`, { role: 'ADMIN' }, owner.token);
    await api('DELETE', `/chats/${group}/members/${extra.id}`, undefined, owner.token);

    const log = await api('GET', `/chats/${group}/admin-log`, undefined, owner.token);
    expect(log.status).toBe(200);
    expect(log.json.items.map((i: any) => i.action)).toEqual([
      'member.removed',
      'member.role',
      'member.added',
      'chat.updated',
    ]);
    expect(log.json.items[0].actor.id).toBe(owner.id);
    expect(log.json.items[0].target.id).toBe(extra.id);
    expect(log.json.items[1].details).toEqual({ from: 'MEMBER', to: 'ADMIN' });
  });

  it('is visible to administrators only', async () => {
    expect((await api('GET', `/chats/${group}/admin-log`, undefined, member.token)).status).toBe(200); // promoted above
    expect((await api('GET', `/chats/${group}/admin-log`, undefined, extra.token)).status).toBeGreaterThanOrEqual(403);
  });
});
