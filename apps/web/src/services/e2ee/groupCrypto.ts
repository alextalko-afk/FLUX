import { loadSodium, type DeviceKeyPair } from './e2ee';

/** Prefix of a group message: `e2g1.<epoch>.` then base64url of `nonce || ciphertext`. */
export const GROUP_PREFIX = 'e2g1.';

/** A fresh random 32-byte group key (one per epoch). */
export async function newGroupKey(): Promise<Uint8Array> {
  const sodium = await loadSodium();
  return sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
}

/** Seals the group key to a member's device public key (anyone can seal, only that device opens). */
export async function sealGroupKey(key: Uint8Array, memberPublicKey: string): Promise<string> {
  const sodium = await loadSodium();
  const v = sodium.base64_variants.ORIGINAL;
  return sodium.to_base64(sodium.crypto_box_seal(key, sodium.from_base64(memberPublicKey, v)), v);
}

export async function openGroupKey(sealed: string, mine: DeviceKeyPair): Promise<Uint8Array> {
  const sodium = await loadSodium();
  const v = sodium.base64_variants.ORIGINAL;
  return sodium.crypto_box_seal_open(
    sodium.from_base64(sealed, v),
    sodium.from_base64(mine.publicKey, v),
    sodium.from_base64(mine.privateKey, v),
  );
}

/** The chat id and epoch are authenticated, so a ciphertext cannot be moved to another chat or epoch. */
const aad = (chatId: string, epoch: number) => `${chatId}|${epoch}`;

export async function encryptGroup(key: Uint8Array, chatId: string, epoch: number, text: string): Promise<string> {
  const sodium = await loadSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    sodium.from_string(text),
    sodium.from_string(aad(chatId, epoch)),
    null,
    nonce,
    key,
  );
  const packed = new Uint8Array(nonce.length + sealed.length);
  packed.set(nonce, 0);
  packed.set(sealed, nonce.length);
  return `${GROUP_PREFIX}${epoch}.${sodium.to_base64(packed, sodium.base64_variants.URLSAFE_NO_PADDING)}`;
}

/** Reads the epoch out of a group payload without decrypting it. */
export function payloadEpoch(payload: string): number | null {
  const match = /^e2g1\.(\d{1,6})\./.exec(payload);
  return match ? Number(match[1]) : null;
}

export async function decryptGroup(key: Uint8Array, chatId: string, payload: string): Promise<string> {
  const sodium = await loadSodium();
  const match = /^e2g1\.(\d{1,6})\.(.+)$/.exec(payload);
  if (!match) throw new Error('Not an encrypted group message');
  const packed = sodium.from_base64(match[2]!, sodium.base64_variants.URLSAFE_NO_PADDING);
  const n = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  if (packed.length <= n) throw new Error('Encrypted message is too short');
  const opened = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    packed.slice(n),
    sodium.from_string(aad(chatId, Number(match[1]))),
    packed.slice(0, n),
    key,
  );
  return sodium.to_string(opened);
}
