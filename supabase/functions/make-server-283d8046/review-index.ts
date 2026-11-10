import {getD1} from "./bindings.ts";
import {guardStatement,isGuardConflict,snapshotOf,type ReadSnapshot} from "./edit-versions.ts";
import {churchesKey,regionCountry} from "./church-keys.ts";
const FIELDS=["id","shortId","name","city","state","address","postcode","lat","lng","website","phone","email","pastorName","denomination","serviceTimes","attendance","languages","ministries","homeCampusId","listingStatus","relocatedTo"];
export function reviewChurch(ch:any,region:string):any {
 const out:any={};for(const field of FIELDS)if(ch[field]!==undefined)Object.defineProperty(out,field,{value:ch[field],enumerable:true,writable:true,configurable:true});
 out.state=out.state||region;return out;
}
async function guardedBatch(snapshot:ReadSnapshot,statements:any[]):Promise<void>{
 const token=crypto.randomUUID();await getD1().batch([guardStatement(snapshot,token),...statements,getD1().prepare("DELETE FROM kv_write_guards WHERE token=?1").bind(token)]);
}
/** The source revision must stay unchanged throughout a rebuild; readers fall back while dirty. */
export async function refreshReviewIndex(region:string,churches:any[]):Promise<boolean>{
 const db=getD1(),snapshot=snapshotOf(churches)??{key:churchesKey(regionCountry(region),region),revision:null,value:churches};
 const revision=snapshot.revision??0;
 const ready=await db.prepare("SELECT source_revision,complete FROM review_index_regions WHERE region=?1").bind(region).first<any>();
 if(ready?.complete===1&&ready.source_revision===revision)return true;
 try{
  await guardedBatch(snapshot,[db.prepare("INSERT INTO review_index_regions(region,source_revision,complete) VALUES(?1,?2,0) ON CONFLICT(region) DO UPDATE SET source_revision=excluded.source_revision,complete=0").bind(region,revision)]);
  const desired=new Map<string,string>();for(const ch of churches)if(ch&&typeof ch.id==="string")desired.set(ch.id,JSON.stringify(reviewChurch(ch,region)));
  const existing=new Map<string,string>();let after="";
  for(;;){const {results}=await db.prepare("SELECT church_id,doc FROM review_churches WHERE region=?1 AND church_id>?2 ORDER BY church_id LIMIT 500").bind(region,after).all<{church_id:string;doc:string}>();const rows=results??[];for(const row of rows)existing.set(row.church_id,row.doc);if(rows.length<500)break;after=rows[rows.length-1].church_id;}
  // One JSON-table statement per batch keeps large-region rebuilds below D1 query limits.
  const changed=[...desired].filter(([id,doc])=>existing.get(id)!==doc).map(([,doc])=>JSON.parse(doc));
  for(let i=0;i<changed.length;i+=100){
   await guardedBatch(snapshot,[db.prepare(`INSERT INTO review_churches(church_id,region,listing_status,doc)
    SELECT json_extract(value,'$.id'),?2,json_extract(value,'$.listingStatus'),value FROM json_each(?1) WHERE true
    ON CONFLICT(church_id) DO UPDATE SET region=excluded.region,listing_status=excluded.listing_status,doc=excluded.doc`).bind(JSON.stringify(changed.slice(i,i+100)),region)]);
  }
  const removed=[...existing.keys()].filter(id=>!desired.has(id));
  for(let i=0;i<removed.length;i+=1000){await guardedBatch(snapshot,[db.prepare("DELETE FROM review_churches WHERE region=?1 AND church_id IN(SELECT value FROM json_each(?2))").bind(region,JSON.stringify(removed.slice(i,i+1000)))]);}
  await guardedBatch(snapshot,[db.prepare("UPDATE review_index_regions SET complete=1,indexed_at=?1 WHERE region=?2 AND source_revision=?3").bind(Date.now(),region,revision)]);
  return true;
 }catch(e){if(isGuardConflict(e))return false;throw e;}
}
export async function indexedReviewView(regions:string[],neededIds:Set<string>,getRegion:(region:string)=>Promise<any>):Promise<{churches:Map<string,any>;reverify:any[];fallbackRegions:number}>{
 const db=getD1();
 const {results:readyRows}=await db.prepare("SELECT region FROM review_index_regions WHERE complete=1").all<{region:string}>();
 const ready=new Set((readyRows??[]).map(r=>r.region));
 const churches=new Map<string,any>();const ids=[...neededIds];
 for(let i=0;i<ids.length;i+=100){const {results}=await db.prepare("SELECT c.doc FROM review_churches c JOIN review_index_regions r ON r.region=c.region WHERE r.complete=1 AND c.church_id IN(SELECT value FROM json_each(?1))").bind(JSON.stringify(ids.slice(i,i+100))).all<{doc:string}>();for(const row of results??[]){const ch=JSON.parse(row.doc);churches.set(ch.id,ch);}}
 const {results}=await db.prepare("SELECT c.doc FROM review_churches c JOIN review_index_regions r ON r.region=c.region WHERE r.complete=1 AND c.listing_status='pending_reverify'").all<{doc:string}>();
 const reverify=(results??[]).map(row=>JSON.parse(row.doc));
 const fallback=regions.filter(region=>!ready.has(region));
 for(let i=0;i<fallback.length;i+=3){await Promise.all(fallback.slice(i,i+3).map(async region=>{
  const list=await getRegion(region);if(!Array.isArray(list)||!list.length){await refreshReviewIndex(region,[]);return;}
  for(const ch of list){if(neededIds.has(ch.id))churches.set(ch.id,ch);if(ch.listingStatus==="pending_reverify")reverify.push(ch);}
 }));}
 return {churches,reverify,fallbackRegions:fallback.length};
}
