#!/usr/bin/env node
/**
 * FLUX — end-to-end smoke test.
 *
 * Exercises the real HTTP API and the realtime WebSocket layer against a
 * running server. It creates its own throwaway users and chats, so it never
 * depends on seed/demo data.
 *
 * Requirements: Node.js >= 22 (uses the built-in `fetch` and `WebSocket`).
 *
 * Usage:
 *   node scripts/smoke-test.mjs
 *   SMOKE_BASE_URL=http://localhost:3000/api/v1 node scripts/smoke-test.mjs
 */

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000/api/v1';
const WS_BASE = process.env.SMOKE_WS_URL ?? 'ws://localhost:3000/ws';

const PASSWORD = 'SuperSecret123';
const stamp = Date.now();

const results = [];

function assert(name, ok, extra = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? ` -> ${extra}` : ''}`);
  if (!ok) {
    throw new Error(`Assertion failed: ${name}${extra ? ` (${extra})` : ''}`);
  }
}

async function api(method, path, body, token) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function createVerifiedUser(prefix) {
  const email = `${prefix}.${stamp}@example.test`;
  const username = `${prefix}_${stamp}`;

  const registration = await api('POST', '/auth/register', {
    email,
    password: PASSWORD,
    firstName: prefix,
    username,
  });
  if (!registration.devCode) {
    throw new Error('Server did not return devCode (is NODE_ENV set to production?)');
  }
  await api('POST', '/auth/email/verify', { email, code: registration.devCode });
  const login = await api('POST', '/auth/login', { email, password: PASSWORD });

  return { email, username, id: login.user.id, token: login.accessToken };
}

function readMessage(event) {
  const raw = typeof event.data === 'string' ? event.data : String(event.data);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function connectWs(token) {
  const issued = await fetch(`${BASE}/sync/ticket`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${WS_BASE}?ticket=${encodeURIComponent(issued.ticket)}`);
    const timeout = setTimeout(() => reject(new Error('WebSocket connect timeout')), 10000);

    socket.addEventListener('message', (event) => {
      const message = readMessage(event);
      if (message && message.event === 'connection.authenticated') {
        clearTimeout(timeout);
        resolve(socket);
      }
    });

    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('WebSocket connection error'));
    });
  });
}

function waitForEvent(socket, eventName, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timeout waiting for ${eventName}`)),
      timeoutMs,
    );
    const handler = (event) => {
      const message = readMessage(event);
      if (message && message.event === eventName) {
        clearTimeout(timeout);
        socket.removeEventListener('message', handler);
        resolve(message.payload);
      }
    };
    socket.addEventListener('message', handler);
  });
}

async function main() {
  console.log(`Smoke testing ${BASE}\n`);

  // --- HTTP surface -------------------------------------------------------
  const health = await api('GET', '/health');
  assert('health endpoint is up', health.status === 'ok', `database=${health.info?.database?.status}`);

  const alice = await createVerifiedUser('alice');
  assert('register + verify + login (alice)', Boolean(alice.token));

  const bob = await createVerifiedUser('bob');
  assert('register + verify + login (bob)', Boolean(bob.token));

  const me = await api('GET', '/auth/me', undefined, alice.token);
  assert('GET /auth/me returns the authenticated user', me.id === alice.id);

  const search = await api('GET', `/search/users?q=${encodeURIComponent(bob.username)}`, undefined, alice.token);
  const found = Array.isArray(search) ? search.find((u) => u.id === bob.id) : undefined;
  assert('search finds the other user by username', Boolean(found));

  const chat = await api('POST', '/chats/private', { targetUserId: bob.id }, alice.token);
  assert('private chat is created', Boolean(chat.id));

  const sent = await api('POST', `/chats/${chat.id}/messages`, {
    type: 'TEXT',
    content: 'hello from alice',
    clientTempId: '00000000-0000-4000-8000-000000000001',
  }, alice.token);
  assert('message is sent', Boolean(sent.id));

  const history = await api('GET', `/chats/${chat.id}/messages?limit=50`, undefined, bob.token);
  assert('the peer sees the message in history', history.items.some((m) => m.id === sent.id));

  await api('POST', `/chats/${chat.id}/messages/${sent.id}/react`, { emoji: 'OK' }, bob.token);
  const afterReact = await api('GET', `/chats/${chat.id}/messages?limit=10`, undefined, alice.token);
  const reacted = afterReact.items.find((m) => m.id === sent.id);
  assert('reaction is persisted', (reacted?.reactions ?? []).length > 0);

  const edited = await api('POST', `/chats/${chat.id}/messages/${sent.id}/edit`, {
    content: 'hello from alice (edited)',
  }, alice.token);
  assert('message is edited', String(edited.content).includes('edited'));

  const group = await api('POST', '/chats/group', {
    title: `Smoke Group ${stamp}`,
    memberIds: [bob.id],
  }, alice.token);
  assert('group is created with both members', group.type === 'GROUP');

  await api('POST', `/chats/${group.id}/messages`, {
    type: 'TEXT',
    content: 'group hello',
    clientTempId: '00000000-0000-4000-8000-000000000003',
  }, alice.token);
  const groupHistory = await api('GET', `/chats/${group.id}/messages?limit=10`, undefined, bob.token);
  assert('group member can read group messages', groupHistory.items.length > 0);

  const channel = await api('POST', '/chats/channel', {
    title: `Smoke Channel ${stamp}`,
    isPublic: true,
  }, alice.token);
  assert('channel is created', channel.type === 'CHANNEL');

  await api('DELETE', `/chats/${chat.id}/messages/${sent.id}?forAll=true`, undefined, alice.token);
  const afterDelete = await api('GET', `/chats/${chat.id}/messages?limit=10`, undefined, bob.token);
  assert('message is deleted for everyone', !afterDelete.items.some((m) => m.id === sent.id && m.content));

  // --- Media: presigned upload + protected download -----------------------
  const fileBody = Buffer.from(`FLUX media smoke test ${stamp}`);
  const initUpload = await api('POST', '/media/upload/init', {
    fileName: 'smoke.txt',
    mimeType: 'text/plain',
    fileSize: String(fileBody.byteLength),
    mediaType: 'CHAT_MEDIA',
  }, alice.token);
  assert('media upload is initialized', Boolean(initUpload.fileObjectId && initUpload.uploadUrl));

  const putResponse = await fetch(initUpload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: fileBody,
  });
  assert('presigned upload URL accepts the file', putResponse.ok, `status=${putResponse.status}`);

  const completed = await api('POST', '/media/upload/complete', {
    fileObjectId: initUpload.fileObjectId,
  }, alice.token);
  assert('media upload is completed', completed.fileObjectId === initUpload.fileObjectId);

  const download = await api('GET', `/media/download/${initUpload.fileObjectId}`, undefined, alice.token);
  const downloadedResponse = await fetch(download.url);
  const downloadedBody = Buffer.from(await downloadedResponse.arrayBuffer());
  assert('downloaded bytes match the uploaded file', downloadedBody.equals(fileBody));

  // --- Realtime surface ---------------------------------------------------
  const wsAlice = await connectWs(alice.token);
  const wsBob = await connectWs(bob.token);
  assert('both clients authenticate over WebSocket', true);

  const createdForBob = waitForEvent(wsBob, 'chat.created');
  const realtimeChat = await api('POST', '/chats/private', { targetUserId: bob.id }, alice.token);
  const createdPayload = await createdForBob;
  assert('chat.created is pushed to the peer in realtime', createdPayload?.id === realtimeChat.id);

  const newForBob = waitForEvent(wsBob, 'message.new');
  const realtimeMessage = await api('POST', `/chats/${realtimeChat.id}/messages`, {
    type: 'TEXT',
    content: 'realtime hello',
    clientTempId: '00000000-0000-4000-8000-000000000002',
  }, alice.token);
  const newPayload = await newForBob;
  assert('message.new is pushed to the peer in realtime', newPayload?.message?.id === realtimeMessage.id);

  const updatedForAlice = waitForEvent(wsAlice, 'message.updated');
  await api('POST', `/chats/${realtimeChat.id}/messages/${realtimeMessage.id}/react`, { emoji: 'OK' }, bob.token);
  const updatedPayload = await updatedForAlice;
  assert('message.updated is pushed back in realtime', updatedPayload?.messageId === realtimeMessage.id);

  wsAlice.close();
  wsBob.close();

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nTOTAL=${results.length} FAILED=${failed}`);
  // NOTE: we set `exitCode` instead of calling `process.exit()` so that
  // buffered stdout is flushed even when it is redirected to a pipe/file.
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(`\nFATAL: ${error.message}`);
  process.exitCode = 1;
});
