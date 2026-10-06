import Redis from 'ioredis';

/**
 * Helpers for tests that talk to a RUNNING API over HTTP and WebSocket.
 *
 * They need the stack from `pnpm docker:up` plus `pnpm dev:server` (or a
 * production start) on `API_URL`. Every test creates its own users and removes
 * them again, so nothing is left in the database and no seed data is assumed.
 */

export const API_URL = process.env.API_URL ?? 'http://localhost:3000/api/v1';
export const WS_URL = process.env.WS_URL ?? 'ws://localhost:3000/ws';
export const PASSWORD = 'Str0ngPass!234';

export interface ApiResult<T = any> {
  status: number;
  json: T;
  text: string;
  headers: Headers;
}

export async function api<T = any>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<ApiResult<T>> {
  const response = await fetch(API_URL + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON body (e.g. the data export stream is checked separately).
  }

  return { status: response.status, json, text, headers: response.headers };
}

/**
 * Clears the API's rate-limit counters. The suites register several accounts
 * per run, which would otherwise trip the per-IP registration limit after a
 * few runs and make the tests fail for a reason that has nothing to do with
 * what they check.
 */
export async function resetRateLimits(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  try {
    const keys = await redis.keys('rl:*');
    if (keys.length > 0) await redis.del(...keys);
  } finally {
    redis.disconnect();
  }
}

export interface TestUser {
  id: string;
  email: string;
  username: string;
  token: string;
}

let counter = 0;

/** Registers, verifies and signs in a brand-new account. */
export async function createUser(label: string): Promise<TestUser> {
  counter += 1;
  const suffix = `${Date.now().toString(36)}${counter}`;
  const email = `${label}.${suffix}@example.com`;
  const username = `${label}_${suffix}`.slice(0, 32);

  const registered = await api('POST', '/auth/register', {
    email,
    password: PASSWORD,
    firstName: label,
    username,
  });
  if (registered.status !== 201) {
    throw new Error(`register failed: ${registered.status} ${registered.text}`);
  }

  const verified = await api('POST', '/auth/email/verify', {
    email,
    code: registered.json.devCode,
  });
  if (verified.status !== 200) {
    throw new Error(`verify failed: ${verified.status} ${verified.text}`);
  }

  const login = await api('POST', '/auth/login', { email, password: PASSWORD });
  if (login.status !== 200) {
    throw new Error(`login failed: ${login.status} ${login.text}`);
  }

  return { id: login.json.user.id, email, username, token: login.json.accessToken };
}

/** Deletes an account through the public API; ignores accounts already gone. */
export async function removeUser(user: TestUser | undefined): Promise<void> {
  if (!user) return;
  await api('DELETE', '/users/me', { password: PASSWORD, deleteMessages: true }, user.token);
}

export interface TestSocket {
  frames: any[];
  closeCode: number | null;
  close: () => void;
  send: (data: unknown) => void;
}

/** Asks for a one-time WebSocket ticket; the access token never goes into the URL. */
export async function wsTicket(token: string): Promise<string> {
  const res = await api('POST', '/sync/ticket', undefined, token);
  return res.json.ticket;
}

export async function openSocket(token: string): Promise<TestSocket> {
  const ticket = await wsTicket(token);
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${WS_URL}?ticket=${encodeURIComponent(ticket)}`);
    const state: TestSocket = {
      frames: [],
      closeCode: null,
      close: () => socket.close(),
      send: (data) => socket.send(JSON.stringify(data)),
    };
    socket.onmessage = (event) => state.frames.push(JSON.parse(String(event.data)));
    socket.onclose = (event) => {
      state.closeCode = event.code;
    };
    socket.onopen = () => resolve(state);
    socket.onerror = () => reject(new Error('WebSocket connection failed'));
  });
}

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until `check` returns a truthy value or the timeout elapses. */
export async function waitFor<T>(
  check: () => T | undefined | null | false,
  timeoutMs = 5000,
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value) return value as T;
    if (Date.now() > deadline) return undefined;
    await wait(100);
  }
}

export async function sendText(
  token: string,
  chatId: string,
  content: string,
  extra: Record<string, unknown> = {},
): Promise<ApiResult> {
  return api(
    'POST',
    `/chats/${chatId}/messages`,
    { type: 'TEXT', content, clientTempId: crypto.randomUUID(), ...extra },
    token,
  );
}

export async function openPrivateChat(token: string, targetUserId: string): Promise<string> {
  const chat = await api('POST', '/chats/private', { targetUserId }, token);
  if (chat.status >= 300) throw new Error(`chat failed: ${chat.status} ${chat.text}`);
  return chat.json.id ?? chat.json.chat?.id;
}
