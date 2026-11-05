// KV store with write notifications.
//
// Wraps the backend chosen in kv-backend.ts and reports which keys each write touched, so the
// static-file publisher can rebuild exactly the public files those keys feed, without every write
// site having to remember to call it.
//
// While the store is frozen for maintenance, writes are logged and skipped. Middleware in app.ts
// already rejects non-GET requests, so the writes that reach here are GET routes refreshing caches
// and rate limits, which browsing must survive without.
import { isFrozen, rawKv } from "./kv-backend.ts";

export type KvWriteKind = "set" | "del";
type Listener = (keys: string[], kind: KvWriteKind) => void;

let listener: Listener | null = null;

/** Register the single write listener (index.ts wires this to the publisher). */
export function onKvWrite(fn: Listener): void {
  listener = fn;
}

function notify(keys: string[], kind: KvWriteKind): void {
  if (!listener || !keys.length) return;
  try {
    listener(keys, kind);
  } catch (e) {
    console.warn("kv write listener failed:", e);
  }
}

function skippedWhileFrozen(keys: string[]): boolean {
  if (!isFrozen()) return false;
  console.warn(`kv: frozen, skipped write to ${keys.length} key(s), first ${keys[0]}`);
  return true;
}

export const get = (key: string): Promise<any> => rawKv().get(key);
export const mget = (keys: string[]): Promise<any[]> => rawKv().mget(keys);
export const getByPrefix = (prefix: string): Promise<any[]> => rawKv().getByPrefix(prefix);

export async function set(key: string, value: any): Promise<void> {
  if (skippedWhileFrozen([key])) return;
  await rawKv().set(key, value);
  notify([key], "set");
}

export async function mset(keys: string[], values: any[]): Promise<void> {
  if (skippedWhileFrozen(keys)) return;
  await rawKv().mset(keys, values);
  notify(keys, "set");
}

export async function del(key: string): Promise<void> {
  if (skippedWhileFrozen([key])) return;
  await rawKv().del(key);
  notify([key], "del");
}

export async function mdel(keys: string[]): Promise<void> {
  if (skippedWhileFrozen(keys)) return;
  await rawKv().mdel(keys);
  notify(keys, "del");
}
