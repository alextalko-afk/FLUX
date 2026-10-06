import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'flux-db';
const DB_VERSION = 2;

interface FluxDB {
  drafts: {
    key: string;
    value: { chatId: string; content: string; updatedAt: number };
    indexes: { chatId: string };
  };
  pendingMessages: {
    key: string;
    value: {
      clientTempId: string;
      chatId: string;
      payload: any;
      createdAt: number;
    };
    indexes: { chatId: string };
  };
  cache: {
    key: string;
    value: { data: any; expiresAt: number };
  };
}

let dbPromise: Promise<IDBPDatabase<FluxDB>> | null = null;

function getDb(): Promise<IDBPDatabase<FluxDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FluxDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('drafts')) {
          const drafts = db.createObjectStore('drafts', { keyPath: 'chatId' });
          drafts.createIndex('chatId', 'chatId');
        }
        if (!db.objectStoreNames.contains('pendingMessages')) {
          const pending = db.createObjectStore('pendingMessages', {
            keyPath: 'clientTempId',
          });
          pending.createIndex('chatId', 'chatId');
        }
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

export const storage = {
  async saveDraft(chatId: string, content: string): Promise<void> {
    const db = await getDb();
    if (!content.trim()) {
      await db.delete('drafts', chatId);
    } else {
      await db.put('drafts', {
        chatId,
        content,
        updatedAt: Date.now(),
      });
    }
  },

  async getDraft(chatId: string): Promise<string> {
    const db = await getDb();
    const draft = await db.get('drafts', chatId);
    return draft?.content ?? '';
  },

  async addPendingMessage(clientTempId: string, chatId: string, payload: any): Promise<void> {
    const db = await getDb();
    await db.put('pendingMessages', {
      clientTempId,
      chatId,
      payload,
      createdAt: Date.now(),
    });
  },

  async getPendingMessages(chatId?: string): Promise<any[]> {
    const db = await getDb();
    if (chatId) {
      return db.getAllFromIndex('pendingMessages', 'chatId', chatId);
    }
    return db.getAll('pendingMessages');
  },

  async removePendingMessage(clientTempId: string): Promise<void> {
    const db = await getDb();
    await db.delete('pendingMessages', clientTempId);
  },

  async clearPendingMessages(): Promise<void> {
    const db = await getDb();
    await db.clear('pendingMessages');
  },

  async setCache(key: string, data: any, ttlMs = 5 * 60 * 1000): Promise<void> {
    const db = await getDb();
    await db.put('cache', {
      key,
      data,
      expiresAt: Date.now() + ttlMs,
    });
  },

  async getCache<T>(key: string): Promise<T | null> {
    const db = await getDb();
    const entry = await db.get('cache', key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      await db.delete('cache', key);
      return null;
    }
    return entry.data as T;
  },

  async clearAll(): Promise<void> {
    const db = await getDb();
    await db.clear('drafts');
    await db.clear('pendingMessages');
    await db.clear('cache');
  },
};
