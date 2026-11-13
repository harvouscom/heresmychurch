import { getD1, type D1Statement } from "./bindings.ts";
import { regionFromChurchId } from "./church-keys.ts";

export type PublicationMessage = { target: string };
export type PublicationQueue = { sendBatch(messages: Array<{body: PublicationMessage; delaySeconds?: number}>): Promise<unknown> };
let queue: PublicationQueue | null = null;
export function setPublicationQueue(value: PublicationQueue | null): void { queue = value; }
export function hasPublicationQueue(): boolean { return queue !== null; }
export function targetsForWrite(key: string, kind: "set" | "del"): string[] {
  const region=(r:string|null)=>r?[`region:${r.toUpperCase()==="DC"?"MD":r.toUpperCase()}`]:[];
  if(key==="churches:meta")return["states"];
  const m=key.match(/^churches:(?:[A-Z]{2}:)?([A-Z][A-Z0-9]+)$/);
  if(m)return region(m[1]);
  if(key.startsWith("suggestions:"))return region(regionFromChurchId(key.slice(12)));
  if(key.startsWith("enrichment:google:"))return region(regionFromChurchId(key.slice(18)));
  if(key.startsWith("church-claim:"))return region(regionFromChurchId(key.slice(13)));
  if(kind==="del"&&key.startsWith("calibration:"))return region(key.slice(12));
  return[];
}
export function validPublicationTarget(target: unknown): target is string {
  return typeof target==="string"&&(target==="states"||/^region:[A-Z][A-Z0-9]{1,31}$/.test(target));
}
export function publicationStatements(keys: string[], kind: "set"|"del", now=Date.now()): D1Statement[] {
  return [...new Set(keys.flatMap(key=>targetsForWrite(key,kind)))].map(target=>requestStatement(target,now));
}
function requestStatement(target:string,now:number):D1Statement {
  if(!validPublicationTarget(target))throw new Error("Invalid publication target");
  return getD1().prepare(`INSERT INTO publish_outbox(target,generation,requested_at) VALUES(?1,1,?2)
    ON CONFLICT(target) DO UPDATE SET generation=publish_outbox.generation+1,requested_at=min(publish_outbox.requested_at,excluded.requested_at),failures=0,next_dispatch_at=CASE WHEN publish_outbox.blocked=1 THEN 0 ELSE publish_outbox.next_dispatch_at END,blocked=0,last_error=NULL`).bind(target,now);
}
export async function requestPublications(targets:string[]):Promise<void> {
  const unique=[...new Set(targets)];
  for(let i=0;i<unique.length;i+=100)await getD1().batch(unique.slice(i,i+100).map(t=>requestStatement(t,Date.now())));
}

/** Claim before sending; a crash cannot lose work because a bounded lease expires. */
export async function dispatchPublications(now=Date.now()):Promise<number> {
  if(!queue)return 0;
  const db=getD1();
  const {results}=await db.prepare(`UPDATE publish_outbox SET next_dispatch_at=?1
    WHERE target IN (SELECT target FROM publish_outbox WHERE blocked=0 AND next_dispatch_at<=?2 ORDER BY requested_at LIMIT 100)
    RETURNING target,generation`).bind(now+60000,now).all<{target:string;generation:number}>();
  const rows=results??[];if(!rows.length)return 0;
  try {
    await queue.sendBatch(rows.map(r=>({body:{target:r.target},delaySeconds:2})));
    await db.batch(rows.map(r=>db.prepare("UPDATE publish_outbox SET next_dispatch_at=?1 WHERE target=?2 AND generation=?3").bind(now+6*3600000,r.target,r.generation)));
    return rows.length;
  }catch(e){
    await db.batch(rows.map(r=>db.prepare("UPDATE publish_outbox SET next_dispatch_at=0 WHERE target=?1 AND generation=?2").bind(r.target,r.generation)));
    throw e;
  }
}

export async function publishQueuedTarget(target:string,publish:(target:string)=>Promise<void>):Promise<"published"|"obsolete"> {
  if(!validPublicationTarget(target))throw new Error("Invalid publication target");
  const db=getD1();
  const row=await db.prepare("SELECT generation FROM publish_outbox WHERE target=?1").bind(target).first<{generation:number}>();
  if(!row)return "obsolete";
  try {
    await publish(target);
    await db.batch([
      db.prepare("DELETE FROM publish_outbox WHERE target=?1 AND generation=?2").bind(target,row.generation),
      db.prepare("UPDATE publish_outbox SET next_dispatch_at=0 WHERE target=?1 AND generation<>?2").bind(target,row.generation),
      db.prepare(`INSERT INTO publish_health(target,last_success_at) VALUES(?1,?2) ON CONFLICT(target) DO UPDATE SET last_success_at=excluded.last_success_at,last_error=NULL`).bind(target,Date.now()),
    ]);
    return "published";
  }catch(e){
    const error=(e instanceof Error?e.message:String(e)).slice(0,500);
    await db.batch([
      db.prepare("UPDATE publish_outbox SET failures=failures+1,blocked=CASE WHEN failures>=6 THEN 1 ELSE 0 END,last_error=?1 WHERE target=?2 AND generation=?3").bind(error,target,row.generation),
      db.prepare(`INSERT INTO publish_health(target,last_failure_at,last_error) VALUES(?1,?2,?3) ON CONFLICT(target) DO UPDATE SET last_failure_at=excluded.last_failure_at,last_error=excluded.last_error`).bind(target,Date.now(),error),
    ]);
    throw e;
  }
}
export async function publicationHealth():Promise<unknown> {
  const db=getD1();
  const summary=await db.prepare("SELECT count(*) AS pending,sum(blocked) AS blocked,min(requested_at) AS oldest_requested_at FROM publish_outbox").first();
  const failed=await db.prepare("SELECT target,failures,requested_at,last_error FROM publish_outbox WHERE blocked=1 ORDER BY requested_at LIMIT 20").all();
  return {summary,blockedTargets:failed.results??[]};
}

export async function releasePublication(target:string):Promise<void> {
  await getD1().prepare("UPDATE publish_outbox SET next_dispatch_at=0 WHERE target=?1").bind(target).run();
}

// A request can nudge accepted work while timer changes propagate or after a brief outage.
// This only dispatches existing outbox rows; it never creates work from request input.
let lastDispatchNudge=0;
export function nudgePublications(wait:(task:Promise<unknown>)=>void,now=Date.now()):void {
  if(!queue||now-lastDispatchNudge<5000)return;
  lastDispatchNudge=now;
  wait(dispatchPublications(now).catch(e=>console.error("publication_dispatch_failed",e instanceof Error?e.message:"unknown")));
}
