/**
 * Client-generated identifiers.
 *
 * Hermes (the React Native JS engine) exposes no `crypto.randomUUID`, and the
 * Web Crypto API is not available without an extra native module. We therefore
 * generate RFC 4122 version 4 identifiers from `Math.random()`.
 *
 * These ids are used for message idempotency keys, so they only need to be
 * unique per client session, not cryptographically strong.
 */

const HEX = '0123456789abcdef';

function randomHex(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += HEX[Math.floor(Math.random() * 16)];
  }
  return out;
}

/** Returns a RFC 4122 v4 UUID, e.g. `1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed`. */
export function uuidv4(): string {
  return [
    randomHex(8),
    randomHex(4),
    `4${randomHex(3)}`,
    `${HEX[8 + Math.floor(Math.random() * 4)]}${randomHex(3)}`,
    `${HEX[8 + Math.floor(Math.random() * 4)]}${randomHex(3)}`,
    randomHex(12),
  ].join('-');
}

/**
 * Short opaque id for optimistic rows. Distinct from {@link uuidv4} so that a
 * temporary client id can never collide with a server-assigned one.
 */
export function shortId(): string {
  return `${Date.now().toString(36)}${randomHex(6)}`;
}
