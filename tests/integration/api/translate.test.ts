import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits, sendText } from './helpers';

describe('translate endpoint', () => {
  let a: TestUser;
  let outsider: TestUser;
  let messageId: string;

  beforeAll(async () => {
    await resetRateLimits();
    a = await createUser('tr_a');
    outsider = await createUser('tr_o');
    const chat = (await api('POST', '/chats/group', { title: 'T', memberIds: [outsider.id] }, a.token)).json.id;
    expect(chat).toBeTruthy();
    messageId = (await sendText(a.token, chat, 'Hello')).json.id;
  });

  afterAll(async () => {
    await removeUser(a);
    await removeUser(outsider);
  });

  it('validates the target language', async () => {
    expect((await api('POST', `/messages/${messageId}/translate`, { to: 'not a lang' }, a.token)).status).toBe(400);
  });

  it('answers 503 TRANSLATE_DISABLED when no provider is configured', async () => {
    const res = await api('POST', `/messages/${messageId}/translate`, { to: 'ru' }, a.token);
    expect(res.status).toBe(503);
    expect(res.json.code).toBe('TRANSLATE_DISABLED');
  });
});
