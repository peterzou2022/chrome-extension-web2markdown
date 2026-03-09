import { createStorage, StorageEnum } from '../base/index.js';

const SESSION_KEYS_KEY = 'session-api-keys';

const defaultSessionKeys: Record<string, string> = {};

const storage = createStorage<Record<string, string>>(SESSION_KEYS_KEY, defaultSessionKeys, {
  storageEnum: StorageEnum.Session,
  serialization: {
    serialize: v => JSON.stringify(v),
    deserialize: (s: string | undefined | null) =>
      s == null || s === undefined ? defaultSessionKeys : (JSON.parse(s) as Record<string, string>),
  },
});

export const sessionApiKeysStorage = storage;
