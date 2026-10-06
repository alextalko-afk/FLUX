import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { authenticator } from 'otplib';
import {
  API_URL,
  PASSWORD,
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

describe('two-factor authentication and recovery codes', () => {
  let user: TestUser;
  let secret: string;
  let recoveryCodes: string[];

  beforeAll(async () => {
    await resetRateLimits();
    user = await createUser('twofa');
    const setup = await api('POST', '/auth/2fa/setup', undefined, user.token);
    secret = setup.json.secret;
    const enable = await api('POST', '/auth/2fa/enable', { code: authenticator.generate(secret) }, user.token);
    recoveryCodes = enable.json.backupCodes;
  });

  afterAll(async () => {
    await removeUser(user);
  });

  const passwordLogin = (totp?: string) =>
    api('POST', '/auth/login', { email: user.email, password: PASSWORD, totp });

  it('issues ten recovery codes in a fixed format and reports how many remain', async () => {
    expect(recoveryCodes).toHaveLength(10);
    expect(recoveryCodes.every((code) => /^[0-9a-f]{5}-[0-9a-f]{5}$/.test(code))).toBe(true);

    const me = await api('GET', '/auth/me', undefined, user.token);
    expect(me.json.twoFactorBackupCodesRemaining).toBe(10);
  });

  it('asks for a second factor and accepts a recovery code exactly once', async () => {
    expect((await passwordLogin()).json.requiresTwoFactor).toBe(true);

    const first = await passwordLogin(recoveryCodes[0]);
    expect(first.status).toBe(200);
    const reuse = await passwordLogin(recoveryCodes[0]);
    expect(reuse.status).toBe(401);

    const me = await api('GET', '/auth/me', undefined, first.json.accessToken);
    expect(me.json.twoFactorBackupCodesRemaining).toBe(9);
  });

  it('regenerates codes only with a TOTP, and retires the old set', async () => {
    const withRecoveryCode = await api(
      'POST',
      '/auth/2fa/backup-codes/regenerate',
      { code: recoveryCodes[1] },
      user.token,
    );
    expect(withRecoveryCode.status).toBe(400);

    const regenerated = await api(
      'POST',
      '/auth/2fa/backup-codes/regenerate',
      { code: authenticator.generate(secret) },
      user.token,
    );
    expect(regenerated.status).toBe(200);
    expect(regenerated.json.backupCodes).toHaveLength(10);

    expect((await passwordLogin(recoveryCodes[2])).status).toBe(401);
    expect((await passwordLogin(regenerated.json.backupCodes[0])).status).toBe(200);
  });
});

describe('session revocation', () => {
  let user: TestUser;

  beforeAll(async () => {
    await resetRateLimits();
    user = await createUser('sess');
  });

  afterAll(async () => {
    await removeUser(user);
  });

  it('rejects the access token of a terminated session at once and closes its socket', async () => {
    const other = await api('POST', '/auth/login', { email: user.email, password: PASSWORD });
    const otherToken: string = other.json.accessToken;
    const otherSessionId = JSON.parse(
      Buffer.from(otherToken.split('.')[1], 'base64url').toString(),
    ).sessionId;

    const socket = await openSocket(otherToken);
    await wait(300);

    const terminated = await api('POST', `/users/me/sessions/${otherSessionId}/terminate`, undefined, user.token);
    expect(terminated.status).toBe(200);

    const rejected = await api('GET', '/auth/me', undefined, otherToken);
    expect(rejected.status).toBe(401);
    expect(rejected.json.code).toBe('SESSION_REVOKED');

    await waitFor(() => socket.closeCode !== null);
    expect(socket.closeCode).toBe(4003);
    expect(socket.frames.some((frame) => frame.event === 'session.revoked')).toBe(true);

    expect((await api('GET', '/auth/me', undefined, user.token)).status).toBe(200);
  });
});

describe('data export and account deletion', () => {
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let bobChat: string;
  let carolChat: string;

  beforeAll(async () => {
    await resetRateLimits();
    alice = await createUser('exp_a');
    bob = await createUser('exp_b');
    carol = await createUser('exp_c');
    bobChat = await openPrivateChat(alice.token, bob.id);
    carolChat = await openPrivateChat(alice.token, carol.id);
  });

  afterAll(async () => {
    await removeUser(alice);
    await removeUser(bob);
    await removeUser(carol);
  });

  it('exports the caller’s own data as a valid JSON attachment without secrets', async () => {
    for (const n of [1, 2, 3]) await sendText(alice.token, bobChat, `alice message ${n}`);

    const response = await fetch(`${API_URL}/users/me/export`, {
      headers: { authorization: `Bearer ${alice.token}` },
    });
    const text = await response.text();
    const exported = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toMatch(/attachment/);
    expect(exported.profile.emails[0].email).toBe(alice.email);
    expect(exported.messages.filter((m: any) => /alice message/.test(m.content))).toHaveLength(3);
    expect(text).not.toMatch(/passwordCredential|"secret"|backupCodes|"hash"/);
  });

  it('requires the right password to delete an account', async () => {
    const wrong = await api('DELETE', '/users/me', { password: 'WrongPass1' }, bob.token);
    expect(wrong.status).toBe(400);
    expect(wrong.json.code).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('erases the messages of the deleted account when asked, and frees e-mail and username', async () => {
    await sendText(bob.token, bobChat, 'bob says hi');

    const deleted = await api('DELETE', '/users/me', { password: PASSWORD, deleteMessages: true }, bob.token);
    expect(deleted.status).toBe(200);

    expect((await api('GET', '/auth/me', undefined, bob.token)).status).toBe(401);
    expect((await api('POST', '/auth/login', { email: bob.email, password: PASSWORD })).status).toBe(401);

    const history = await api('GET', `/chats/${bobChat}/messages`, undefined, alice.token);
    expect(history.json.items.some((m: any) => m.senderId === bob.id)).toBe(false);
    expect(history.json.items.filter((m: any) => /alice message/.test(m.content))).toHaveLength(3);

    const again = await api('POST', '/auth/register', {
      email: bob.email,
      password: PASSWORD,
      firstName: 'Again',
      username: bob.username,
    });
    expect(again.status).toBe(201);

    // Leave nothing behind: verify and remove the account that was just re-created.
    await api('POST', '/auth/email/verify', { email: bob.email, code: again.json.devCode });
    const relogin = await api('POST', '/auth/login', { email: bob.email, password: PASSWORD });
    await api('DELETE', '/users/me', { password: PASSWORD }, relogin.json.accessToken);
  });

  it('keeps the messages of a deleted account attributed to "Deleted account" by default', async () => {
    await sendText(carol.token, carolChat, 'carol was here');

    const deleted = await api('DELETE', '/users/me', { password: PASSWORD }, carol.token);
    expect(deleted.status).toBe(200);

    const history = await api('GET', `/chats/${carolChat}/messages`, undefined, alice.token);
    const message = history.json.items.find((m: any) => m.content === 'carol was here');

    expect(message.sender.firstName).toBe('Deleted account');
    expect(message.sender.username).toBeNull();
    expect(message.sender.avatarUrl).toBeNull();
    expect(message.sender).not.toHaveProperty('emails');
  });
});
