import {afterAll,beforeAll,beforeEach,describe,expect,it} from "vitest";
import * as kv from "../../supabase/functions/make-server-283d8046/kv.ts";
import {EditConflictError,inheritSnapshot,mergeEdits} from "../../supabase/functions/make-server-283d8046/edit-versions.ts";
import {getChurches,setChurches} from "../../supabase/functions/make-server-283d8046/church-keys.ts";
import {type Harness,startHarness} from "./harness.ts";
let h:Harness;beforeAll(async()=>{h=await startHarness();});afterAll(async()=>{await h.mf.dispose();});
beforeEach(async()=>{await h.db.prepare("DELETE FROM kv").run();await h.db.prepare("DELETE FROM publish_outbox").run();await h.db.prepare("DELETE FROM review_index_regions").run();});
const initial=[{id:"TX-1",name:"First",website:"https://first.example"},{id:"TX-2",name:"Second",website:"https://second.example"}];
describe("guarded community writes",()=>{
 it("preserves simultaneous changes to different churches in one region",async()=>{
  await kv.set("churches:US:TX",initial);const a=await getChurches("TX"),b=await getChurches("TX");a[0].name="First updated";b[1].website="https://second-new.example";
  await Promise.all([setChurches("TX",a),setChurches("TX",b)]);
  expect(await getChurches("TX")).toEqual([{...initial[0],name:"First updated"},{...initial[1],website:"https://second-new.example"}]);
  expect(await h.db.prepare("SELECT count(*) AS n FROM kv_write_guards").first()).toEqual({n:0});
 });
 it("merges disjoint fields of the same church and retains the latest verification time",async()=>{
  await kv.set("churches:US:TX",initial);const a=await getChurches("TX"),b=await getChurches("TX");a[0].name="Updated";a[0].lastVerified=1000;b[0].phone="5125550199";b[0].lastVerified=2000;
  await Promise.all([setChurches("TX",a),setChurches("TX",b)]);
  expect((await getChurches("TX"))[0]).toMatchObject({name:"Updated",phone:"5125550199",lastVerified:2000});
 });
 it("rejects a conflicting field without silently replacing the accepted value",async()=>{
  await kv.set("churches:US:TX",initial);const a=await getChurches("TX"),b=await getChurches("TX");a[0].name="Alpha";b[0].name="Beta";
  const result=await Promise.allSettled([setChurches("TX",a),setChurches("TX",b)]);
  expect(result.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  const rejected=result.find(x=>x.status==="rejected") as PromiseRejectedResult;expect(rejected.reason).toBeInstanceOf(EditConflictError);
  expect(["Alpha","Beta"]).toContain((await getChurches("TX"))[0].name);
 });
 it("preserves a concurrent addition when another church is removed",async()=>{
  await kv.set("churches:US:TX",initial);const a=await getChurches("TX"),b=await getChurches("TX");const filtered=a.filter((ch:any)=>ch.id!=="TX-1");inheritSnapshot(a,filtered);b.push({id:"TX-3",name:"Third"});
  await Promise.all([setChurches("TX",filtered),setChurches("TX",b)]);
  expect((await getChurches("TX")).map((ch:any)=>ch.id).sort()).toEqual(["TX-2","TX-3"]);
 });
 it("does not delete a church that changed since the removal was prepared",async()=>{
  await kv.set("churches:US:TX",initial);const a=await getChurches("TX"),b=await getChurches("TX");const filtered=a.filter((ch:any)=>ch.id!=="TX-1");b[0].name="Changed";await setChurches("TX",b);
  await expect(setChurches("TX",filtered,undefined,a)).rejects.toBeInstanceOf(EditConflictError);
  expect((await getChurches("TX"))[0].name).toBe("Changed");
 });
 it("keeps two simultaneous first suggestions for a previously missing record",async()=>{
  const a={churchId:"TX-1",submissions:[{ip:"actor-a",field:"name",value:"Alpha",timestamp:1}]};
  const b={churchId:"TX-1",submissions:[{ip:"actor-b",field:"website",value:"https://new.example",timestamp:2}]};
  await Promise.all([kv.set("suggestions:TX-1",a),kv.set("suggestions:TX-1",b)]);
  expect((await kv.get("suggestions:TX-1")).submissions).toHaveLength(2);
 });
 it("treats unordered object properties as the same value and leaves list fields atomic",()=>{
  expect(mergeEdits({}, {previousValues:{name:"Before"}}, {previousValues:{website:"old.example"}})).toEqual({previousValues:{name:"Before",website:"old.example"}});
  expect(mergeEdits({x:{a:1,b:2}},{x:{b:2,a:1}},{x:{a:1,b:3}})).toEqual({x:{a:1,b:3}});
  expect(()=>mergeEdits({languages:["English"]},{languages:["French"]},{languages:["Spanish"]})).toThrow(EditConflictError);
 });
});
