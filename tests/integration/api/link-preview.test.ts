import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestUser, api, createUser, removeUser, resetRateLimits } from './helpers';

describe('link preview', () => {
  let user: TestUser;
  beforeAll(async () => {
    await resetRateLimits();
    user = await createUser('lp');
  });
  afterAll(() => removeUser(user));

  const get = (url: string, token = user.token) => api('GET', `/link-preview?url=${encodeURIComponent(url)}`, undefined, token);

  it('needs a signed-in user', async () => {
    expect((await get('https://example.com', '')).status).toBe(401);
  });

  it('rejects non-web schemes', async () => {
    expect((await get('file:///etc/passwd')).status).toBe(400);
    expect((await get('ftp://example.com')).status).toBe(400);
  });

  it('never fetches private addresses', async () => {
    for (const url of ['http://127.0.0.1/', 'http://localhost/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://10.0.0.1/']) {
      const res = await get(url);
      expect(res.status).toBe(200);
      expect(res.json.preview).toBeNull();
    }
  });
});
