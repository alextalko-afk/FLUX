import { describe, it, expect } from 'vitest';
import { generateKeyPair } from '../../../apps/web/src/services/e2ee/e2ee';
import {
  decryptGroup,
  encryptGroup,
  newGroupKey,
  openGroupKey,
  payloadEpoch,
  sealGroupKey,
} from '../../../apps/web/src/services/e2ee/groupCrypto';

describe('group crypto', () => {
  it('seals a key to one device only', async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const key = await newGroupKey();
    const sealed = await sealGroupKey(key, a.publicKey);
    expect(Buffer.from(await openGroupKey(sealed, a)).equals(Buffer.from(key))).toBe(true);
    await expect(openGroupKey(sealed, b)).rejects.toThrow();
  });

  it('round-trips and binds the ciphertext to its chat and epoch', async () => {
    const key = await newGroupKey();
    const payload = await encryptGroup(key, 'chat-1', 3, 'hello');
    expect(payloadEpoch(payload)).toBe(3);
    expect(await decryptGroup(key, 'chat-1', payload)).toBe('hello');
    await expect(decryptGroup(key, 'chat-2', payload)).rejects.toThrow();
    await expect(decryptGroup(key, 'chat-1', payload.replace('e2g1.3.', 'e2g1.4.'))).rejects.toThrow();
    await expect(decryptGroup(await newGroupKey(), 'chat-1', payload)).rejects.toThrow();
  });
});
