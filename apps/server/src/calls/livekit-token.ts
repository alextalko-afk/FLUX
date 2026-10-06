import { createHmac } from 'node:crypto';

export interface LivekitTokenOptions {
  apiKey: string;
  apiSecret: string;
  room: string;
  /** Participant identity: the FLUX user id. */
  identity: string;
  name?: string;
  ttlSeconds?: number;
  canPublish?: boolean;
  /** Seconds since epoch; injectable for tests. */
  now?: number;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

/**
 * Builds a LiveKit access token: an HS256 JWT whose `video` grant limits it to one room.
 * Written out by hand (it is a handful of lines) so the server needs no LiveKit SDK.
 */
export function createLivekitToken(opts: LivekitTokenOptions): string {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: opts.apiKey,
    sub: opts.identity,
    name: opts.name,
    nbf: now - 10,
    exp: now + (opts.ttlSeconds ?? 3600),
    video: {
      room: opts.room,
      roomJoin: true,
      canSubscribe: true,
      canPublish: opts.canPublish ?? true,
      canPublishData: true,
    },
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createHmac('sha256', opts.apiSecret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}
