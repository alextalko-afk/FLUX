import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits } from './helpers';

describe('QR sign-in', () => {
  let user: TestUser;

  beforeAll(async () => {
    await resetRateLimits();
    user = await createUser('qr_u');
  });

  afterAll(async () => {
    await removeUser(user);
  });

  it('creates a code with a link and an image', async () => {
    const res = await api('POST', '/auth/qr', {});
    expect(res.status).toBe(200);
    expect(res.json.url).toContain(`/qr-login?token=${res.json.token}`);
    expect(res.json.qr).toMatch(/^data:image\/png;base64,/);
    expect((await api('POST', '/auth/qr/status', { token: res.json.token })).json.status).toBe('pending');
  });

  it('signs in only after approval by a signed-in device, and only once', async () => {
    const { token } = (await api('POST', '/auth/qr', {})).json;

    expect((await api('POST', '/auth/qr/complete', { token })).json.code).toBe('QR_NOT_APPROVED');
    expect((await api('POST', '/auth/qr/approve', { token })).status).toBe(401);

    const preview = await api('POST', '/auth/qr/preview', { token }, user.token);
    expect(preview.status).toBe(200);
    expect(preview.json).toHaveProperty('userAgent');

    expect((await api('POST', '/auth/qr/approve', { token }, user.token)).status).toBe(200);
    expect((await api('POST', '/auth/qr/status', { token })).json).toMatchObject({ status: 'approved', requiresTwoFactor: false });

    const done = await api('POST', '/auth/qr/complete', { token });
    expect(done.status).toBe(200);
    expect(done.json.user.id).toBe(user.id);
    expect(typeof done.json.accessToken).toBe('string');

    expect((await api('POST', '/auth/qr/complete', { token })).json.code).toBe('QR_EXPIRED');
    expect((await api('POST', '/auth/qr/status', { token })).json.status).toBe('expired');
  });

  it('treats unknown tokens as expired', async () => {
    const token = 'x'.repeat(32);
    expect((await api('POST', '/auth/qr/status', { token })).json.status).toBe('expired');
    expect((await api('POST', '/auth/qr/preview', { token }, user.token)).status).toBe(404);
  });
});
