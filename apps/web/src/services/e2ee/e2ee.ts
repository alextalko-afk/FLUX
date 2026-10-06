/**
 * End-to-end encryption for secret chats, built on libsodium.
 *
 * - Each device owns an X25519 key pair; only the public half ever leaves it.
 * - Two devices derive directional session keys with `crypto_kx`, so neither
 *   side ever sends a secret and each direction has its own key.
 * - Messages are sealed with XChaCha20-Poly1305. The chat id is authenticated
 *   as associated data, so a ciphertext copied into another chat fails to open.
 *
 * Nothing here touches the network or storage; that keeps it testable.
 */

type Sodium = typeof import('libsodium-wrappers');

let sodiumPromise: Promise<Sodium> | null = null;

/** libsodium is a WebAssembly module: load it on first use, not at app start. */
export function loadSodium(): Promise<Sodium> {
  if (!sodiumPromise) {
    sodiumPromise = import('libsodium-wrappers').then(async (module) => {
      const sodium = ((module as any).default ?? module) as Sodium;
      await sodium.ready;
      return sodium;
    });
  }
  return sodiumPromise;
}

/** Prefix the server requires on every message of a secret chat. */
export const PAYLOAD_PREFIX = 'e2e1.';

export interface DeviceKeyPair {
  /** Standard padded base64, 32 bytes: the form the server stores. */
  publicKey: string;
  privateKey: string;
}

export interface SessionKeys {
  /** Seals what we send. */
  tx: Uint8Array;
  /** Opens what the peer sends. */
  rx: Uint8Array;
}

export async function generateKeyPair(): Promise<DeviceKeyPair> {
  const sodium = await loadSodium();
  const pair = sodium.crypto_kx_keypair();
  return {
    publicKey: sodium.to_base64(pair.publicKey, sodium.base64_variants.ORIGINAL),
    privateKey: sodium.to_base64(pair.privateKey, sodium.base64_variants.ORIGINAL),
  };
}

/**
 * Derives the keys for one pair of devices. `crypto_kx` needs one side to act
 * as client and the other as server; the account with the smaller id is the
 * client, so both devices reach the same decision without talking to each other.
 */
export async function deriveSession(
  mine: DeviceKeyPair,
  peerPublicKey: string,
  myUserId: string,
  peerUserId: string,
): Promise<SessionKeys> {
  const sodium = await loadSodium();
  const original = sodium.base64_variants.ORIGINAL;
  const myPublic = sodium.from_base64(mine.publicKey, original);
  const mySecret = sodium.from_base64(mine.privateKey, original);
  const peerPublic = sodium.from_base64(peerPublicKey, original);

  if (peerPublic.length !== sodium.crypto_kx_PUBLICKEYBYTES) {
    throw new Error('Peer public key has the wrong length');
  }

  const iAmClient = myUserId < peerUserId;
  const keys = iAmClient
    ? sodium.crypto_kx_client_session_keys(myPublic, mySecret, peerPublic)
    : sodium.crypto_kx_server_session_keys(myPublic, mySecret, peerPublic);

  return { tx: keys.sharedTx, rx: keys.sharedRx };
}

/** Seals `text` for `chatId`. The result is what the server stores as `content`. */
export async function encryptText(
  session: SessionKeys,
  chatId: string,
  text: string,
): Promise<string> {
  const sodium = await loadSodium();
  // A fresh random 24-byte nonce per message: large enough that collisions are not a concern.
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    sodium.from_string(text),
    sodium.from_string(chatId),
    null,
    nonce,
    session.tx,
  );

  const packed = new Uint8Array(nonce.length + sealed.length);
  packed.set(nonce, 0);
  packed.set(sealed, nonce.length);
  return PAYLOAD_PREFIX + sodium.to_base64(packed, sodium.base64_variants.URLSAFE_NO_PADDING);
}

/** Opens a message. Throws if it was altered, came from another chat, or the keys differ. */
export async function decryptText(
  session: SessionKeys,
  chatId: string,
  payload: string,
): Promise<string> {
  const sodium = await loadSodium();
  if (!payload.startsWith(PAYLOAD_PREFIX)) throw new Error('Not an encrypted message');

  const packed = sodium.from_base64(
    payload.slice(PAYLOAD_PREFIX.length),
    sodium.base64_variants.URLSAFE_NO_PADDING,
  );
  const nonceLength = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  if (packed.length <= nonceLength) throw new Error('Encrypted message is too short');

  const opened = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    packed.slice(nonceLength),
    sodium.from_string(chatId),
    packed.slice(0, nonceLength),
    session.rx,
  );
  return sodium.to_string(opened);
}

/**
 * A short code both people can compare out loud or side by side. It is a hash
 * of the two public keys in a fixed order, so it is identical on both devices,
 * and it changes if anyone (the server included) swaps a key in between.
 */
export async function safetyNumber(publicKeyA: string, publicKeyB: string): Promise<string> {
  const sodium = await loadSodium();
  const [first, second] = [publicKeyA, publicKeyB].sort();

  const digest = sodium.crypto_generichash(
    32,
    sodium.from_string(`flux-safety-number-v1|${first}|${second}`),
    null,
  );

  const groups: string[] = [];
  for (let i = 0; i < 24; i += 2) {
    const value = (digest[i]! << 8) | digest[i + 1]!;
    groups.push(String(value % 100000).padStart(5, '0'));
  }
  return groups.join(' ');
}
