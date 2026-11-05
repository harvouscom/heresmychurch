// D1 + R2 backend for the KV store, with the same exports and behaviour as kv_store.tsx:
// get returns undefined on a miss, mget returns null for a miss, and order is preserved.
//
// D1 caps a value at 2 MB and the largest church lists are over 4 MB, so big values spill to the
// private HMC_KV bucket. Values are JSON text, measured in UTF-8 bytes.
import { type D1Statement, getD1, getKvBucket } from "./bindings.ts";
import { waitUntil } from "./runtime.ts";

export const SPILL_BYTES = 900 * 1024;
const KEY_CHUNK = 1000;
const PREFIX_PAGE = 500;
/** Rows per query are limited by size too, so a page of big values can't blow a response. */
const FETCH_BYTES = 8 * 1024 * 1024;
const BATCH_BYTES = 8 * 1024 * 1024;
const R2_CONCURRENCY = 6;
const TRANSIENT_RE = /network connection lost|internal error|overloaded|reset because|exceeded timeout|timed out|too many requests|try again/i;

const encoder = new TextEncoder();
const byteLength = (s: string) => encoder.encode(s).length;

/** Retries D1's transient failures. Only wrap reads and writes that are safe to repeat. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= attempts || !TRANSIENT_RE.test(String((e as Error)?.message ?? e))) throw e;
      await new Promise((r) => setTimeout(r, 50 * attempt + Math.random() * 100));
    }
  }
}

async function pool<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(R2_CONCURRENCY, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    }),
  );
}

function serialize(value: unknown): string {
  const json = JSON.stringify(value);
  // Postgres rejects these too (value is NOT NULL), so a caller's bug fails the same way.
  if (json === undefined) throw new Error("kv: value is not JSON-serializable");
  return json;
}

async function sha1Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", encoder.encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

type Row = { key: string; value: string | null; r2_key: string | null };

/**
 * Loads a spilled value. A concurrent write may have replaced and deleted the object after we
 * read the row, so a miss re-reads the row once. A value that's still missing throws: returning
 * nothing here could look like an empty church list and blank a state.
 */
async function resolveSpilled(key: string, r2Key: string): Promise<string> {
  const obj = await getKvBucket().get(r2Key);
  if (obj) return await obj.text();
  const row = await withRetry(() =>
    getD1().prepare("SELECT value, r2_key FROM kv WHERE key = ?1").bind(key).first<Row>(),
  );
  if (row?.value != null) return row.value;
  if (row?.r2_key) {
    const again = await getKvBucket().get(row.r2_key);
    if (again) return await again.text();
  }
  throw new Error(`kv: spilled value missing for ${key}`);
}

const UPSERT_SQL = `INSERT INTO kv (key, value, r2_key, size, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, r2_key = excluded.r2_key, size = excluded.size, updated_at = excluded.updated_at`;

function deleteObjectsLater(r2Keys: Array<string | null | undefined>): void {
  const keys = r2Keys.filter((k): k is string => !!k);
  if (!keys.length) return;
  waitUntil(getKvBucket().delete(keys).catch((e) => console.warn("kv: couldn't delete old R2 objects:", e)));
}

type Prepared = { key: string; json: string; size: number; r2Key: string | null };

/** Writes any spilled value to R2 first, so a row never points at an object that doesn't exist. */
async function prepare(key: string, value: unknown): Promise<Prepared> {
  const json = serialize(value);
  const size = byteLength(json);
  if (size <= SPILL_BYTES) return { key, json, size, r2Key: null };
  const r2Key = `kv/${await sha1Hex(key)}/${crypto.randomUUID()}`;
  await getKvBucket().put(r2Key, json, { httpMetadata: { contentType: "application/json" } });
  return { key, json, size, r2Key };
}

function upsertStatements(p: Prepared, now: number): D1Statement[] {
  const db = getD1();
  return [
    db.prepare(UPSERT_SQL).bind(p.key, p.r2Key ? null : p.json, p.r2Key, p.size, now),
    db.prepare("DELETE FROM kv_tombstones WHERE key = ?1").bind(p.key),
  ];
}

/** Upserts, then removes the R2 objects the rows used to point at. */
async function writeAll(prepared: Prepared[]): Promise<void> {
  const db = getD1();
  const now = Date.now();
  const groups: Prepared[][] = [];
  let group: Prepared[] = [];
  let bytes = 0;
  for (const p of prepared) {
    const cost = p.r2Key ? 0 : p.size;
    if (group.length && (bytes + cost > BATCH_BYTES || group.length >= KEY_CHUNK)) {
      groups.push(group);
      group = [];
      bytes = 0;
    }
    group.push(p);
    bytes += cost;
  }
  if (group.length) groups.push(group);

  for (const g of groups) {
    const keys = JSON.stringify(g.map((p) => p.key));
    const results = await withRetry(() =>
      db.batch([
        db.prepare("SELECT r2_key FROM kv WHERE key IN (SELECT value FROM json_each(?1)) AND r2_key IS NOT NULL").bind(keys),
        ...g.flatMap((p) => upsertStatements(p, now)),
      ]),
    );
    deleteObjectsLater(((results[0]?.results ?? []) as Array<{ r2_key: string }>).map((r) => r.r2_key));
  }
}

export const set = async (key: string, value: any): Promise<void> => {
  await writeAll([await prepare(key, value)]);
};

export const get = async (key: string): Promise<any> => {
  const row = await withRetry(() =>
    getD1().prepare("SELECT value, r2_key FROM kv WHERE key = ?1").bind(key).first<Row>(),
  );
  if (!row) return undefined;
  const json = row.r2_key ? await resolveSpilled(key, row.r2_key) : row.value;
  return JSON.parse(json as string);
};

/** The stored JSON text exactly, or null when the key doesn't exist. */
export const getRawJson = async (key: string): Promise<string | null> => {
  const row = await withRetry(() =>
    getD1().prepare("SELECT value, r2_key FROM kv WHERE key = ?1").bind(key).first<Row>(),
  );
  if (!row) return null;
  return row.r2_key ? await resolveSpilled(key, row.r2_key) : row.value;
};

export const del = async (key: string): Promise<void> => {
  await mdel([key]);
};

export const mset = async (keys: string[], values: any[]): Promise<void> => {
  if (!keys.length) return;
  const prepared: Prepared[] = new Array(keys.length);
  await pool(keys.map((key, i) => ({ key, i })), async ({ key, i }) => {
    prepared[i] = await prepare(key, values[i]);
  });
  await writeAll(prepared);
};

async function loadValues(keys: string[], out: Map<string, any>): Promise<void> {
  const db = getD1();
  const spilled: Array<{ key: string; r2Key: string }> = [];
  for (let i = 0; i < keys.length; i += KEY_CHUNK) {
    const chunk = JSON.stringify(keys.slice(i, i + KEY_CHUNK));
    const { results } = await withRetry(() =>
      db.prepare("SELECT key, value, r2_key FROM kv WHERE key IN (SELECT value FROM json_each(?1))").bind(chunk).all<Row>(),
    );
    for (const r of results ?? []) {
      if (r.r2_key) spilled.push({ key: r.key, r2Key: r.r2_key });
      else out.set(r.key, JSON.parse(r.value as string));
    }
  }
  await pool(spilled, async ({ key, r2Key }) => {
    out.set(key, JSON.parse(await resolveSpilled(key, r2Key)));
  });
}

export const mget = async (keys: string[]): Promise<any[]> => {
  if (!keys.length) return [];
  const map = new Map<string, any>();
  await loadValues(keys, map);
  return keys.map((k) => map.get(k) ?? null);
};

export const mdel = async (keys: string[]): Promise<void> => {
  if (!keys.length) return;
  const db = getD1();
  const now = Date.now();
  for (let i = 0; i < keys.length; i += KEY_CHUNK) {
    const chunk = JSON.stringify(keys.slice(i, i + KEY_CHUNK));
    const results = await withRetry(() =>
      db.batch([
        db.prepare("DELETE FROM kv WHERE key IN (SELECT value FROM json_each(?1)) RETURNING r2_key").bind(chunk),
        db
          .prepare(
            `INSERT INTO kv_tombstones (key, deleted_at) SELECT value, ?2 FROM json_each(?1) WHERE true
             ON CONFLICT(key) DO UPDATE SET deleted_at = excluded.deleted_at`,
          )
          .bind(chunk, now),
      ]),
    );
    deleteObjectsLater(((results[0]?.results ?? []) as Array<{ r2_key: string | null }>).map((r) => r.r2_key));
  }
};

/** The smallest string greater than everything starting with `prefix`. Null when there's no prefix. */
export function prefixUpperBound(prefix: string): string | null {
  if (!prefix) return null;
  return prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);
}

/** Pages by key range rather than LIKE, which ignores case and treats `_` as a wildcard. */
export const getByPrefix = async (prefix: string): Promise<any[]> => {
  const db = getD1();
  const upper = prefixUpperBound(prefix);
  const out: any[] = [];
  let after: string | null = null;
  for (;;) {
    const lower: string = after ?? prefix;
    const op = after === null ? ">=" : ">";
    const stmt: D1Statement = upper === null
      ? db.prepare(`SELECT key, size FROM kv WHERE key ${op} ?1 ORDER BY key LIMIT ${PREFIX_PAGE}`).bind(lower)
      : db.prepare(`SELECT key, size FROM kv WHERE key ${op} ?1 AND key < ?2 ORDER BY key LIMIT ${PREFIX_PAGE}`).bind(lower, upper);
    const { results } = await withRetry(() => stmt.all<{ key: string; size: number }>());
    const page = results ?? [];
    if (!page.length) break;

    // Sizes first, so values load in groups that fit in one response.
    const values = new Map<string, any>();
    let group: string[] = [];
    let bytes = 0;
    for (const { key, size } of page) {
      const cost = size > SPILL_BYTES ? 0 : size;
      if (group.length && bytes + cost > FETCH_BYTES) {
        await loadValues(group, values);
        group = [];
        bytes = 0;
      }
      group.push(key);
      bytes += cost;
    }
    if (group.length) await loadValues(group, values);
    for (const { key } of page) if (values.has(key)) out.push(values.get(key));

    if (page.length < PREFIX_PAGE) break;
    after = page[page.length - 1].key;
  }
  return out;
};
