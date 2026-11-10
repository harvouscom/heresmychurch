import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { setD1, setKvBucket, setSearchD1 } from "../../supabase/functions/make-server-283d8046/bindings.ts";
import { setEnv, setWaitUntil } from "../../supabase/functions/make-server-283d8046/runtime.ts";

/** Splits a migration into statements, keeping trigger bodies whole. */
function statements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let inTrigger = false;
  for (const line of sql.split("\n")) {
    if (line.trim().startsWith("--")) continue;
    current += `${line}\n`;
    if (/CREATE TRIGGER/i.test(line)) inTrigger = true;
    if (inTrigger ? /^END;\s*$/.test(line.trim()) : /;\s*$/.test(line)) {
      out.push(current.trim());
      current = "";
      inTrigger = false;
    }
  }
  return out;
}

export type Harness = {
  mf: Miniflare;
  db: any;
  searchDb: any;
  bucket: any;
  vars: Record<string, string>;
  /** Waits for background work, such as old R2 object deletes. */
  flush(): Promise<void>;
};

export async function startHarness(vars: Record<string, string> = {}): Promise<Harness> {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["HMC_DB", "HMC_SEARCH_DB"],
    r2Buckets: ["HMC_KV"],
  });
  const db = await mf.getD1Database("HMC_DB");
  const searchDb = await mf.getD1Database("HMC_SEARCH_DB");
  const bucket = await mf.getR2Bucket("HMC_KV");
  for (const s of statements(readFileSync("api/migrations/0001_init.sql", "utf8"))) await db.prepare(s).run();
  for (const s of statements(readFileSync("api/migrations/0002_publication_recovery.sql", "utf8"))) await db.prepare(s).run();
  for (const s of statements(readFileSync("api/migrations/0003_edit_versions_review_index.sql", "utf8"))) await db.prepare(s).run();
  for (const s of statements(readFileSync("api/search-migrations/0001_search.sql", "utf8"))) await searchDb.prepare(s).run();

  const env = { STORE_BACKEND: "d1", MAINTENANCE_READONLY: "", ...vars };
  setEnv((name) => (env as Record<string, string>)[name]);
  const background: Promise<unknown>[] = [];
  setWaitUntil((p) => background.push(p));
  setD1(db as never);
  setSearchD1(searchDb as never);
  setKvBucket(bucket as never);

  return {
    mf, db, searchDb, bucket, vars: env,
    async flush() {
      while (background.length) await background.shift();
    },
  };
}
