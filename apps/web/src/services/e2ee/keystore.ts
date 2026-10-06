import { openDB, type IDBPDatabase } from 'idb';
import { api, ApiError } from '../../lib/api';
import { generateKeyPair, type DeviceKeyPair } from './e2ee';

/**
 * The device's secret-chat identity, kept in this browser's IndexedDB.
 *
 * It never leaves the device and is not synced: that is what makes a secret
 * chat readable only where it was started. The limits are the browser's: the
 * key is stored as bytes in the page's own storage, so someone with access to
 * the unlocked browser profile can read it. Clearing site data destroys it, and
 * the chats it protected become unreadable (the interface says so).
 */
interface StoredIdentity extends DeviceKeyPair {
  userId: string;
  deviceKeyId: string;
  createdAt: number;
}

const DB_NAME = 'flux-e2ee';
const STORE = 'identities';

let dbPromise: Promise<IDBPDatabase> | null = null;
const getDb = () => {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: 'userId' });
    },
  });
  return dbPromise;
};

const label = () => {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${os ? ` on ${os}` : ''}`;
};

export interface DeviceIdentity extends DeviceKeyPair {
  deviceKeyId: string;
}

/** What this browser holds for `userId`, without creating anything. */
export async function readIdentity(userId: string): Promise<DeviceIdentity | null> {
  const stored = (await (await getDb()).get(STORE, userId)) as StoredIdentity | undefined;
  return stored
    ? { publicKey: stored.publicKey, privateKey: stored.privateKey, deviceKeyId: stored.deviceKeyId }
    : null;
}

async function register(pair: DeviceKeyPair) {
  return api.post<{ id: string }>('/security/devices', { publicKey: pair.publicKey, label: label() });
}

/**
 * Returns this device's identity, creating and registering it on first use.
 * If the server says the registered key was revoked, a fresh pair replaces it:
 * chats bound to the old key stay unreadable rather than being re-keyed.
 */
export async function ensureIdentity(userId: string): Promise<DeviceIdentity> {
  const db = await getDb();
  const existing = (await db.get(STORE, userId)) as StoredIdentity | undefined;

  if (existing) {
    try {
      const registered = await register(existing);
      if (registered.id !== existing.deviceKeyId) {
        await db.put(STORE, { ...existing, deviceKeyId: registered.id });
      }
      return { publicKey: existing.publicKey, privateKey: existing.privateKey, deviceKeyId: registered.id };
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'DEVICE_KEY_REVOKED')) throw err;
    }
  }

  const pair = await generateKeyPair();
  const registered = await register(pair);
  const identity: StoredIdentity = { ...pair, userId, deviceKeyId: registered.id, createdAt: Date.now() };
  await db.put(STORE, identity);
  return { publicKey: pair.publicKey, privateKey: pair.privateKey, deviceKeyId: registered.id };
}
