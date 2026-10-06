import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { API_URL, PASSWORD, TestUser, api, createUser, removeUser, resetRateLimits, wait } from './helpers';

const cookiesOf = (res: Response) =>
  Object.fromEntries(
    res.headers.getSetCookie().map((line) => {
      const [pair] = line.split(';');
      const at = pair.indexOf('=');
      return [pair.slice(0, at), pair.slice(at + 1)];
    }),
  ) as Record<string, string>;

const refresh = (cookies: Record<string, string>) =>
  fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
      'x-csrf-token': cookies.csrf_token,
    },
  });

describe('sign-in hardening', () => {
  let user: TestUser;

  beforeAll(async () => {
    await resetRateLimits();
    user = await createUser('hard');
  });
  afterAll(() => removeUser(user));

  it('answers a wrong password and an unknown address identically', async () => {
    const wrong = await api('POST', '/auth/login', { email: user.email, password: 'Wrong-pass-1!' });
    const unknown = await api('POST', '/auth/login', { email: `nobody.${Date.now()}@example.com`, password: 'Wrong-pass-1!' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json.code).toBe(unknown.json.code);
  });

  it('does not reveal an unverified account to someone without the password', async () => {
    const email = `unverified.${Date.now()}@example.com`;
    await api('POST', '/auth/register', { email, password: PASSWORD, firstName: 'U', username: `unv_${Date.now().toString(36)}` });
    const guess = await api('POST', '/auth/login', { email, password: 'Wrong-pass-1!' });
    expect(guess.status).toBe(401);
    expect(guess.json.code).toBe('INVALID_CREDENTIALS');
    const owner = await api('POST', '/auth/login', { email, password: PASSWORD });
    expect(owner.json.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('lets only one of two simultaneous refreshes through', async () => {
    const login = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: PASSWORD }),
    });
    const cookies = cookiesOf(login);
    const [a, b] = await Promise.all([refresh(cookies), refresh(cookies)]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
  });

  it('closes the session when a spent refresh token is replayed later', async () => {
    const login = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: PASSWORD }),
    });
    const stolen = cookiesOf(login);
    const first = await refresh(stolen);
    expect(first.status).toBe(200);
    const current = { ...stolen, ...cookiesOf(first) };

    expect((await refresh(stolen)).status).toBe(401); // within grace: a retry, session survives
    expect((await refresh(current)).status).toBe(200);

    await wait(16_000);
    expect((await refresh(stolen)).status).toBe(401); // replay: kills the session
    const afterwards = await refresh({ ...current, ...cookiesOf(await refresh(current)) });
    expect(afterwards.status).toBe(401);
  }, 40_000);
});
