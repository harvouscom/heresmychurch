import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import * as kv from "../../supabase/functions/make-server-283d8046/kv.ts";
import {dispatchPublications,publishQueuedTarget,requestPublications,setPublicationQueue,targetsForWrite} from "../../supabase/functions/make-server-283d8046/publication.ts";
import {type Harness,startHarness} from "./harness.ts";
let h:Harness;
beforeAll(async()=>{h=await startHarness();});
afterAll(async()=>{setPublicationQueue(null);await h.mf.dispose();});
beforeEach(async()=>{setPublicationQueue(null);await h.db.prepare("DELETE FROM publish_outbox").run();await h.db.prepare("DELETE FROM publish_health").run();await h.db.prepare("DELETE FROM kv").run();});
const job=(target="region:TX")=>h.db.prepare("SELECT * FROM publish_outbox WHERE target=?1").bind(target).first();
describe("durable publication outbox",()=>{
 it("maps region and church changes without turning operational writes into jobs",()=>{
  expect(targetsForWrite("churches:US:TX","set")).toEqual(["region:TX"]);
  expect(targetsForWrite("churches:US:DC","set")).toEqual(["region:MD"]);
  expect(targetsForWrite("suggestions:CA-ON-123","set")).toEqual(["region:ON"]);
  expect(targetsForWrite("enrichment:google:TX-123","set")).toEqual(["region:TX"]);
  expect(targetsForWrite("calibration:TX","set")).toEqual([]);
  expect(targetsForWrite("calibration:TX","del")).toEqual(["region:TX"]);
  expect(targetsForWrite("churches:meta","set")).toEqual(["states"]);
  expect(targetsForWrite("ratelimit:test","set")).toEqual([]);
 });
 it("commits a change and its publishing job together, and rolls both back on failure",async()=>{
  await kv.set("churches:US:TX",["before"]);
  expect((await job()).generation).toBe(1);
  await h.db.prepare("CREATE TRIGGER fail_publication BEFORE INSERT ON publish_outbox BEGIN SELECT RAISE(ABORT, 'test outbox failure'); END").run();
  try{await expect(kv.set("churches:US:TX",["after"])).rejects.toThrow();}
  finally{await h.db.prepare("DROP TRIGGER fail_publication").run();}
  expect(await kv.get("churches:US:TX")).toEqual(["before"]);
  expect((await job()).generation).toBe(1);
 });
 it("retains work when queue submission fails, then dispatches it once",async()=>{
  await kv.set("churches:US:TX",["value"]);
  const failed=vi.fn(async()=>{throw Error("queue unavailable");});setPublicationQueue({sendBatch:failed});
  await expect(dispatchPublications()).rejects.toThrow("queue unavailable");
  expect((await job()).next_dispatch_at).toBe(0);
  const sent=vi.fn(async()=>{});setPublicationQueue({sendBatch:sent});
  const now=Date.now();expect(await dispatchPublications(now)).toBe(1);
  expect(await dispatchPublications(now+100)).toBe(0);
  expect(sent).toHaveBeenCalledTimes(1);
 });
 it("does not double-claim jobs across concurrent dispatches",async()=>{
  await requestPublications(["region:TX"]);const sent=vi.fn(async()=>{});setPublicationQueue({sendBatch:sent});
  const now=Date.now();const results=await Promise.all([dispatchPublications(now),dispatchPublications(now)]);
  expect(results.reduce((a,b)=>a+b,0)).toBe(1);expect(sent).toHaveBeenCalledTimes(1);
 });
 it("recovers a dispatch that died after claiming but before sending",async()=>{
  const now=Date.now();await requestPublications(["region:TX"]);
  await h.db.prepare("UPDATE publish_outbox SET next_dispatch_at=?1").bind(now+60000).run();
  setPublicationQueue({sendBatch:async()=>{}});
  expect(await dispatchPublications(now)).toBe(0);
  expect(await dispatchPublications(now+60001)).toBe(1);
 });
 it("keeps an edit that arrives during publication and ignores obsolete deliveries",async()=>{
  await kv.set("churches:US:TX",["before"]);
  expect(await publishQueuedTarget("region:TX",async()=>{await kv.set("churches:US:TX",["during"]);})).toBe("published");
  expect((await job()).generation).toBe(2);expect((await job()).next_dispatch_at).toBe(0);
  const publish=vi.fn(async()=>{});
  expect(await publishQueuedTarget("region:TX",publish)).toBe("published");
  expect(await job()).toBeNull();
  expect(await publishQueuedTarget("region:TX",publish)).toBe("obsolete");expect(publish).toHaveBeenCalledTimes(1);
 });
 it("preserves repeatedly failing jobs for operators and allows a fresh retry",async()=>{
  await requestPublications(["region:TX"]);const fail=async()=>{throw Error("database overloaded");};
  for(let i=0;i<7;i++)await expect(publishQueuedTarget("region:TX",fail)).rejects.toThrow("overloaded");
  expect(await job()).toMatchObject({blocked:1,failures:7,last_error:"database overloaded"});
  setPublicationQueue({sendBatch:async()=>{}});expect(await dispatchPublications(Date.now()+86400000)).toBe(0);
  await requestPublications(["region:TX"]);expect(await job()).toMatchObject({blocked:0,failures:0});
  expect(await dispatchPublications()).toBe(1);
 });
});
