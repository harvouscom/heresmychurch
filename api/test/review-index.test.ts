import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import * as kv from "../../supabase/functions/make-server-283d8046/kv.ts";
import {getChurches,setChurches} from "../../supabase/functions/make-server-283d8046/church-keys.ts";
import {refreshReviewIndex,indexedReviewView} from "../../supabase/functions/make-server-283d8046/review-index.ts";
import {type Harness,startHarness} from "./harness.ts";
let h:Harness;beforeAll(async()=>{h=await startHarness();});afterAll(async()=>{await h.mf.dispose();});
beforeEach(async()=>{for(const table of ["kv","review_churches","review_index_regions"])await h.db.prepare(`DELETE FROM ${table}`).run();});
describe("indexed review reads",()=>{
 it("reads pending targets and reverify listings without loading regional blobs once ready",async()=>{
  await kv.set("churches:US:TX",[{id:"TX-1",name:"First",state:"TX",submittedByIp:"private"},{id:"TX-2",name:"Second",state:"TX",listingStatus:"pending_reverify"}]);
  expect(await refreshReviewIndex("TX",await getChurches("TX"))).toBe(true);
  const load=vi.fn();const view=await indexedReviewView(["TX"],new Set(["TX-1"]),load);
  expect(load).not.toHaveBeenCalled();expect(view.churches.get("TX-1")).toMatchObject({name:"First"});expect(view.churches.get("TX-1")).not.toHaveProperty("submittedByIp");expect(view.reverify.map(ch=>ch.id)).toEqual(["TX-2"]);
 });
 it("marks changed regions dirty in the same transaction and uses fresh source data until refreshed",async()=>{
  await kv.set("churches:US:TX",[{id:"TX-1",name:"Before"}]);await refreshReviewIndex("TX",await getChurches("TX"));
  const current=await getChurches("TX");current[0].name="After";await setChurches("TX",current);
  expect((await h.db.prepare("SELECT complete FROM review_index_regions WHERE region='TX'").first()).complete).toBe(0);
  const view=await indexedReviewView(["TX"],new Set(["TX-1"]),getChurches);expect(view.churches.get("TX-1").name).toBe("After");
  await refreshReviewIndex("TX",await getChurches("TX"));const load=vi.fn();expect((await indexedReviewView(["TX"],new Set(["TX-1"]),load)).churches.get("TX-1").name).toBe("After");expect(load).not.toHaveBeenCalled();
 });
 it("rejects rebuilding from a stale snapshot and removes old indexed churches on a fresh rebuild",async()=>{
  await kv.set("churches:US:TX",[{id:"TX-1",name:"First"},{id:"TX-2",name:"Second"}]);const old=await getChurches("TX");await refreshReviewIndex("TX",old);
  const current=await getChurches("TX");await setChurches("TX",current.filter((ch:any)=>ch.id!=="TX-1"),undefined,current);
  expect(await refreshReviewIndex("TX",old)).toBe(false);
  expect(await refreshReviewIndex("TX",await getChurches("TX"))).toBe(true);
  const view=await indexedReviewView(["TX"],new Set(["TX-1","TX-2"]),vi.fn());expect(view.churches.has("TX-1")).toBe(false);expect(view.churches.has("TX-2")).toBe(true);
 });
});
