// Chooses where KV data lives. STORE_BACKEND is read per call: on Workers the env only exists
// once a request arrives, and cutover and rollback are a config change.
import * as d1 from "./kv-d1.ts";
import * as supabase from "./kv_store.tsx";
import { env } from "./runtime.ts";

export function usesD1(): boolean {
  return (env("STORE_BACKEND") ?? (env("HMC_RUNTIME") === "worker" ? "d1" : "supabase")) === "d1";
}

/** The store itself, with no freeze check or write notifications. kv.ts is what app code should use. */
export function rawKv(): typeof d1 {
  return usesD1() ? d1 : (supabase as unknown as typeof d1);
}

/** True while MAINTENANCE_READONLY is set: reads work, and app writes are refused or skipped. */
export function isFrozen(): boolean {
  return !!env("MAINTENANCE_READONLY");
}
