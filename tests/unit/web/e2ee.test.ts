import { describe, it, expect, beforeAll } from 'vitest';
import {
  PAYLOAD_PREFIX,
  decryptText,
  deriveSession,
  encryptText,
  generateKeyPair,
  safetyNumber,
  type DeviceKeyPair,
} from '../../../apps/web/src/services/e2ee/e2ee';
import { SECRET_PAYLOAD } from '../../../apps/server/src/messages/secret.util';

const ALICE = 'aaaaaaaa-0000-4000-8000-000000000001';
const BOB = 'bbbbbbbb-0000-4000-8000-000000000002';
const CHAT = 'cccccccc-0000-4000-8000-000000000003';

describe('end-to-end encryption', () => {
  let alice: DeviceKeyPair;
  let bob: DeviceKeyPair;

  beforeAll(async () => {
    alice = await generateKeyPair();
    bob = await generateKeyPair();
  });

  const sessions = async () => ({
    a: await deriveSession(alice, bob.publicKey, ALICE, BOB),
    b: await deriveSession(bob, alice.publicKey, BOB, ALICE),
  });

  it('creates 32-byte keys in the padded base64 form the server expects', () => {
    expect(alice.publicKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(Buffer.from(alice.publicKey, 'base64')).toHaveLength(32);
    expect(alice.privateKey).not.toBe(alice.publicKey);
  });

  it('never repeats a key pair', async () => {
    expect((await generateKeyPair()).publicKey).not.toBe(alice.publicKey);
  });

  it('lets the two devices open each other’s messages without exchanging a secret', async () => {
    const { a, b } = await sessions();
    expect(await decryptText(b, CHAT, await encryptText(a, CHAT, 'hello bob'))).toBe('hello bob');
    expect(await decryptText(a, CHAT, await encryptText(b, CHAT, 'hello alice'))).toBe('hello alice');
  });

  it('uses a different key for each direction', async () => {
    const { a } = await sessions();
    expect(Buffer.from(a.tx).equals(Buffer.from(a.rx))).toBe(false);
  });

  it('round-trips any text, including emoji and long messages', async () => {
    const { a, b } = await sessions();
    for (const text of ['', '😀 привет 你好', 'x'.repeat(4096), 'line1\nline2\ttab']) {
      expect(await decryptText(b, CHAT, await encryptText(a, CHAT, text))).toBe(text);
    }
  });

  it('produces a different ciphertext every time for the same text', async () => {
    const { a } = await sessions();
    const first = await encryptText(a, CHAT, 'same');
    const second = await encryptText(a, CHAT, 'same');
    expect(first).not.toBe(second);
  });

  it('never contains the plaintext', async () => {
    const { a } = await sessions();
    const payload = await encryptText(a, CHAT, 'top secret words');
    expect(payload).not.toContain('top');
    expect(Buffer.from(payload.slice(PAYLOAD_PREFIX.length), 'base64url').toString('utf8')).not.toContain('secret');
  });

  it('produces payloads the server accepts as ciphertext', async () => {
    const { a } = await sessions();
    expect(SECRET_PAYLOAD.test(await encryptText(a, CHAT, 'x'))).toBe(true);
    expect(SECRET_PAYLOAD.test(await encryptText(a, CHAT, 'y'.repeat(4096)))).toBe(true);
  });

  it('refuses a message that was altered', async () => {
    const { a, b } = await sessions();
    const payload = await encryptText(a, CHAT, 'untouched');
    const flipped = payload.slice(0, -2) + (payload.endsWith('A') ? 'B' : 'A') + payload.slice(-1);
    await expect(decryptText(b, CHAT, flipped)).rejects.toThrow();
  });

  it('refuses a message copied into another chat', async () => {
    const { a, b } = await sessions();
    const payload = await encryptText(a, CHAT, 'for one chat only');
    await expect(decryptText(b, 'dddddddd-0000-4000-8000-000000000004', payload)).rejects.toThrow();
  });

  it('refuses to open a message with the wrong keys', async () => {
    const { a } = await sessions();
    const stranger = await generateKeyPair();
    const wrong = await deriveSession(stranger, alice.publicKey, 'zzzz', ALICE);
    await expect(decryptText(wrong, CHAT, await encryptText(a, CHAT, 'private'))).rejects.toThrow();
  });

  it('refuses something that is not an encrypted message', async () => {
    const { b } = await sessions();
    await expect(decryptText(b, CHAT, 'plain text')).rejects.toThrow();
    await expect(decryptText(b, CHAT, `${PAYLOAD_PREFIX}AAAA`)).rejects.toThrow();
  });

  it('rejects a peer key of the wrong length', async () => {
    await expect(deriveSession(alice, Buffer.alloc(16).toString('base64'), ALICE, BOB)).rejects.toThrow();
  });

  it('shows the same safety number on both devices and a new one if a key is swapped', async () => {
    const fromAlice = await safetyNumber(alice.publicKey, bob.publicKey);
    const fromBob = await safetyNumber(bob.publicKey, alice.publicKey);
    expect(fromAlice).toBe(fromBob);
    expect(fromAlice).toMatch(/^(\d{5} ){11}\d{5}$/);

    const mallory = await generateKeyPair();
    expect(await safetyNumber(alice.publicKey, mallory.publicKey)).not.toBe(fromAlice);
  });
});
