import { getD1, type D1Statement } from "./bindings.ts";
export type ReadSnapshot={key:string;revision:number|null;value:any};
const snapshots=new WeakMap<object,ReadSnapshot>();
export class EditConflictError extends Error {
 readonly code="EDIT_CONFLICT";
 constructor(){super("This information changed while you were editing. Refresh the listing and try again.");}
}
export function rememberSnapshot<T>(key:string,revision:number|null,value:T):T {
 if(value&&typeof value==="object"){const json=JSON.stringify(value);snapshots.set(value as object,{key,revision,get value(){return JSON.parse(json);}}); }
 return value;
}
export function snapshotOf(value:unknown):ReadSnapshot|undefined {
 return value&&typeof value==="object"?snapshots.get(value as object):undefined;
}
export function inheritSnapshot(from:unknown,to:unknown,key?:string):void {
 if(!to||typeof to!=="object")return;
 const snapshot=snapshotOf(from);
 if(snapshot)snapshots.set(to as object,key&&key!==snapshot.key?{key,revision:null,value:structuredClone(from)}:snapshot);
 else if(key)snapshots.set(to as object,{key,revision:null,value:structuredClone(from??[])});
}
function equal(a:any,b:any):boolean {
 if(a===b)return true;
 if(a==null||b==null||typeof a!=="object"||typeof b!=="object")return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
 const ak=Object.keys(a).filter(k=>a[k]!==undefined).sort(),bk=Object.keys(b).filter(k=>b[k]!==undefined).sort();
 return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&equal(a[k],b[k]));
}
const isObject=(v:any)=>v!==null&&typeof v==="object"&&!Array.isArray(v);
function recordKey(row:any,path:string):string|null {
 if(!isObject(row))return null;
 if(typeof row.id==="string")return row.id;
 if(path.endsWith("corrections")&&typeof row.churchId==="string"&&typeof row.field==="string")return JSON.stringify([row.churchId,row.field,row.appliedAt,row.value]);
 if(path.endsWith("submissions")&&typeof row.ip==="string"&&typeof row.field==="string")return JSON.stringify([row.ip,row.field,!!row.needsModeration]);
 if((path.endsWith("confirmations")||path.endsWith("verifications"))&&typeof row.ip==="string")return row.ip;
 if(path.endsWith("suggestions")&&typeof row.churchId==="string"&&typeof row.field==="string")return JSON.stringify([row.churchId,row.field]);
 return null;
}
/** Preserve disjoint edits, additions, and removals; never choose a winner for a changed field. */
export function mergeEdits(base:any,current:any,proposed:any,path=""):any {
 if(/\.(totalCorrections|totalConfirmations)$/.test(path)&&[base,current,proposed].every(v=>typeof v==="number")&&!equal(base,current)&&!equal(base,proposed))return current+(proposed-base);
 if(equal(base,proposed))return structuredClone(current);
 if(equal(base,current)||equal(current,proposed))return structuredClone(proposed);
 if(path.endsWith("lastVerified")&&(base==null||typeof base==="number")&&typeof current==="number"&&typeof proposed==="number")return Math.max(current,proposed);
 if(path.endsWith("lastUpdated")&&[current,proposed].every(v=>typeof v==="number"))return Math.max(current,proposed);
 if(path.endsWith("lastUpdated")&&[current,proposed].every(v=>typeof v==="string"&&!isNaN(Date.parse(v))))return current>proposed?current:proposed;
 if(base===undefined&&isObject(current)&&isObject(proposed))base={};
 if(base===undefined&&Array.isArray(current)&&Array.isArray(proposed))base=[];
 if(isObject(base)&&isObject(current)&&isObject(proposed)){
  const entries:Array<[string,any]>=[];
  for(const key of new Set([...Object.keys(base),...Object.keys(current),...Object.keys(proposed)])){
   const value=mergeEdits(base[key],current[key],proposed[key],path+"."+key);
   if(value!==undefined)entries.push([key,value]);
  }
  return Object.fromEntries(entries);
 }
 if(Array.isArray(base)&&Array.isArray(current)&&Array.isArray(proposed)){
  if(path.endsWith("churchesImproved")&&base.every(v=>current.includes(v)&&proposed.includes(v)))return [...new Set([...current,...proposed])];
  const lists=[base,current,proposed];
  if(lists.every(list=>list.every(row=>recordKey(row,path)!==null)&&new Set(list.map(row=>recordKey(row,path))).size===list.length)){
   const maps=lists.map(list=>new Map(list.map(row=>[recordKey(row,path)!,row])));
   const out:any[]=[];
   for(const key of new Set([...maps[1].keys(),...maps[2].keys(),...maps[0].keys()])){
    const value=mergeEdits(maps[0].get(key),maps[1].get(key),maps[2].get(key),path+"[]");
    if(value!==undefined)out.push(value);
   }
   return path.endsWith("corrections")?out.slice(0,500):out;
  }
 }
 throw new EditConflictError();
}
export function guardStatement(snapshot:ReadSnapshot,token:string):D1Statement {
 const condition=snapshot.revision===null?"NOT EXISTS(SELECT 1 FROM kv WHERE key=?2)":"EXISTS(SELECT 1 FROM kv WHERE key=?2 AND revision=?3)";
 const stmt=getD1().prepare(`INSERT INTO kv_write_guards(token,valid) VALUES(?1,CASE WHEN ${condition} THEN 1 ELSE NULL END)`);
 return snapshot.revision===null?stmt.bind(token,snapshot.key):stmt.bind(token,snapshot.key,snapshot.revision);
}
export function isGuardConflict(e:unknown):boolean {return /kv_write_guards\.valid|CHECK constraint failed: valid=1/.test(String((e as Error)?.message??e));}
export function replaceInPlace(target:any,value:any):void {
 if(Array.isArray(target)&&Array.isArray(value)){target.length=0;for(const item of value)target.push(item);}
 else if(isObject(target)&&isObject(value)){for(const key of Object.keys(target))delete target[key];for(const [key,v]of Object.entries(value))Object.defineProperty(target,key,{value:v,enumerable:true,writable:true,configurable:true});}
}

export function currentReviewValue(ch:any,field:string,region?:string|null):unknown {
 if(!ch)return null;
 if(field==="address"||field==="reportRelocated")return {address:ch.address??null,city:ch.city??null,state:ch.state??region??null,postcode:ch.postcode??null,lat:ch.lat??null,lng:ch.lng??null};
 if(["reportClosed","reportDuplicate","reportOutOfScope"].includes(field))return {name:ch.name??null,website:ch.website??null,address:ch.address??null,city:ch.city??null,state:ch.state??region??null,listingStatus:ch.listingStatus??null};
 return ch[field]??null;
}

export async function proposalVersion(entry:any,field:string,currentValue?:unknown):Promise<string>{
 const value=JSON.stringify({currentValue,submissions:(entry?.submissions??[]).filter((s:any)=>s.field===field),previousValue:entry?.previousValues?.[field]});
 return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,"0")).join("");
}

export function forgetSnapshot(value:unknown):void {if(value&&typeof value==="object")snapshots.delete(value as object);}
