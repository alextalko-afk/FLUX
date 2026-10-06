import { api } from '../../lib/api';
import { decryptGroup, encryptGroup, newGroupKey, openGroupKey, payloadEpoch, sealGroupKey } from './groupCrypto';
import { readIdentity } from './keystore';

export type GroupE2eeStatus =
  /** The current key is here: messages can be read and sent. */
  | 'ready'
  /** Nobody who holds the key has handed it to this device yet (an administrator must be online). */
  | 'waiting'
  /** This browser does not hold the key the account registered. */
  | 'wrong-device'
  | 'error';

interface Info {
  epoch: number;
  canDistribute: boolean;
  rotationNeeded: boolean;
  myDevice: { id: string; publicKey: string } | null;
  myShares: { epoch: number; deviceKeyId: string; sealed: string }[];
  members: { userId: string; deviceKeyId: string | null; publicKey: string | null; hasShare: boolean }[];
}

interface Loaded {
  status: GroupE2eeStatus;
  epoch: number;
  keys: Map<number, Uint8Array>;
}

const cache = new Map<string, Promise<Loaded>>();
const lastRefresh = new Map<string, number>();
const REFRESH_COOLDOWN_MS = 10_000;

async function distribute(chatId: string, info: Info, keys: Map<number, Uint8Array>): Promise<number> {
  const withKey = info.members.filter((m) => m.publicKey && m.deviceKeyId);
  const shareFor = async (key: Uint8Array, members: typeof withKey) =>
    Promise.all(members.map(async (m) => ({ userId: m.userId, deviceKeyId: m.deviceKeyId!, sealed: await sealGroupKey(key, m.publicKey!) })));

  // Somebody left: a fresh key, so they cannot read what is sent from now on.
  if (info.rotationNeeded) {
    const key = await newGroupKey();
    const epoch = info.epoch + 1;
    await api.put(`/chats/${chatId}/e2ee/shares`, { epoch, shares: await shareFor(key, withKey) });
    keys.set(epoch, key);
    return epoch;
  }

  const current = keys.get(info.epoch);
  // The very first key of the group is created by the administrator who opens it first.
  if (!current && info.epoch === 0 && !info.members.some((m) => m.hasShare)) {
    const key = await newGroupKey();
    await api.put(`/chats/${chatId}/e2ee/shares`, { epoch: 0, shares: await shareFor(key, withKey) });
    keys.set(0, key);
    return 0;
  }

  const missing = withKey.filter((m) => !m.hasShare);
  if (current && missing.length > 0) {
    await api.put(`/chats/${chatId}/e2ee/shares`, { epoch: info.epoch, shares: await shareFor(current, missing) });
  }
  return info.epoch;
}

async function load(chatId: string, myUserId: string): Promise<Loaded> {
  const keys = new Map<number, Uint8Array>();
  try {
    const info = await api.get<Info>(`/chats/${chatId}/e2ee`);
    const identity = await readIdentity(myUserId);
    if (!identity || !info.myDevice || identity.publicKey !== info.myDevice.publicKey) {
      return { status: 'wrong-device', epoch: info.epoch, keys };
    }
    for (const share of info.myShares) {
      if (share.deviceKeyId !== info.myDevice.id) continue;
      try {
        keys.set(share.epoch, await openGroupKey(share.sealed, identity));
      } catch {
        // A share sealed to an older key of this account: it stays unreadable.
      }
    }

    let epoch = info.epoch;
    if (info.canDistribute) {
      try {
        epoch = await distribute(chatId, info, keys);
      } catch {
        // Somebody else distributed first; the next refresh picks it up.
      }
    }
    return { status: keys.has(epoch) ? 'ready' : 'waiting', epoch, keys };
  } catch {
    return { status: 'error', epoch: 0, keys };
  }
}

/** Loads (once) and caches the group keys of this device. */
export function getGroupChat(chatId: string, myUserId: string): Promise<Loaded> {
  let loaded = cache.get(chatId);
  if (!loaded) {
    loaded = load(chatId, myUserId);
    cache.set(chatId, loaded);
    void loaded.then((result) => {
      if (result.status === 'error') cache.delete(chatId);
    });
  }
  return loaded;
}

/** Forgets the cached keys, e.g. after the server reported a newer epoch. */
export function refreshGroupChat(chatId: string, myUserId: string, force = false): Promise<Loaded> {
  const last = lastRefresh.get(chatId) ?? 0;
  if (!force && Date.now() - last < REFRESH_COOLDOWN_MS) return getGroupChat(chatId, myUserId);
  lastRefresh.set(chatId, Date.now());
  cache.delete(chatId);
  return getGroupChat(chatId, myUserId);
}

export function forgetGroupChats(): void {
  cache.clear();
}

export async function encryptForGroup(chatId: string, myUserId: string, text: string): Promise<string> {
  let loaded = await getGroupChat(chatId, myUserId);
  if (loaded.status !== 'ready') loaded = await refreshGroupChat(chatId, myUserId, true);
  const key = loaded.keys.get(loaded.epoch);
  if (loaded.status !== 'ready' || !key) throw new Error('Group key is not available on this device');
  return encryptGroup(key, chatId, loaded.epoch, text);
}

export async function decryptForGroup(chatId: string, myUserId: string, payload: string): Promise<string> {
  const epoch = payloadEpoch(payload);
  if (epoch === null) throw new Error('Not an encrypted group message');
  let loaded = await getGroupChat(chatId, myUserId);
  if (!loaded.keys.has(epoch)) loaded = await refreshGroupChat(chatId, myUserId);
  const key = loaded.keys.get(epoch);
  if (!key) throw new Error('No key for this epoch on this device');
  return decryptGroup(key, chatId, payload);
}
