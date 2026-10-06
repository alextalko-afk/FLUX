import { api } from '../../lib/api';
import {
  decryptText,
  deriveSession,
  encryptText,
  safetyNumber,
  type SessionKeys,
} from './e2ee';
import { readIdentity } from './keystore';

export type SecretState =
  /** Keys are loaded; messages can be read and sent. */
  | { status: 'ready'; safetyNumber: string; peerRevoked: boolean }
  /** This browser does not hold the key the chat was started with. */
  | { status: 'wrong-device' }
  /** The key of this device (or the peer's) was revoked. */
  | { status: 'revoked' }
  | { status: 'error' };

interface Loaded {
  state: SecretState;
  session?: SessionKeys;
}

interface SecretInfo {
  self: { userId: string; deviceKeyId: string; publicKey: string; revoked: boolean };
  peer: { userId: string; deviceKeyId: string; publicKey: string; revoked: boolean };
}

const cache = new Map<string, Promise<Loaded>>();

async function load(chatId: string, myUserId: string): Promise<Loaded> {
  try {
    const info = await api.get<SecretInfo>(`/chats/${chatId}/secret`);
    if (info.self.revoked) return { state: { status: 'revoked' } };

    const identity = await readIdentity(myUserId);
    if (!identity || identity.publicKey !== info.self.publicKey) {
      // Another browser or a cleared profile: the private key is not here.
      return { state: { status: 'wrong-device' } };
    }

    const session = await deriveSession(identity, info.peer.publicKey, myUserId, info.peer.userId);
    return {
      session,
      state: {
        status: 'ready',
        safetyNumber: await safetyNumber(info.self.publicKey, info.peer.publicKey),
        peerRevoked: info.peer.revoked,
      },
    };
  } catch {
    return { state: { status: 'error' } };
  }
}

/** Loads (once) and caches the keys of a secret chat for this device. */
export function getSecretChat(chatId: string, myUserId: string): Promise<Loaded> {
  let loaded = cache.get(chatId);
  if (!loaded) {
    loaded = load(chatId, myUserId);
    cache.set(chatId, loaded);
    // A failed load must not be cached for good: the next call tries again.
    void loaded.then((result) => {
      if (result.state.status === 'error') cache.delete(chatId);
    });
  }
  return loaded;
}

export function forgetSecretChats(): void {
  cache.clear();
}

export async function encryptForChat(chatId: string, myUserId: string, text: string): Promise<string> {
  const { session, state } = await getSecretChat(chatId, myUserId);
  if (state.status !== 'ready' || !session || state.peerRevoked) {
    throw new Error('Secret chat is not available on this device');
  }
  return encryptText(session, chatId, text);
}

export async function decryptForChat(chatId: string, myUserId: string, payload: string): Promise<string> {
  const { session, state } = await getSecretChat(chatId, myUserId);
  if (state.status !== 'ready' || !session) {
    throw new Error('Secret chat is not available on this device');
  }
  return decryptText(session, chatId, payload);
}
