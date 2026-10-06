import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits } from './helpers';

describe('polls and quizzes', () => {
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let group: string;
  let channel: string;

  const create = (token: string, chat: string, body: Record<string, unknown>) =>
    api('POST', `/chats/${chat}/polls`, { question: 'Q?', options: ['a', 'b', 'c'], ...body }, token);

  beforeAll(async () => {
    await resetRateLimits();
    owner = await createUser('po_o');
    member = await createUser('po_m');
    outsider = await createUser('po_x');
    group = (await api('POST', '/chats/group', { title: 'G', memberIds: [member.id] }, owner.token)).json.id;
    channel = (await api('POST', '/chats/channel', { title: 'C' }, owner.token)).json.id;
    await api('POST', `/chats/${channel}/members`, { userIds: [member.id] }, owner.token);
  });

  afterAll(async () => {
    await removeUser(owner);
    await removeUser(member);
    await removeUser(outsider);
  });

  it('validates options and permissions', async () => {
    expect((await create(owner.token, group, { options: ['a', 'A'] })).json.code).toBe('POLL_BAD_OPTIONS');
    expect((await create(owner.token, group, { isQuiz: true })).json.code).toBe('POLL_BAD_CORRECT');
    expect((await create(outsider.token, group, {})).status).toBe(403);
    expect((await create(member.token, channel, {})).status).toBe(403);
  });

  it('counts votes, allows changing, and shows them in history', async () => {
    const res = await create(owner.token, group, { isAnonymous: false });
    expect(res.status).toBe(201);
    const poll = res.json.poll;
    const [a, b] = poll.options.map((o: { id: string }) => o.id);

    const v1 = await api('POST', `/polls/${poll.id}/vote`, { optionIds: [a] }, member.token);
    expect(v1.json.myOptionIds).toEqual([a]);
    expect((await api('POST', `/polls/${poll.id}/vote`, { optionIds: [a, b] }, member.token)).json.code).toBe('POLL_SINGLE_CHOICE');
    const v2 = await api('POST', `/polls/${poll.id}/vote`, { optionIds: [b] }, member.token);
    expect(v2.json.options.map((o: { votes: number }) => o.votes)).toEqual([0, 1, 0]);
    expect((await api('POST', `/polls/${poll.id}/vote`, { optionIds: [a] }, outsider.token)).status).toBe(403);

    const voters = await api('GET', `/polls/${poll.id}/voters`, undefined, owner.token);
    expect(voters.json.options[1].voters).toHaveLength(1);

    const hist = await api('GET', `/chats/${group}/messages`, undefined, member.token);
    const item = hist.json.items.find((m: { type: string }) => m.type === 'POLL');
    expect(item.poll.totalVoters).toBe(1);

    expect((await api('DELETE', `/polls/${poll.id}/vote`, undefined, member.token)).json.totalVoters).toBe(0);
  });

  it('hides anonymous voters and lets subscribers vote in a channel', async () => {
    const anon = (await create(owner.token, channel, {})).json.poll;
    expect((await api('GET', `/polls/${anon.id}/voters`, undefined, owner.token)).json.code).toBe('POLL_ANONYMOUS');
    const res = await api('POST', `/polls/${anon.id}/vote`, { optionIds: [anon.options[0].id] }, member.token);
    expect(res.status).toBe(200);
  });

  it('keeps a quiz answer hidden until voting and makes answers final', async () => {
    const res = await create(owner.token, group, { isQuiz: true, correctOption: 2, explanation: 'because' });
    const poll = res.json.poll;
    expect(poll.correctOptionId).toBeNull();
    const [a, , c] = poll.options.map((o: { id: string }) => o.id);

    const voted = await api('POST', `/polls/${poll.id}/vote`, { optionIds: [a] }, member.token);
    expect(voted.json.correctOptionId).toBe(c);
    expect(voted.json.explanation).toBe('because');
    expect((await api('POST', `/polls/${poll.id}/vote`, { optionIds: [c] }, member.token)).json.code).toBe('POLL_QUIZ_FINAL');
    expect((await api('DELETE', `/polls/${poll.id}/vote`, undefined, member.token)).status).toBe(409);
  });

  it('closes a poll: only author or admin, then no more votes', async () => {
    const poll = (await create(member.token, group, { multiple: true })).json.poll;
    const [a, b] = poll.options.map((o: { id: string }) => o.id);
    expect((await api('POST', `/polls/${poll.id}/vote`, { optionIds: [a, b] }, owner.token)).json.totalVoters).toBe(1);
    expect((await api('POST', `/polls/${poll.id}/close`, undefined, outsider.token)).status).toBe(403);
    expect((await api('POST', `/polls/${poll.id}/close`, undefined, owner.token)).json.isClosed).toBe(true);
    expect((await api('POST', `/polls/${poll.id}/vote`, { optionIds: [a] }, member.token)).json.code).toBe('POLL_CLOSED');
  });
});
