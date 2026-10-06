import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TestUser,
  api,
  createUser,
  openPrivateChat,
  openSocket,
  removeUser,
  resetRateLimits,
  sendText,
  wait,
} from './helpers';

describe('message sanitisation and entities', () => {
  let alice: TestUser;
  let bob: TestUser;
  let chatId: string;

  beforeAll(async () => {
    await resetRateLimits();
    alice = await createUser('san_a');
    bob = await createUser('san_b');
    chatId = await openPrivateChat(alice.token, bob.id);
  });

  afterAll(async () => {
    await removeUser(alice);
    await removeUser(bob);
  });

  const link = (url: string) => [{ type: 'link', offset: 0, length: 5, url }];

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>1</script>'],
    ['https://user:pw@evil.test/'],
  ])('rejects the unsafe link %s', async (url) => {
    const response = await sendText(alice.token, chatId, 'click me', { entities: link(url) });
    expect(response.status).toBe(400);
  });

  it('rejects malformed entities', async () => {
    const outside = await sendText(alice.token, chatId, 'hi', {
      entities: [{ type: 'bold', offset: 0, length: 50 }],
    });
    const strings = await sendText(alice.token, chatId, 'hi', {
      entities: [{ type: 'bold', offset: '0', length: '2' }],
    });
    const unknown = await sendText(alice.token, chatId, 'hi', {
      entities: [{ type: 'script', offset: 0, length: 2 }],
    });

    expect([outside.status, strings.status, unknown.status]).toEqual([400, 400, 400]);
  });

  it('stores a valid link and bold span as ordered integers', async () => {
    const response = await sendText(alice.token, chatId, 'hello world', {
      entities: [
        { type: 'bold', offset: 6, length: 5 },
        { type: 'link', offset: 0, length: 5, url: 'https://example.com/a?b=1' },
      ],
    });

    expect(response.status).toBe(201);
    expect(response.json.entities).toEqual([
      { type: 'link', offset: 0, length: 5, url: 'https://example.com/a?b=1' },
      { type: 'bold', offset: 6, length: 5 },
    ]);
  });

  it('strips control and bidi-override characters and normalises line endings', async () => {
    const response = await sendText(alice.token, chatId, 'a\u0000b‮c\r\nd');
    expect(response.json.content).toBe('abc\nd');
  });
});

describe('rate limiting', () => {
  let alice: TestUser;
  let bob: TestUser;
  let chatId: string;

  beforeAll(async () => {
    await resetRateLimits();
    alice = await createUser('rl_a');
    bob = await createUser('rl_b');
    chatId = await openPrivateChat(alice.token, bob.id);
  });

  afterAll(async () => {
    await resetRateLimits();
    await removeUser(alice);
    await removeUser(bob);
    await resetRateLimits();
  });

  it('throttles message sending per user and tells the client when to retry', async () => {
    let limited: Awaited<ReturnType<typeof sendText>> | undefined;
    for (let i = 0; i < 40 && !limited; i++) {
      const response = await sendText(alice.token, chatId, `flood ${i}`);
      if (response.status === 429) limited = response;
    }

    expect(limited).toBeDefined();
    expect(Number(limited!.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    expect(limited!.json.statusCode).toBe(429);
    expect(typeof limited!.json.retryAfterSeconds).toBe('number');

    // The limit belongs to Alice, not to the IP address she shares with Bob.
    const other = await sendText(bob.token, chatId, 'still allowed');
    expect(other.status).toBe(201);
  });

  it('limits registration attempts per IP before the body is even validated', async () => {
    await resetRateLimits();
    let blockedAt = -1;
    for (let i = 0; i < 14; i++) {
      const response = await api('POST', '/auth/register', {});
      if (response.status === 429) {
        blockedAt = i;
        break;
      }
    }
    expect(blockedAt).toBeGreaterThan(0);
    expect(blockedAt).toBeLessThanOrEqual(11);
  });

  it('never limits the health endpoint', async () => {
    const statuses = await Promise.all(
      Array.from({ length: 8 }, () => api('GET', '/health').then((r) => r.status)),
    );
    expect(statuses.every((status) => status === 200)).toBe(true);
  });

  it('closes a WebSocket that floods frames', async () => {
    await resetRateLimits();
    const socket = await openSocket(alice.token);
    await wait(300);
    for (let i = 0; i < 260; i++) socket.send({ event: 'noop', data: {} });
    await wait(1000);

    expect(socket.closeCode).toBe(4008);
  });
});
