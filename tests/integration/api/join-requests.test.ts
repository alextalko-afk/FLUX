import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits } from './helpers';

describe('join requests', () => {
  let owner: TestUser;
  let guest: TestUser;
  let other: TestUser;
  let member: TestUser;
  let group: string;
  let token: string;

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('jr_o');
    guest = await createUser('jr_g');
    other = await createUser('jr_x');
    member = await createUser('jr_m');
    group = (await api('POST', '/chats/group', { title: 'Approval', memberIds: [member.id] }, owner.token)).json.id;
    token = (await api('POST', `/chats/${group}/invite-link`, undefined, owner.token)).json.token;
    await api('PATCH', `/chats/${group}`, { joinApproval: true }, owner.token);
  });

  afterAll(async () => {
    await removeUser(owner);
    await removeUser(guest);
    await removeUser(other);
    await removeUser(member);
  });

  it('queues the person instead of admitting them', async () => {
    const res = await api('POST', `/chats/invite/${token}/join`, {}, guest.token);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ joined: false, pending: true });
    expect((await api('GET', `/chats/${group}`, undefined, guest.token)).status).toBeGreaterThanOrEqual(403);
  });

  it('shows requests to admins only', async () => {
    const list = await api('GET', `/chats/${group}/join-requests`, undefined, owner.token);
    expect(list.json.items.map((r: any) => r.userId)).toEqual([guest.id]);
    expect((await api('GET', `/chats/${group}/join-requests`, undefined, guest.token)).status).toBeGreaterThanOrEqual(403);
  });

  it('admits on approval and clears the request', async () => {
    expect((await api('POST', `/chats/${group}/join-requests/${guest.id}/approve`, {}, guest.token)).status).toBeGreaterThanOrEqual(403);
    expect((await api('POST', `/chats/${group}/join-requests/${guest.id}/approve`, {}, owner.token)).status).toBe(200);
    expect((await api('GET', `/chats/${group}`, undefined, guest.token)).status).toBe(200);
    expect((await api('GET', `/chats/${group}/join-requests`, undefined, owner.token)).json.items).toHaveLength(0);
  });

  it('drops a rejected request', async () => {
    await api('POST', `/chats/invite/${token}/join`, {}, other.token);
    expect((await api('DELETE', `/chats/${group}/join-requests/${other.id}`, undefined, owner.token)).status).toBe(200);
    expect((await api('GET', `/chats/${group}`, undefined, other.token)).status).toBeGreaterThanOrEqual(403);
  });
});
