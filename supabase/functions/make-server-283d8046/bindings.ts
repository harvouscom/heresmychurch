// Cloudflare bindings for the D1/R2 store. The Worker entry (api/index.ts) registers them per
// request; the Supabase function never does, so they stay null there. Minimal shapes so this
// shared code needs no Workers types and still loads under Deno.

export type D1Result<T = any> = { results?: T[]; success?: boolean; meta?: Record<string, any> };
export type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = any>(column?: string): Promise<T | null>;
  all<T = any>(): Promise<D1Result<T>>;
  run<T = any>(): Promise<D1Result<T>>;
};
export type D1Binding = {
  prepare(sql: string): D1Statement;
  batch<T = any>(statements: D1Statement[]): Promise<D1Result<T>[]>;
};
export type R2Object = { text(): Promise<string> };
export type KvBucketBinding = {
  get(key: string): Promise<R2Object | null>;
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(keys: string | string[]): Promise<unknown>;
};

let d1: D1Binding | null = null;
let searchD1: D1Binding | null = null;
let kvBucket: KvBucketBinding | null = null;

export function setD1(binding: D1Binding | null): void {
  d1 = binding;
}
export function setSearchD1(binding: D1Binding | null): void {
  searchD1 = binding;
}
export function setKvBucket(binding: KvBucketBinding | null): void {
  kvBucket = binding;
}

export function getD1(): D1Binding {
  if (!d1) throw new Error("HMC_DB binding is not configured");
  return d1;
}
export function getSearchD1(): D1Binding {
  if (!searchD1) throw new Error("HMC_SEARCH_DB binding is not configured");
  return searchD1;
}
export function getKvBucket(): KvBucketBinding {
  if (!kvBucket) throw new Error("HMC_KV binding is not configured");
  return kvBucket;
}
