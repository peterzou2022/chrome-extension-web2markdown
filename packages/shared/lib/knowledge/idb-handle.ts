const DB_NAME = 'knowledge-extension-db';
const STORE_NAME = 'knowledge-dir';
const HANDLE_KEY = 'directory-handle';

/**
 * Persist a directory handle to IndexedDB (for use after restart).
 * Call from options page after user selects directory.
 */
const setKnowledgeDirectoryHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(handle, HANDLE_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

/**
 * Retrieve the persisted directory handle from IndexedDB.
 * Call from background when saving a file.
 */
const getKnowledgeDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(HANDLE_KEY);
    req.onsuccess = () => {
      db.close();
      resolve(req.result ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
};

/**
 * Remove the persisted handle (e.g. when user revokes).
 */
const removeKnowledgeDirectoryHandle = async (): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(HANDLE_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });

export { setKnowledgeDirectoryHandle, getKnowledgeDirectoryHandle, removeKnowledgeDirectoryHandle };
