// IndexedDB persistence. Everything stays on the user's device: there is no
// server. Data is namespaced per anonymous local client id (like the old
// backend's X-Client-Id) so multiple profiles can coexist in one browser.

const DB_NAME = "aligncv";
const DB_VERSION = 1;
const STORES = ["resumes", "versions", "jobs", "analyses"];
const CLIENT_ID_KEY = "aligncv.clientId";

export function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        for (const store of STORES) {
          if (!request.result.objectStoreNames.contains(store)) {
            request.result.createObjectStore(store, { keyPath: "id" }).createIndex("owner_id", "owner_id");
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

// Single IndexedDB helper: run one request inside a transaction and resolve on commit.
function run(store, mode, fn) {
  return db().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(store, mode);
        const request = fn(transaction.objectStore(store));
        transaction.oncomplete = () => resolve(request ? request.result : undefined);
        transaction.onerror = () => reject(transaction.error);
      })
  );
}

export const put = (store, record) => run(store, "readwrite", (s) => s.put(record)).then(() => record);
export const get = (store, id) => run(store, "readonly", (s) => s.get(id)).then((r) => r || null);
export const getAllByOwner = (store, ownerId) =>
  run(store, "readonly", (s) => s.index("owner_id").getAll(ownerId)).then((r) => r || []);
export const clearStore = (store) => run(store, "readwrite", (s) => s.clear());

export async function clearAll() {
  for (const store of STORES) await clearStore(store);
}

// ------------------------------------------------------------------ Projects
// A "project" is a portable snapshot of the user's saved work, used for
// explicit export/import (JSON download/upload), independent of live storage.

export async function exportProject() {
  const data = {};
  for (const store of STORES) data[store] = await getAllByOwner(store, getClientId());
  return {
    format: "aligncv-project",
    version: 1,
    exported_at: new Date().toISOString(),
    client_id: getClientId(),
    data,
  };
}

export async function importProject(payload) {
  if (!payload || payload.format !== "aligncv-project" || !payload.data) {
    throw new Error("This file is not a valid AlignCV project export.");
  }
  const ownerId = getClientId();
  let count = 0;
  for (const store of STORES) {
    for (const record of payload.data[store] || []) {
      await put(store, { ...record, owner_id: ownerId });
      count += 1;
    }
  }
  return count;
}
