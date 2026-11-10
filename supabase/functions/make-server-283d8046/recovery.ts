import { getD1, getKvBucket, type D1Statement } from "./bindings.ts";

/** D1 Paid recovery is 30 days; retain retired files for 35 days after their last reference. */
export const RECOVERY_RETENTION_MS = 35*86400000;
export function retireObjectStatement(keysJson:string,now:number):D1Statement {
  return getD1().prepare(`INSERT INTO r2_retired_objects(r2_key,retired_at,delete_after)
    SELECT r2_key,?2,?3 FROM kv WHERE key IN(SELECT value FROM json_each(?1)) AND r2_key IS NOT NULL
    ON CONFLICT(r2_key) DO UPDATE SET retired_at=excluded.retired_at,delete_after=max(r2_retired_objects.delete_after,excluded.delete_after)`).bind(keysJson,now,now+RECOVERY_RETENTION_MS);
}
/** Must not run during a restore; the scheduled entry checks the maintenance flag. */
export async function collectRetiredObjects(now=Date.now(),limit=100):Promise<number> {
  const db=getD1();
  const {results}=await db.prepare(`SELECT r.r2_key FROM r2_retired_objects r WHERE r.delete_after<=?1
    AND NOT EXISTS(SELECT 1 FROM kv WHERE kv.r2_key=r.r2_key) ORDER BY r.delete_after LIMIT ?2`).bind(now,limit).all<{r2_key:string}>();
  const keys=(results??[]).map(r=>r.r2_key);if(!keys.length)return 0;
  await getKvBucket().delete(keys);
  await db.prepare("DELETE FROM r2_retired_objects WHERE r2_key IN(SELECT value FROM json_each(?1))").bind(JSON.stringify(keys)).run();
  return keys.length;
}
