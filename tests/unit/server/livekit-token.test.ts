import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { createLivekitToken } from '../../../apps/server/src/calls/livekit-token';

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

describe('createLivekitToken', () => {
  const opts = { apiKey: 'devkey', apiSecret: 'secret-secret-secret-secret-secret-1', room: 'chat:call', identity: 'user-1', name: 'Anna', now: 1_000_000 };

  it('produces an HS256 JWT scoped to one room', () => {
    const [h, p, s] = createLivekitToken(opts).split('.');
    expect(decode(h)).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(decode(p)).toMatchObject({
      iss: 'devkey',
      sub: 'user-1',
      name: 'Anna',
      exp: 1_003_600,
      video: { room: 'chat:call', roomJoin: true, canSubscribe: true, canPublish: true },
    });
    expect(createHmac('sha256', opts.apiSecret).update(`${h}.${p}`).digest('base64url')).toBe(s);
  });

  it('is rejected by a different secret and honours ttl and publish rights', () => {
    const [h, p, s] = createLivekitToken({ ...opts, ttlSeconds: 60, canPublish: false }).split('.');
    expect(createHmac('sha256', 'another-secret').update(`${h}.${p}`).digest('base64url')).not.toBe(s);
    expect(decode(p).exp).toBe(1_000_060);
    expect(decode(p).video.canPublish).toBe(false);
  });
});
