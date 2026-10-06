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
  waitFor,
} from './helpers';

describe('realtime replay (GET /sync)', () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    await resetRateLimits();
    alice = await createUser('sync_a');
    bob = await createUser('sync_b');
  });

  afterAll(async () => {
    await removeUser(alice);
    await removeUser(bob);
  });

  it('numbers durable events and lets an offline client replay what it missed', async () => {
    const first = await openSocket(bob.token);
    const handshake = await waitFor(() =>
      first.frames.find((frame) => frame.event === 'connection.authenticated'),
    );
    expect(typeof handshake.payload.lastSequenceId).toBe('number');
    const head = handshake.payload.lastSequenceId as number;

    // Bob goes offline; Alice starts a chat and writes twice.
    first.close();
    await wait(300);
    const chatId = await openPrivateChat(alice.token, bob.id);
    await sendText(alice.token, chatId, 'one');
    await sendText(alice.token, chatId, 'two');
    await wait(300);

    const replay = await api('GET', `/sync?after=${head}`, undefined, bob.token);
    expect(replay.status).toBe(200);
    expect(replay.json.reset).toBe(false);
    expect(replay.json.hasMore).toBe(false);

    const events = replay.json.events as Array<{ event: string; sequenceId: number }>;
    expect(events.map((e) => e.event)).toEqual(['chat.created', 'message.new', 'message.new']);
    expect(events.map((e) => e.sequenceId)).toEqual([head + 1, head + 2, head + 3]);
    expect(replay.json.head).toBe(head + 3);

    // Reconnecting reports the same head, and new live events continue from it.
    const second = await openSocket(bob.token);
    const again = await waitFor(() =>
      second.frames.find((frame) => frame.event === 'connection.authenticated'),
    );
    expect(again.payload.lastSequenceId).toBe(head + 3);

    await sendText(alice.token, chatId, 'three');
    const live = await waitFor(() => second.frames.find((frame) => frame.event === 'message.new'));
    expect(live.sequenceId).toBe(head + 4);
    second.close();
  });

  it('returns an empty page at the head and asks for a reset when the cursor is ahead', async () => {
    const head = (await api('GET', '/sync?after=0', undefined, bob.token)).json.head as number;

    const atHead = await api('GET', `/sync?after=${head}`, undefined, bob.token);
    expect(atHead.json.events).toEqual([]);
    expect(atHead.json.reset).toBe(false);

    const ahead = await api('GET', `/sync?after=${head + 50}`, undefined, bob.token);
    expect(ahead.json.reset).toBe(true);
  });

  it('does not number ephemeral events such as typing', async () => {
    const chatId = await openPrivateChat(alice.token, bob.id);
    const socket = await openSocket(bob.token);
    const aliceSocket = await openSocket(alice.token);
    await wait(300);

    aliceSocket.send({ event: 'chat.typing', data: { chatId, isTyping: true } });
    const typing = await waitFor(() =>
      socket.frames.find((frame) => frame.event === 'chat.typing.start'),
    );

    expect(typing).toBeDefined();
    expect(typing.sequenceId).toBeUndefined();
    socket.close();
    aliceSocket.close();
  });

  it('requires authentication', async () => {
    const response = await fetch(`${process.env.API_URL ?? 'http://localhost:3000/api/v1'}/sync?after=0`);
    expect(response.status).toBe(401);
  });
});
