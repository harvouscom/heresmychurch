/**
 * On-device copy of each region's church list (IndexedDB), so returning to a state shows
 * its churches straight away instead of waiting on a multi-megabyte download. The caller
 * still refreshes from the network in the background; this is only ever a head start.
 *
 * Every operation fails soft: no IndexedDB (private browsing, some embedded browsers,
 * storage full or cleared) simply means no head start.
 */

const DB_NAME = "hmc-cache";
const STORE = "churches";
/** Bump when the stored shape changes; old databases are discarded. */
const DB_VERSION = 2;
/** Regions kept on the device; the least recently used are dropped beyond this. */
const MAX_REGIONS = 10;
/** Older copies aren't worth showing first: too likely to have moved on. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Stored as the response text rather than objects: saving a string is a cheap copy, where
 * saving thousands of church objects is a long structured clone on the main thread.
 */
interface StoredRecord {
  region: string;
  savedAt: number;
  /** Identifies the content (an ETag, or count + size); unchanged means no re-render. */
  signature: string;
  text: string;
}

export interface StoredChurches {
  signature: string;
  text: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === "undefined") return resolve(null);
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
          db.createObjectStore(STORE, { keyPath: "region" }).createIndex("savedAt", "savedAt");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function request<R>(req: IDBRequest<R>): Promise<R | null> {
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function readStoredChurches(region: string): Promise<StoredChurches | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    const rec = await request<StoredRecord | undefined>(
      db.transaction(STORE, "readonly").objectStore(STORE).get(region),
    );
    if (!rec || typeof rec.text !== "string" || Date.now() - rec.savedAt > MAX_AGE_MS) return null;
    return { signature: rec.signature, text: rec.text };
  } catch {
    return null;
  }
}

export async function writeStoredChurches(region: string, signature: string, text: string): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put({ region, savedAt: Date.now(), signature, text } satisfies StoredRecord);
    // Keep the store bounded by dropping the least recently saved regions. Walks keys
    // only, so it never reads the (large) stored lists back. Plain callbacks: awaiting
    // here could let the transaction commit before the deletes are queued.
    const countReq = store.count();
    countReq.onsuccess = () => {
      let excess = countReq.result - MAX_REGIONS;
      if (excess <= 0) return;
      const cursorReq = store.index("savedAt").openKeyCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || excess <= 0) return;
        store.delete(cursor.primaryKey);
        excess -= 1;
        cursor.continue();
      };
    };
  } catch {
    /* storage unavailable or full */
  }
}
