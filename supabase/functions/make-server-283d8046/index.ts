import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import * as kv from "./kv_store.tsx";
import { recordChurchAudit, queryAuditRecent, queryAuditByState, queryAuditByChurch } from "./audit.ts";
import { generateOgImage } from "./og-image.tsx";
import { POP } from "./state-populations.ts";

// ── State data ──
interface SI{a:string;n:string;la:number;lo:number;}
const S:[string,string,number,number][]=[["AL","Alabama",32.81,-86.79],["AK","Alaska",61.37,-152.4],["AZ","Arizona",33.73,-111.43],["AR","Arkansas",34.97,-92.37],["CA","California",36.12,-119.68],["CO","Colorado",39.06,-105.31],["CT","Connecticut",41.6,-72.76],["DE","Delaware",39.32,-75.51],["FL","Florida",27.77,-81.69],["GA","Georgia",33.04,-83.64],["HI","Hawaii",21.09,-157.5],["ID","Idaho",44.24,-114.48],["IL","Illinois",40.35,-88.99],["IN","Indiana",39.85,-86.26],["IA","Iowa",42.01,-93.21],["KS","Kansas",38.53,-96.73],["KY","Kentucky",37.67,-84.67],["LA","Louisiana",31.17,-91.87],["ME","Maine",44.69,-69.38],["MD","Maryland",39.06,-76.8],["MA","Massachusetts",42.23,-71.53],["MI","Michigan",43.33,-84.54],["MN","Minnesota",45.69,-93.9],["MS","Mississippi",32.74,-89.68],["MO","Missouri",38.46,-92.29],["MT","Montana",46.92,-110.45],["NE","Nebraska",41.13,-98.27],["NV","Nevada",38.31,-117.06],["NH","New Hampshire",43.45,-71.56],["NJ","New Jersey",40.3,-74.52],["NM","New Mexico",34.84,-106.25],["NY","New York",42.17,-74.95],["NC","North Carolina",35.63,-79.81],["ND","North Dakota",47.53,-99.78],["OH","Ohio",40.39,-82.76],["OK","Oklahoma",35.57,-96.93],["OR","Oregon",44.57,-122.07],["PA","Pennsylvania",40.59,-77.21],["RI","Rhode Island",41.68,-71.51],["SC","South Carolina",33.86,-80.95],["SD","South Dakota",44.3,-99.44],["TN","Tennessee",35.75,-86.69],["TX","Texas",31.05,-97.56],["UT","Utah",40.15,-111.86],["VT","Vermont",44.05,-72.71],["VA","Virginia",37.77,-78.17],["WA","Washington",47.4,-121.49],["WV","West Virginia",38.49,-80.95],["WI","Wisconsin",44.27,-89.62],["WY","Wyoming",42.76,-107.3]];
const US:SI[]=S.map(([a,n,la,lo])=>({a,n,la,lo}));
function gS(a:string):SI|undefined{return US.find(s=>s.a===a.toUpperCase());}

// ── Geographic data ──
const B:Record<string,[number,number,number,number]>={AL:[30.22,-88.47,35.01,-84.89],AK:[51.21,-179.15,71.39,-129.98],AZ:[31.33,-114.81,37,-109.04],AR:[33,-94.62,36.5,-89.64],CA:[32.53,-124.41,42.01,-114.13],CO:[36.99,-109.06,41,-102.04],CT:[40.95,-73.73,42.05,-71.79],DE:[38.45,-75.79,39.84,-75.05],FL:[24.4,-87.63,31,-79.97],GA:[30.36,-85.61,35,-80.84],HI:[18.91,-160.24,22.24,-154.81],ID:[42,-117.24,49,-111.04],IL:[36.97,-91.51,42.51,-87.02],IN:[37.77,-88.1,41.76,-84.78],IA:[40.38,-96.64,43.5,-90.14],KS:[36.99,-102.05,40,-94.59],KY:[36.5,-89.57,39.15,-81.96],LA:[28.93,-94.04,33.02,-88.82],ME:[42.98,-71.08,47.46,-66.95],MD:[37.91,-79.49,39.72,-75.05],MA:[41.24,-73.5,42.89,-69.93],MI:[41.7,-90.42,48.31,-82.12],MN:[43.5,-97.24,49.38,-89.49],MS:[30.17,-91.66,34.99,-88.1],MO:[35.99,-95.77,40.61,-89.1],MT:[44.36,-116.05,49,-104.04],NE:[39.99,-104.05,43,-95.31],NV:[35,-120.01,42,-114.04],NH:[42.7,-72.56,45.31,-70.7],NJ:[38.93,-75.56,41.36,-73.89],NM:[31.33,-109.05,37,-103],NY:[40.5,-79.76,45.02,-71.86],NC:[33.84,-84.32,36.59,-75.46],ND:[45.94,-104.05,49,-96.55],OH:[38.4,-84.82,42.33,-80.52],OK:[33.62,-103,37,-94.43],OR:[41.99,-124.57,46.29,-116.46],PA:[39.72,-80.52,42.27,-74.69],RI:[41.15,-71.86,42.02,-71.12],SC:[32.03,-83.35,35.22,-78.54],SD:[42.48,-104.06,45.95,-96.44],TN:[34.98,-90.31,36.68,-81.65],TX:[25.84,-106.65,36.5,-93.51],UT:[36.99,-114.05,42,-109.04],VT:[42.73,-73.44,45.02,-71.46],VA:[36.54,-83.68,39.47,-75.24],WA:[45.54,-124.85,49,-116.92],WV:[37.2,-82.64,40.64,-77.72],WI:[42.49,-92.89,47.08,-86.25],WY:[40.99,-111.06,45.01,-104.05],DC:[38.79,-77.12,38.99,-76.91]};
// States that use 4-quadrant Overpass queries to avoid single-query 2000 truncation
const BIG=new Set(["TX","CA","FL","NY","PA","OH","IL","GA","NC","MI","TN","VA","AL","MO","IN","SC","KY","LA","WI","MN","MS","AR","OK","IA","KS","NJ","AZ","WA","OR","MA","NV","NM","UT","CT","MD","CO"]);

// ── Denomination matching (lazy regex compilation) ──
type DR=[string,string[]?,string?,string[]?];
const RULES:DR[]=[
["Catholic",["catholic","roman_catholic"]],
["Catholic",,"\\b(parroquia|catedral|nuestra|virgen|sagrado|iglesia cat)\\b",["baptist","pentecostal","lutheran"]],
["Catholic",,"\\b(parish|basilica|sacred heart|immaculate|our lady|blessed sacrament|holy (family|cross|spirit|trinity|rosary|name|redeemer))\\b",["lutheran","episcopal","orthodox","baptist","methodist","presbyterian","anglican"]],
["Catholic",,"\\bst\\. (patrick|joseph|mary|anne|anthony|michael|peter|paul|john|james|francis|theresa|catherine|augustine|thomas|elizabeth|jude)\\b",["lutheran","episcopal","orthodox","baptist","methodist","presbyterian","anglican","latter"]],
["Catholic",,"\\b(maronite|melkite|chaldean|byzantine catholic|latin mass|tridentine)\\b"],
["Baptist",["baptist","sbc","southern baptist"]],
["Methodist",["methodist","united_methodist","african methodist","wesleyan"]],
["Methodist",,"\\b(ame|umc)\\b"],
["Lutheran",["lutheran","lcms","elca","wels","missouri synod"]],
["Presbyterian",["presbyterian","pcusa"]],
["Episcopal",["episcopal","anglican","acna"]],
["Pentecostal",["pentecostal","foursquare"]],
["Pentecostal",["apostolic"],,"latter"],
["Pentecostal",,"\\b(church of god of prophecy|full gospel|holiness church|iglesia pentecostal|deliverance (church|temple|center)|united pentecostal)\\b"],
["Assemblies of God",["assemblies of god","assembly of god","assemblies_of_god","assembly_of_god"]],
["Church of Christ",,"\\bchurch(es)? of christ\\b",["united church of christ","latter"]],
["Congregational",["united church of christ","congregational"]],
["Church of God",["church of god"],,"latter,prophecy".split(",")],
["Church of God",["cogic","church of god in christ"]],
["Latter-day Saints",["latter","mormon","lds","church of jesus christ"]],
["Seventh-day Adventist",["seventh","adventist","sda"]],
["Jehovah's Witnesses",["jehovah","kingdom hall"]],
["Orthodox",["orthodox"]],
["Non-denominational",["nondenominational","non-denominational","non_denominational","calvary chapel","vineyard"]],
["Non-denominational",,"\\b(bible church|bible fellowship|worship center|faith (center|church)|grace (church|bible)|harvest church|city church|rock church|cornerstone|new life church|victory church|journey church|mosaic church|bridge church|summit church)\\b"],
["Non-denominational",,"\\b(iglesia cristiana|centro cristiano|ministerio cristiano|casa de (oraci|dios|fe))\\b",["adventist","baptist","catolica"]],
["Non-denominational",,"\\bcommunity church\\b",["methodist","lutheran","baptist","presbyterian","reformed"]],
["Evangelical",["evangelical","efca","evangelical free"],,"lutheran"],
["Nazarene",["nazarene"]],
["Quaker",["quaker","friends meeting"]],
["Mennonite",["mennonite","church of the brethren"]],
["Amish",["amish"]],
["Reformed",["reformed","christian reformed"],,"latter"],
["Unitarian",["unitarian","universalist"]],
["Christian Science",["christian science","scientist"]],
["Salvation Army",["salvation army"]],
["Disciples of Christ",["disciples of christ"]],
["Covenant",["covenant"],,"ark of,old covenant"],
["Non-denominational",,"\\b(iglesia|templo|ministerio)\\b",["catholic","catolica"]],
["Non-denominational",,"\\bchapel\\b",["catholic","methodist","lutheran","baptist","episcopal","presbyterian","orthodox"]],
];

// Lazy-compile regexes on first use to reduce cold-start time
let _compiled:({r:string;i?:string[];x?:string[];_re:RegExp|null})[]=[];
function getCompiled(){
  if(_compiled.length)return _compiled;
  _compiled=RULES.map(([r,i,re,x])=>({r,i,x:x?(typeof x==="string"?x.split(","):x):undefined,_re:re?new RegExp(re,"i"):null}));
  return _compiled;
}

function matchD(text:string):string|null{
  const l=text.toLowerCase().replace(/[''ʼ]/g,"'").replace(/[‐–—]/g,"-");
  for(const{r,i,x,_re}of getCompiled()){
    if(x&&x.some(e=>l.includes(e)))continue;
    if(i&&i.some(inc=>l.includes(inc))){if(_re){if(_re.test(l))return r;}else return r;continue;}
    if(_re&&!i&&_re.test(l))return r;
  }
  return null;
}
function normD(tags:Record<string,string>):string{
  if(tags.denomination){const m=matchD(tags.denomination);if(m)return m;const c=tags.denomination.replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase()).substring(0,40);if(c&&c!=="Unknown"&&c!=="Other")return c;}
  for(const k of["operator","network"]){if(tags[k]){const m=matchD(tags[k]);if(m)return m;}}
  if(tags.brand){const m=matchD(tags.brand);if(m)return m;}
  const name=tags.name||tags["name:en"]||"";if(name){const m=matchD(name);if(m)return m;}
  for(const k of["description","note","official_name","alt_name","website"]){if(tags[k]){const m=matchD(tags[k]);if(m)return m;}}
  return"Non-denominational";
}

const DMED:Record<string,number>={"Catholic":800,"Baptist":85,"Methodist":70,"Lutheran":75,"Presbyterian":75,"Episcopal":60,"Pentecostal":75,"Assemblies of God":100,"Non-denominational":120,"Latter-day Saints":180,"Church of Christ":65,"Church of God":70,"Orthodox":60,"Seventh-day Adventist":55,"Evangelical":100,"Jehovah's Witnesses":70,"Nazarene":65,"Congregational":55,"Mennonite":55,"Amish":80,"Reformed":75,"Salvation Army":35,"Christian Science":25,"Unitarian":50,"Quaker":25,"Covenant":80,"Disciples of Christ":70};
const ARDA:Record<string,number>={"Catholic":849,"Baptist":119,"Methodist":54,"Lutheran":66,"Presbyterian":59,"Episcopal":54,"Pentecostal":79,"Assemblies of God":106,"Non-denominational":143,"Latter-day Saints":173,"Church of Christ":66,"Church of God":70,"Orthodox":60,"Seventh-day Adventist":75,"Evangelical":84,"Jehovah's Witnesses":62,"Nazarene":52,"Congregational":36,"Mennonite":66,"Amish":88,"Reformed":63,"Salvation Army":30,"Christian Science":21,"Unitarian":44,"Quaker":22,"Covenant":75,"Disciples of Christ":36};

// ── Blocked denominations (fully excluded) ──
const BLOCKED_DENOMINATIONS_CANONICAL=new Set<string>([
  "Latter-day Saints",
  "Jehovah's Witnesses",
  "Unitarian",
  "Christian Science",
]);

const BLOCKED_DENOMINATION_KEYWORDS=[
  "latter-day saints",
  "latter day saints",
  "church of jesus christ of latter-day saints",
  "lds",
  "mormon",
  "mormons",
  "jehovah's witnesses",
  "jehovahs witnesses",
  "unitarian",
  "unitarian universalist",
  "universalist unitarian",
  "christian science",
  "church of christ, scientist",
];

function isBlockedDenomination(denomination:string|undefined|null):boolean{
  if(!denomination)return false;
  const v=denomination.trim();
  if(!v)return false;
  if(BLOCKED_DENOMINATIONS_CANONICAL.has(v))return true;
  const l=v.toLowerCase();
  return BLOCKED_DENOMINATION_KEYWORDS.some(k=>l.includes(k));
}
const NATIONAL_AVG_POP=Object.values(POP).reduce((a:number,b:number)=>a+b,0)/Object.keys(POP).length;
function applyStateScaling(ch:any[],st:string):void{
  const statePop=POP[st]||NATIONAL_AVG_POP;
  const factor=Math.min(1.2,Math.pow(statePop/NATIONAL_AVG_POP,0.12));
  for(const c of ch){c.attendance=Math.max(10,Math.min(Math.round((c.attendance||10)*factor),25000));}
}

function refARDA(d:string,est:number):number{
  const a=ARDA[d];if(!a)return est;
  const b=Math.round(est*0.7+a*0.3);
  const floor=Math.min(est,Math.round(a*0.85));
  return Math.max(10,Math.min(Math.max(b,floor),Math.round(est*2)));
}
function enrichARDA(ch:any[]):number{let n=0;for(const c of ch){const o=c.attendance;c.attendance=refARDA(c.denomination,o);if(c.attendance!==o)n++;}return n;}

// ── Building area from OSM polygon geometry ──
function calcAreaSqft(geom:{lat:number,lon:number}[]):number{
  if(!geom||geom.length<3)return 0;
  const toRad=Math.PI/180;
  const midLat=geom.reduce((s,p)=>s+p.lat,0)/geom.length;
  const cosLat=Math.cos(midLat*toRad);
  const mPerDegLat=111320,mPerDegLon=111320*cosLat;
  let area=0;
  for(let i=0;i<geom.length;i++){
    const j=(i+1)%geom.length;
    const xi=geom[i].lon*mPerDegLon,yi=geom[i].lat*mPerDegLat;
    const xj=geom[j].lon*mPerDegLon,yj=geom[j].lat*mPerDegLat;
    area+=xi*yj-xj*yi;
  }
  const sqft=Math.abs(area/2)*10.764;
  return(sqft>=500&&sqft<=200000)?sqft:0;
}
function getElArea(el:any):number{
  if(el.type==="way"&&Array.isArray(el.geometry))return calcAreaSqft(el.geometry);
  if(el.type==="relation"&&Array.isArray(el.members)){
    let total=0;
    for(const m of el.members){if(m.role==="outer"&&Array.isArray(m.geometry))total+=calcAreaSqft(m.geometry);}
    return(total>=500&&total<=200000)?total:0;
  }
  return 0;
}

// ── Attendance estimation ──
function seed(s:string):number{let h=0;for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}return(Math.abs(h)%10000)/10000;}
function svcC(t:Record<string,string>):number{const s=t.service_times||t["service_times:sunday"]||"";return s?s.split(/[,;]/).filter((x:string)=>/\d{1,2}:\d{2}/.test(x)).length:0;}

function estA(tags:Record<string,string>,oid:string|number,eT?:string):number{
  for(const k of["capacity","seats","capacity:persons"]){if(tags[k]){const v=parseInt(tags[k]);if(!isNaN(v)&&v>0)return Math.max(10,Math.min(Math.round(v*0.6*Math.max(1,svcC(tags)*0.7)),15000));}}
  const d=normD(tags),nm=(tags.name||"").toLowerCase();
  const baseDmed=DMED[d]??65,baseArda=(ARDA[d]??0)*0.7;
  let est=(d in DMED||d in ARDA)?Math.max(baseDmed,baseArda):90;
  let m=1.0;
  if(nm.includes("cathedral")||nm.includes("basilica"))m*=3;
  else if(nm.includes("tabernacle")||nm.includes("temple"))m*=1.6;
  else if(/\b(mega|megachurch)\b/.test(nm))m*=8;
  if(/^first\s/.test(nm)||/\bfirst (baptist|methodist|lutheran|presbyterian)\b/.test(nm))m*=1.5;
  if(nm.includes("chapel")||nm.includes("capilla"))m*=0.6;
  else if(/\b(mission|misión)\b/.test(nm)&&!nm.includes("missionary"))m*=0.65;
  else if(nm.includes("house church")||nm.includes("home church"))m*=0.2;
  const mega=/\b(saddleback|lakewood|elevation|life\.?church|north ?point|willow creek|gateway church|church of the highlands)\b/;
  if(mega.test(nm))m*=10;
  const sc=svcC(tags);if(sc>=3)m*=2;else if(sc===2)m*=1.5;
  const tc=Object.keys(tags).length;if(tc>=15)m*=1.3;else if(tc>=10)m*=1.15;else if(tc<=3)m*=0.9;
  if(tags.website||tags["contact:website"])m*=1.15;
  if(tags.wikidata||tags.wikipedia)m*=2;
  if(!mega.test(nm))m=Math.min(m,6);
  return Math.max(10,Math.min(Math.round(est*m*(0.92+seed(String(oid))*0.32)),25000));
}

function city(t:Record<string,string>):string{
  for(const k of["addr:city","addr:town","addr:village","addr:hamlet","addr:suburb"])if(t[k])return t[k];
  if(t["is_in"]){const p=t["is_in"].split(",")[0]?.trim();if(p)return p;}
  return t["addr:place"]||"";
}

// ── Overpass ──
const OVP=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"];

async function ovpF(ep:string,q:string,ms=60000):Promise<Response>{
  const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
  try{return await fetch(ep,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:`data=${encodeURIComponent(q)}`,signal:c.signal});}
  finally{clearTimeout(t);}
}
async function ovpQ(q:string,label:string):Promise<any[]>{
  const errs:string[]=[];
  for(const ep of OVP){
    for(let a=0;a<=1;a++){
      try{
        const r=await ovpF(ep,q);
        if(r.status===429||r.status===504){await new Promise(r=>setTimeout(r,(a+1)*3000));continue;}
        if(!r.ok){errs.push(`${r.status}`);break;}
        return(await r.json()).elements||[];
      }catch(e:any){errs.push(e?.name==="AbortError"?"timeout":String(e));if(e?.name==="AbortError")break;await new Promise(r=>setTimeout(r,1000));}
    }
  }
  throw new Error(`Overpass fail ${label}: ${errs.join("|")}`);
}
function bQ(iso:string,bbox?:[number,number,number,number]):string{
  const f=bbox?`(area.searchArea)(${bbox.join(",")})`:"(area.searchArea)";
  // Request up to 10000 elements per query; public Overpass may still cap at 2000
  return`[out:json][timeout:90];area["ISO3166-2"="${iso}"]->.searchArea;(node["amenity"="place_of_worship"]["religion"="christian"]${f};way["amenity"="place_of_worship"]["religion"="christian"]${f};relation["amenity"="place_of_worship"]["religion"="christian"]${f};);out geom 10000;`;
}
function splitB(b:[number,number,number,number]):[number,number,number,number][]{const[s,w,n,e]=b,mL=(s+n)/2,mN=(w+e)/2;return[[s,w,mL,mN],[s,mN,mL,e],[mL,w,n,mN],[mL,mN,n,e]];}

function parse(els:any[],st:string):any[]{
  const b=B[st.toUpperCase()];
  return els.map((el:any,i:number)=>{
    // out geom: nodes have lat/lon; ways/relations have bounds (and geometry array)
    let lat=el.lat,lng=el.lon;
    if(!lat&&el.bounds){lat=(el.bounds.minlat+el.bounds.maxlat)/2;lng=(el.bounds.minlon+el.bounds.maxlon)/2;}
    if(!lat&&el.center){lat=el.center.lat;lng=el.center.lon;}
    if(!lat||!lng)return null;
    if(b){const[s,w,n,e]=b;if(lat<s-0.01||lat>n+0.01||lng<w-0.01||lng>e+0.01)return null;}
    const t=el.tags||{};
    const denomination=normD(t);
    if(isBlockedDenomination(denomination))return null;
    const sqft=getElArea(el);
    // Free geometry data after area calc to reduce memory for large states
    if(el.geometry)el.geometry=undefined;
    if(el.members)for(const m of el.members)if(m.geometry)m.geometry=undefined;
    const attendance=sqft>0?Math.max(10,Math.min(25000,Math.round(sqft/55))):estA(t,el.id,el.type);
    const obj:any={id:`${st}-${el.id||i}`,name:t.name||t["name:en"]||"Unnamed Church",lat,lng,denomination,attendance,state:st.toUpperCase(),city:city(t),address:t["addr:street"]?`${t["addr:housenumber"]||""} ${t["addr:street"]}`.trim():"",website:t.website||t["contact:website"]||""};
    if(sqft>0)obj.buildingSqft=Math.round(sqft);
    return obj;
  }).filter(Boolean);
}

async function fetchCh(st:string):Promise<any[]>{
  const info=gS(st);if(!info)throw new Error(`Unknown: ${st}`);
  const iso=`US-${st.toUpperCase()}`,b=B[st.toUpperCase()];
  if(BIG.has(st.toUpperCase())&&b){
    const qs=splitB(b);const seen=new Set<string>();let all:any[]=[];
    const failed:number[]=[];
    for(let i=0;i<qs.length;i++){
      try{const els=await ovpQ(bQ(iso,qs[i]),`${st}-Q${i+1}`);for(const c of parse(els,st)){if(!seen.has(c.id)){seen.add(c.id);all.push(c);}}}catch(e){console.log(`Q${i+1} fail:${e}`);failed.push(i);}
      if(i<qs.length-1)await new Promise(r=>setTimeout(r,500));
    }
    // Retry failed quadrants once after a pause
    if(failed.length>0){
      console.log(`[${st}] Retrying ${failed.length} failed quadrant(s): ${failed.map(i=>`Q${i+1}`).join(",")}`);
      await new Promise(r=>setTimeout(r,3000));
      for(const i of failed){
        try{const els=await ovpQ(bQ(iso,qs[i]),`${st}-Q${i+1}-retry`);for(const c of parse(els,st)){if(!seen.has(c.id)){seen.add(c.id);all.push(c);}}}catch(e){console.log(`Q${i+1} retry fail:${e}`);}
        await new Promise(r=>setTimeout(r,1000));
      }
    }
    return all;
  }
  const els=await ovpQ(bQ(iso),st);let ch=parse(els,st);
  if(st.toUpperCase()==="MD"){try{const dc=await ovpQ(bQ("US-DC"),"DC");const d=parse(dc,"MD");const seen=new Set(ch.map((c:any)=>c.id));for(const c of d)if(!seen.has(c.id))ch.push(c);}catch(_){}}
  return ch;
}

// ── shortId (8-digit, unique per state, for URLs) ──
function toShortId(id:string,state:string,existingShortId?:string):string{
  if(existingShortId&&/^\d{8}$/.test(existingShortId))return existingShortId;
  const st=state.toUpperCase();
  const statePrefix=`${st}-`;
  if(id.startsWith(statePrefix)){
    const numPart=id.slice(statePrefix.length);
    if(/^\d+$/.test(numPart)){
      const s=numPart.length>=8?numPart.slice(0,8):numPart.padStart(8,"0");
      return s;
    }
  }
  if(id.startsWith("community-")){
    let h=0;for(let i=0;i<id.length;i++)h=((h<<5)-h+id.charCodeAt(i))|0;
    const n=Math.abs(h)%100000000;
    return n.toString().padStart(8,"0");
  }
  let h=0;for(let i=0;i<id.length;i++)h=((h<<5)-h+id.charCodeAt(i))|0;
  return Math.abs(h).toString().padStart(8,"0").slice(0,8);
}
/** Assign unique 8-digit shortIds per state; resolves collisions so each church has a distinct segment. */
function addShortIdsUnique(ch:any[],st:string):any[]{
  const used=new Set<string>();
  return ch.map((c:any)=>{
    let sid=toShortId(c.id,c.state||st,c.shortId);
    while(used.has(sid))sid=Math.floor(10000000+Math.random()*90000000).toString();
    used.add(sid);
    return {...c,shortId:sid};
  });
}
function addShortIds(ch:any[],st:string):any[]{return ch.map((c:any)=>({...c,shortId:toShortId(c.id,c.state||st,c.shortId)}));}

// ── Search index (include shortId so search returns unique segment per church) ──
function buildIdx(ch:any[]){return ch.map((c:any)=>({id:c.id,shortId:c.shortId,n:c.name||"",c:c.city||"",d:c.denomination||"",a:c.attendance||0,ad:c.address||"",la:c.lat||0,lo:c.lng||0}));}
async function writeIdx(st:string,ch:any[]){await kv.set(`churches:sidx:${st}`,buildIdx(ch));}

// Preserve user/community-submitted fields when overwriting cache (populate force, refresh-attendance).
const USER_FIELDS_TO_PRESERVE=["homeCampusId","serviceTimes","languages","ministries","pastorName","phone","email","lastVerified","buildingSqft"] as const;
function mergeUserFieldsFromExisting(existingChurches:any[],newChurches:any[]):void{
  if(!Array.isArray(existingChurches)||!existingChurches.length)return;
  const oldById=new Map<string,any>();
  for(const c of existingChurches)if(c&&c.id)oldById.set(c.id,c);
  for(const c of newChurches){
    if(!c||!c.id)continue;
    const old=oldById.get(c.id);if(!old)continue;
    for(const f of USER_FIELDS_TO_PRESERVE){
      const v=old[f];
      if(v===undefined)continue;
      if(f==="buildingSqft"&&(c.buildingSqft!=null&&c.buildingSqft>0))continue;
      (c as any)[f]=v;
    }
  }
}

// Shared normalization and tokenization helpers for search. Keep in sync with
// src/app/components/search-normalize.ts on the frontend.
function normalizeSearchText(text:string):string{
  if(!text)return"";
  const lower=text.toLowerCase();
  const cleaned=lower.replace(/[^a-z0-9]+/g," ");
  return cleaned.replace(/\s+/g," ").trim();
}
function tokenizeSearchText(text:string):string[]{
  const norm=normalizeSearchText(text);
  if(!norm)return[];
  const parts=norm.split(" ").filter(Boolean);
  const seen=new Set<string>();
  const tokens:string[]=[];
  for(const p of parts){
    if(!seen.has(p)){seen.add(p);tokens.push(p);}
  }
  return tokens;
}

function levenshteinDistance(a:string,b:string):number{
  const m=a.length,n=b.length;
  if(m===0)return n;
  if(n===0)return m;
  const prev=new Array<number>(n+1);
  const curr=new Array<number>(n+1);
  for(let j=0;j<=n;j++)prev[j]=j;
  for(let i=1;i<=m;i++){
    curr[0]=i;
    const ca=a.charCodeAt(i-1);
    for(let j=1;j<=n;j++){
      const cb=b.charCodeAt(j-1);
      if(ca===cb)curr[j]=prev[j-1];
      else{
        const insert=curr[j-1]+1;
        const remove=prev[j]+1;
        const replace=prev[j-1]+1;
        curr[j]=insert<remove?(insert<replace?insert:replace):remove<replace?remove:replace;
      }
    }
    for(let j=0;j<=n;j++)prev[j]=curr[j];
  }
  return prev[n];
}

function tokenSimilarity(a:string,b:string):number{
  const ta=normalizeSearchText(a);
  const tb=normalizeSearchText(b);
  if(!ta||!tb)return 0;
  if(ta===tb)return 1;
  const maxLen=Math.max(ta.length,tb.length);
  if(!maxLen)return 0;
  const dist=levenshteinDistance(ta,tb);
  const sim=1-dist/maxLen;
  return sim<0?0:sim;
}

// Relevance scoring: keep in sync with src/app/components/search-scoring.ts
const PHRASE=1000,ALL_IN_NAME=500,NAME_STARTS=300,TOK_NAME=50,TOK_LOC=30;
function scoreMatch(qRaw:string,n:string,ci:string,ad:string):number{
  const qNorm=normalizeSearchText(qRaw);
  if(!qNorm)return 0;
  const tokens=tokenizeSearchText(qNorm);
  if(!tokens.length)return 0;
  const nameNorm=normalizeSearchText(n);
  const cityNorm=normalizeSearchText(ci);
  const addressNorm=normalizeSearchText(ad);
  const nameTokens=tokenizeSearchText(n);
  const cityTokens=tokenizeSearchText(ci);
  const addressTokens=tokenizeSearchText(ad);
  let s=0;
  if(nameNorm.includes(qNorm))s+=PHRASE;
  const bestSimIn=(token:string,arr:string[]):number=>{
    let best=0;
    for(const t of arr){
      const sim=tokenSimilarity(token,t);
      if(sim>best)best=sim;
      if(best>=1)break;
    }
    return best;
  };
  const allInName=tokens.every((t:string)=>bestSimIn(t,nameTokens)>=0.9);
  if(allInName)s+=ALL_IN_NAME;
  if(tokens.length>0&&nameTokens.length>0){
    const firstToken=tokens[0];
    const firstNameToken=nameTokens[0];
    if(tokenSimilarity(firstToken,firstNameToken)>=0.85)s+=NAME_STARTS;
  }
  for(const t of tokens){
    const sim=bestSimIn(t,nameTokens);
    if(sim>=0.9)s+=TOK_NAME;
    else if(sim>=0.7)s+=Math.round(TOK_NAME*(sim-0.6));
  }
  for(const t of tokens){
    const simCity=bestSimIn(t,cityTokens);
    const simAddr=bestSimIn(t,addressTokens);
    const best=simCity>simAddr?simCity:simAddr;
    if(best>=0.85)s+=TOK_LOC;
    else if(best>=0.7)s+=Math.round(TOK_LOC*(best-0.6));
  }
  return s;
}

// ── App ──
const app=new Hono();
app.use("/*",cors({origin:"*",allowHeaders:["Content-Type","Authorization"],allowMethods:["GET","POST","PUT","DELETE","OPTIONS"]}));

const P="/make-server-283d8046";

app.get(`${P}/health`,(c)=>c.json({status:"ok",v:6}));

app.get(`${P}/og-image`,async(c)=>{
  try{
    const type=(c.req.query("type")||"state") as "state"|"church";
    const stateAbbrev=(c.req.query("state")||"").toUpperCase().trim();
    if(type==="state"){
      const info=gS(stateAbbrev);
      const stateName=info?.n||stateAbbrev||"Churches";
      const res=await generateOgImage({type:"state",stateName});
      return res;
    }
    const name=decodeURIComponent(c.req.query("name")||"Church");
    const city=decodeURIComponent(c.req.query("city")||"");
    const denomination=decodeURIComponent(c.req.query("denomination")||"");
    const res=await generateOgImage({type:"church",churchName:name,city:city||undefined,stateAbbrev:stateAbbrev||undefined,denomination:denomination||undefined});
    return res;
  }catch(e){
    console.error("og-image error:",e);
    return c.json({error:"Failed to generate OG image"},500);
  }
});

app.get(`${P}/churches/states`,async(c)=>{
  try{
    const meta=await kv.get("churches:meta");const sc:Record<string,number>={...(meta?.stateCounts||{})};
    if(sc["DC"]){sc["MD"]=(sc["MD"]||0)+sc["DC"];delete sc["DC"];}
    return c.json({states:US.map(s=>({abbrev:s.a,name:s.n,lat:s.la,lng:s.lo,churchCount:sc[s.a]||0,isPopulated:!!sc[s.a]})),totalChurches:Object.values(sc).reduce((a:number,b:number)=>a+b,0),populatedStates:Object.keys(sc).length});
  }catch(e){return c.json({states:[],totalChurches:0,populatedStates:0,error:`${e}`},500);}
});

app.get(`${P}/churches/search`,async(c)=>{
  try{
    const rawQ=c.req.query("q")||"",q=rawQ.toLowerCase().trim();
    if(!q||q.length<2)return c.json({results:[],query:rawQ});
    const tokens=q.split(/\s+/).filter(Boolean);
    const meta=await kv.get("churches:meta");const sc:Record<string,number>={...(meta?.stateCounts||{})};
    if(sc["DC"]){sc["MD"]=(sc["MD"]||0)+sc["DC"];delete sc["DC"];}
    const pop=Object.keys(sc);if(!pop.length)return c.json({results:[],query:rawQ});

    let stP=(c.req.query("state")||"").toUpperCase().trim();if(stP==="DC")stP="MD";
    const rawPriority=(c.req.query("priorityStates")||"").trim();
    const priorityStatesParam=rawPriority?rawPriority.split(",").map((s:string)=>s.trim().toUpperCase()).filter(Boolean).map((s:string)=>s==="DC"?"MD":s).filter((s:string)=>pop.includes(s)):[];

    let limit:number;
    if(stP&&pop.includes(stP))limit=Math.min(parseInt(c.req.query("limit")||"100")||100,200);
    else if(priorityStatesParam.length)limit=Math.min(parseInt(c.req.query("limit")||"20")||20,100);
    else limit=Math.min(parseInt(c.req.query("limit")||"10")||10,25);

    const sM:Record<string,string>={};
    for(const s of US){sM[s.a.toLowerCase()]=s.a;sM[s.n.toLowerCase()]=s.a;}
    sM["dc"]="MD";sM["d.c."]="MD";sM["district of columbia"]="MD";

    let target=pop,search=tokens;
    if(stP&&pop.includes(stP)){target=[stP];}
    else if(!priorityStatesParam.length){
      const det:string[]=[],txt:string[]=[],used=new Set<number>(),full=tokens.join(" ");
      for(const s of US){const ln=s.n.toLowerCase();if(ln.includes(" ")&&full.includes(ln)&&pop.includes(s.a)){if(!det.includes(s.a))det.push(s.a);const ws=ln.split(" ");let sf=0;for(const w of ws){for(let i=sf;i<tokens.length;i++){if(!used.has(i)&&tokens[i]===w){used.add(i);sf=i+1;break;}}}}}
      for(let i=0;i<tokens.length;i++){if(used.has(i))continue;const m=sM[tokens[i]];if(m&&pop.includes(m)){det.push(m);used.add(i);}else txt.push(tokens[i]);}
      if(det.length){target=[...new Set(det)];search=txt;}
    }

    let exp:string[];
    let numPriorityStates=0;
    if(priorityStatesParam.length&&!stP){
      const priorityOrdered=priorityStatesParam.filter((s:string)=>pop.includes(s));
      numPriorityStates=priorityOrdered.length;
      const rest=pop.filter((s:string)=>!priorityOrdered.includes(s));
      exp=[...priorityOrdered,...rest];if(exp.includes("MD")&&!exp.includes("DC"))exp.push("DC");
    }else{exp=[...target];if(target.includes("MD")&&!target.includes("DC"))exp.push("DC");}

    const COLLECT_CAP=priorityStatesParam.length?limit*5:500;
    const lastPriorityIdx=numPriorityStates>0?numPriorityStates-1:-1;
    const candidates:Array<{score:number,id:string,shortId:string,name:string,city:string,state:string,denomination:string,attendance:number,lat:number,lng:number,address:string}>=[];
    const seen=new Set<string>();
    let idx=0;
    for(const st of exp){
      if(candidates.length>=COLLECT_CAP)break;
      const realSt=st==="DC"?"MD":st;
      let items:any[]=null;
      try{
        const idxKey=await kv.get(`churches:sidx:${st}`);
        if(Array.isArray(idxKey)&&idxKey.length){items=idxKey;}
        else{
          const raw=await kv.get(`churches:${st}`);
          if(Array.isArray(raw)&&raw.length)items=raw;
        }
      }catch(_){}
      if(!Array.isArray(items)){idx++;continue;}
      const isIdx=items.length>0&&items[0]?.n!==undefined;
      const scoreQ=search.length<tokens.length?search.join(" "):q;
      const searchTokens=tokenizeSearchText(scoreQ);
      for(const e of items){
        if(candidates.length>=COLLECT_CAP)break;
        const n=isIdx?e.n:(e.name||""),ci=isIdx?e.c:(e.city||""),d=isIdx?e.d:(e.denomination||""),ad=isIdx?e.ad:(e.address||"");
        if(searchTokens.length){
          const blobTokens=tokenizeSearchText(`${n} ${ci} ${d} ${ad}`);
          if(!blobTokens.length)continue;
          const blobSet=new Set<string>(blobTokens);
          let matchCount=0;
          for(const t of searchTokens){
            if(blobSet.has(t))matchCount++;
          }
          const minRequired=searchTokens.length<=2?searchTokens.length:Math.max(1,Math.ceil(searchTokens.length*0.6));
          if(matchCount<minRequired)continue;
        }
        const k=`${n.toLowerCase().replace(/[^a-z0-9]/g,"")}|${ci.toLowerCase().replace(/[^a-z0-9]/g,"")}|${ad.toLowerCase().replace(/[^a-z0-9]/g,"")}|${realSt}`;
        if(seen.has(k))continue;seen.add(k);
        const sid=(e.shortId&&/^\d{8}$/.test(e.shortId))?e.shortId:toShortId(e.id,realSt,e.shortId);
        const row={id:e.id,shortId:sid,name:n||"Unknown Church",city:ci,state:realSt,denomination:d||"Unknown",attendance:isIdx?e.a:e.attendance,lat:isIdx?e.la:e.lat,lng:isIdx?e.lo:e.lng,address:ad||""};
        candidates.push({score:scoreMatch(scoreQ,n,ci,ad),...row});
      }
      if(lastPriorityIdx>=0&&idx<=lastPriorityIdx&&candidates.length>=limit)break;
      idx++;
    }
    candidates.sort((a,b)=>b.score-a.score||(a.name||"").localeCompare(b.name||""));
    if(priorityStatesParam.length>0){
      const normSt=(x:string)=>((x||"").trim().toUpperCase().slice(0,2));
      const p0=normSt(priorityStatesParam[0]);
      const pSet=new Set(priorityStatesParam.map(normSt));
      candidates.sort((a,b)=>{
        const sa=normSt(a.state),sb=normSt(b.state);
        const tierA=sa===p0?0:(pSet.has(sa)?1:2);
        const tierB=sb===p0?0:(pSet.has(sb)?1:2);
        if(tierA!==tierB)return tierA-tierB;
        return b.score-a.score||(a.name||"").localeCompare(b.name||"");
      });
    }
    const results=candidates.slice(0,limit).map(({score,...r})=>r);
    return c.json({results,query:rawQ,statesSearched:target.length,stateFilter:target.length<pop.length?target:undefined});
  }catch(e){return c.json({results:[],query:rawQ,error:`${e}`},500);}
});

async function getApprovedCorrectionsForState(st:string):Promise<Record<string,Record<string,string>>>{
  const all=await kv.getByPrefix(`suggestions:${st}-`);
  const approved:Record<string,Record<string,string>>={};
  if(!Array.isArray(all))return approved;
  for(const entry of all){
    if(!entry||!Array.isArray(entry.submissions))continue;
    const id=entry.churchId||"";if(!id)continue;
    const con=consensus(entry.submissions);
    const corr:Record<string,string>={};
    for(const[f,d]of Object.entries(con)){if((d as any).approved&&(d as any).value!==null)corr[f]=(d as any).value;}
    if(Object.keys(corr).length)approved[id]=corr;
  }
  return approved;
}

function mergeCorrectionsIntoChurches(churches:any[],corrections:Record<string,Record<string,string>>):void{
  for(const ch of churches){
    const corr=corrections[ch.id];if(!corr)continue;
    for(const[f,v]of Object.entries(corr)){
      if(f==="attendance"){(ch as any).attendance=parseInt(v)||(ch as any).attendance;}
      else if(f==="languages"||f==="ministries"){(ch as any)[f]=String(v).split(",").map((s:string)=>s.trim()).filter(Boolean);}
      else if(f==="address"){
        const val=String(v).trim();
        if(val.startsWith("{")){try{const o=JSON.parse(val) as Record<string,unknown>;(ch as any).address=String(o.address??"").trim();(ch as any).city=String(o.city??"").trim();(ch as any).state=String(o.state??"").trim().toUpperCase().slice(0,2);const lat=typeof o.lat==="number"&&!isNaN(o.lat)?o.lat:undefined;const lng=typeof o.lng==="number"&&!isNaN(o.lng)?o.lng:undefined;if(lat!=null&&lng!=null&&lat>=18&&lat<=72&&lng>=-180&&lng<=-65){(ch as any).lat=lat;(ch as any).lng=lng;}}catch{ (ch as any).address=val; }}
        else{const parts=val.split(",").map((s:string)=>s.trim());(ch as any).address=parts[0]??"";(ch as any).city=parts[1]??(ch as any).city;(ch as any).state=(parts[2]??((ch as any).state||"")).toUpperCase().slice(0,2);}
      }
      else if(f==="phone"){(ch as any).phone=normalizePhone(String(v))||undefined;}
      else if(f==="homeCampusId"){(ch as any).homeCampusId=(String(v).trim()||undefined);}
      else{(ch as any)[f]=v;}
    }
  }
}

// Parse state from church id (e.g. "TX-123" -> "TX", "community-CA-xxx" -> "CA")
function stateFromChurchId(id:string):string|null{
  if(!id||typeof id!=="string")return null;
  const t=id.trim();
  if(t.startsWith("community-")){const p=t.split("-");if(p.length>=2)return (p[1]||"").toUpperCase().slice(0,2)||null;return null;}
  const dash=t.indexOf("-");if(dash>0){const st=t.slice(0,dash).toUpperCase();if(st.length===2)return st;}
  return null;
}

// Resolve homeCampus summary when homeCampusId points to another state
async function resolveHomeCampus(churches:any[],currentState:string):Promise<void>{
  const meta=await kv.get("churches:meta");const stateCounts=meta?.stateCounts||{};
  for(const ch of churches){
    const hid=(ch as any).homeCampusId;if(!hid||typeof hid!=="string")continue;
    const otherSt=stateFromChurchId(hid);if(!otherSt||otherSt===currentState)continue;
    if(!stateCounts[otherSt])continue;
    const otherCh=await kv.get(`churches:${otherSt}`);if(!Array.isArray(otherCh))continue;
    const main=otherCh.find((c:any)=>c.id===hid);if(!main){continue;}
    const shortId=toShortId(main.id,main.state||otherSt,main.shortId);
    (ch as any).homeCampus={id:main.id,name:main.name||"Unknown",state:otherSt,shortId};
  }
}

// ── Review stats (must be before /churches/:state so "review-stats" is not matched as state) ──
const TIER1_DENOM_EMPTY=["","Unknown","Other"];
const TIER1_SVC_EMPTY=["","unknown","other","see website","tbd","n/a","na","pending","to be determined"];
function isDenomMissing(d:string|undefined):boolean{if(!d)return true;const v=d.trim();return !v||TIER1_DENOM_EMPTY.includes(v);}
function isServiceTimesMissing(v:string|undefined):boolean{if(!v)return true;const n=v.trim().toLowerCase();return TIER1_SVC_EMPTY.includes(n);}
function isAddressMeaningful(addr:string|undefined,city:string,state:string):boolean{
  if(!addr||!addr.trim())return false;
  const a=addr.trim();if(a.length<5)return false;
  const c=(city||"").trim().toLowerCase(),s=(state||"").trim().toLowerCase(),an=a.toLowerCase();
  if(c&&an===c)return false;
  const cs=[c,s].filter(Boolean).join(", ");
  if(cs&&an===cs)return false;
  return true;
}
function churchNeedsReview(ch:any):{needsReview:boolean;missingAddress:boolean;missingServiceTimes:boolean;missingDenomination:boolean}{
  const missingAddress=!isAddressMeaningful(ch.address,ch.city||"",ch.state||"");
  const missingServiceTimes=isServiceTimesMissing(ch.serviceTimes);
  const missingDenomination=isDenomMissing(ch.denomination);
  const missingCount=[missingAddress,missingServiceTimes,missingDenomination].filter(Boolean).length;
  return{needsReview:missingCount>=2,missingAddress,missingServiceTimes,missingDenomination};
}

const REVIEW_STATS_CACHE_KEY="churches:review-stats";
async function invalidateReviewStatsCache():Promise<void>{try{await kv.del(REVIEW_STATS_CACHE_KEY);}catch(_){}}

async function computeReviewStats():Promise<{states:Record<string,{total:number;needsReview:number;missingAddress:number;missingServiceTimes:number;missingDenomination:number}>;totalChurches:number;totalNeedsReview:number;percentage:number;missingAddress:number;missingServiceTimes:number;missingDenomination:number}>{
  const meta=await kv.get("churches:meta");const sc:Record<string,number>={...(meta?.stateCounts||{})};
  if(sc["DC"]){sc["MD"]=(sc["MD"]||0)+sc["DC"];delete sc["DC"];}
  const ps=Object.keys(sc).filter(s=>sc[s]>0);
  if(!ps.length)return {states:{},totalChurches:0,totalNeedsReview:0,percentage:0,missingAddress:0,missingServiceTimes:0,missingDenomination:0};
  const states:Record<string,{total:number;needsReview:number;missingAddress:number;missingServiceTimes:number;missingDenomination:number}>={};
  let totalChurches=0,totalNeedsReview=0,missingAddress=0,missingServiceTimes=0,missingDenomination=0;
  const BATCH=10;
  for(let i=0;i<ps.length;i+=BATCH){
    const batch=ps.slice(i,i+BATCH);
    const keys=batch.map(st=>`churches:${st}`);
    const values=await kv.mget(keys);
    for(let j=0;j<batch.length;j++){
      const st=batch[j];
      let ch:any[]=values[j];
      if(!Array.isArray(ch)||!ch.length){states[st]={total:0,needsReview:0,missingAddress:0,missingServiceTimes:0,missingDenomination:0};continue;}
      let need=0,ma=0,ms=0,md=0;
      for(const church of ch){
        const r=churchNeedsReview(church);
        if(r.needsReview)need++;
        if(r.missingAddress)ma++;
        if(r.missingServiceTimes)ms++;
        if(r.missingDenomination)md++;
      }
      states[st]={total:ch.length,needsReview:need,missingAddress:ma,missingServiceTimes:ms,missingDenomination:md};
      totalChurches+=ch.length;totalNeedsReview+=need;missingAddress+=ma;missingServiceTimes+=ms;missingDenomination+=md;
    }
  }
  const percentage=totalChurches>0?Math.round((totalNeedsReview/totalChurches)*1000)/10:0;
  return {states,totalChurches,totalNeedsReview,percentage,missingAddress,missingServiceTimes,missingDenomination};
}

app.get(`${P}/churches/review-stats`,async(c)=>{
  try{
    const cached=await kv.get(REVIEW_STATS_CACHE_KEY);
    if(cached&&typeof cached==="object"&&cached.states&&cached.totalChurches!=null)return c.json(cached);
    const result=await computeReviewStats();
    try{await kv.set(REVIEW_STATS_CACHE_KEY,result);}catch(_){}
    return c.json(result);
  }catch(e){return c.json({states:{},totalChurches:0,totalNeedsReview:0,percentage:0,missingAddress:0,missingServiceTimes:0,missingDenomination:0,error:`${e}`},500);}
});

app.get(`${P}/churches/:state`,async(c)=>{
  try{
    const st=c.req.param("state").toUpperCase(),info=gS(st);
    if(!info)return c.json({error:`Unknown state: ${st}`},400);
    let ch=await kv.get(`churches:${st}`);
    if(!ch||!Array.isArray(ch)||!ch.length)return c.json({churches:[],state:{abbrev:info.a,name:info.n,lat:info.la,lng:info.lo},fromCache:false,message:`No data for ${info.n}. POST /churches/populate/${st} to fetch.`});
    if(st==="MD"){try{const dc=await kv.get("churches:DC");if(Array.isArray(dc)&&dc.length){const ids=new Set(ch.map((c:any)=>c.id));for(const x of dc)if(!ids.has(x.id))ch.push({...x,state:"MD"});}}catch(_){}}
    const corrections=await getApprovedCorrectionsForState(st);
    mergeCorrectionsIntoChurches(ch,corrections);
    const withShort=addShortIdsUnique(ch,st);
    let cal=await kv.get(`calibration:${st}`);
    if(!cal||!cal.medians){cal=await computeCalibrationForState(st,ch);try{await kv.set(`calibration:${st}`,cal);}catch(_){}}
    if(Object.keys(cal.medians||{}).length)applyCalibrationToChurches(withShort,cal);
    await resolveHomeCampus(withShort,st);
    return c.json({churches:withShort,state:{abbrev:info.a,name:info.n,lat:info.la,lng:info.lo},count:withShort.length,fromCache:true});
  }catch(e){return c.json({churches:[],error:`${e}`},500);}
});

app.post(`${P}/churches/populate/:state`,async(c)=>{
  try{
    const st=c.req.param("state").toUpperCase(),info=gS(st);
    if(!info)return c.json({error:`Unknown state: ${st}`},400);
    const force=c.req.query("force")==="true";
    const ex=await kv.get(`churches:${st}`);
    if(!force&&Array.isArray(ex)&&ex.length)return c.json({message:`${info.n} already has ${ex.length} churches.`,count:ex.length,alreadyCached:true});
    console.log(`Populating ${info.n}${force?" (force)":""}...`);
    const ch=await fetchCh(st);const en=enrichARDA(ch);applyStateScaling(ch,st);
    // Preserve community-submitted churches from pending store
    const pending=await kv.get(`pending-churches:${st}`);
    let communityCount=0;
    if(pending&&Array.isArray(pending.churches)){
      const osmIds=new Set(ch.map((x:any)=>x.id));
      const existingShortIds=new Set(ch.map((x:any)=>x.shortId).filter(Boolean));
      for(const pc of pending.churches){
        if(pc.approved&&pc.id?.startsWith("community-")&&!osmIds.has(pc.id)){
          let sid=pc.shortId;
          if(!sid){do{sid=Math.floor(10000000+Math.random()*90000000).toString();}while(existingShortIds.has(sid));}
          existingShortIds.add(sid);
          const churchForMain={id:pc.id,shortId:sid,name:pc.name,address:pc.address||"",city:pc.city||"",state:st,lat:pc.lat,lng:pc.lng,denomination:pc.denomination||"Unknown",attendance:pc.attendance||50,website:pc.website||"",serviceTimes:pc.serviceTimes,languages:pc.languages,ministries:pc.ministries,pastorName:pc.pastorName,phone:pc.phone,email:pc.email,lastVerified:pc.submittedAt||Date.now()};
          ch.push(churchForMain);communityCount++;
        }
      }
    }
    if(force&&Array.isArray(ex)&&ex.length)mergeUserFieldsFromExisting(ex,ch);
    const chWithShort=addShortIdsUnique(ch,st);
    await kv.set(`churches:${st}`,chWithShort);await writeIdx(st,chWithShort);
    void recordChurchAudit({state:st,action:"state_populated",old_value:Array.isArray(ex)?{churchCount:ex.length}:undefined,new_value:{churchCount:ch.length},source:"populate",actor_type:"system"});
    const meta=(await kv.get("churches:meta"))||{stateCounts:{}};meta.stateCounts[st]=ch.length;meta.lastUpdated=new Date().toISOString();await kv.set("churches:meta",meta);
    await invalidateReviewStatsCache();
    return c.json({message:`Populated ${ch.length} churches for ${info.n}`,count:ch.length,communityPreserved:communityCount,state:{abbrev:info.a,name:info.n,lat:info.la,lng:info.lo},ardaEnriched:en});
  }catch(e){console.log(`Populate error:${e}`);return c.json({error:`${e}`},500);}
});

app.get(`${P}/churches/denominations/all`,async(c)=>{
  try{
    const meta=await kv.get("churches:meta");const ps=Object.keys(meta?.stateCounts||{});
    if(!ps.length)return c.json({denominations:[]});
    const dc:Record<string,number>={};
    for(const s of ps){const ch=await kv.get(`churches:${s}`);if(Array.isArray(ch))for(const x of ch){dc[x.denomination||"Unknown"]=(dc[x.denomination||"Unknown"]||0)+1;}}
    return c.json({denominations:Object.entries(dc).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}))});
  }catch(e){return c.json({denominations:[],error:`${e}`},500);}
});

app.post(`${P}/churches/search/rebuild-index`,async(c)=>{
  try{
    const meta=await kv.get("churches:meta");const ps=Object.keys(meta?.stateCounts||{});
    if(!ps.length)return c.json({message:"No states populated.",rebuilt:0});
    let n=0;for(const s of ps){const ch=await kv.get(`churches:${s}`);if(Array.isArray(ch)&&ch.length){await writeIdx(s,ch);n++;}}
    return c.json({message:`Rebuilt indexes for ${n} states`,rebuilt:n});
  }catch(e){return c.json({error:`${e}`},500);}
});

app.post(`${P}/admin/refresh-attendance`,async(c)=>{
  try{
    const stateParam=(c.req.query("state")||"").toUpperCase().trim();
    const meta=await kv.get("churches:meta");const populated=Object.keys(meta?.stateCounts||{});
    if(!populated.length)return c.json({message:"No states populated. Use POST /churches/populate/:state first.",refreshed:0});
    const states=stateParam&&populated.includes(stateParam)?[stateParam]:populated;
    let refreshed=0;
    for(const st of states){
      const info=gS(st);if(!info)continue;
      try{
        const ch=await fetchCh(st);enrichARDA(ch);applyStateScaling(ch,st);
        const existing=await kv.get(`churches:${st}`);
        if(Array.isArray(existing)&&existing.length)mergeUserFieldsFromExisting(existing,ch);
        await kv.set(`churches:${st}`,ch);await writeIdx(st,ch);
        void recordChurchAudit({state:st,action:"state_refreshed",old_value:Array.isArray(existing)?{churchCount:existing.length}:undefined,new_value:{churchCount:ch.length},source:"refresh",actor_type:"system"});
        if(meta){meta.stateCounts[st]=ch.length;meta.lastUpdated=new Date().toISOString();await kv.set("churches:meta",meta);}
        refreshed++;
      }catch(e){console.log(`Refresh ${st} error:${e}`);}
      if(states.length>1)await new Promise(r=>setTimeout(r,500));
    }
    await invalidateReviewStatsCache();
    return c.json({message:`Refreshed attendance for ${refreshed} state(s).`,refreshed});
  }catch(e){return c.json({error:`${e}`},500);}
});

// (Regrid enrichment endpoints removed; attendance is derived from OSM geometry and heuristics only.)

app.get(`${P}/population`,async(c)=>{
  try{
    const cached=await kv.get("state-populations-v1");
    if(cached){const p=typeof cached==="string"?JSON.parse(cached):cached;if(p.populations)return c.json({populations:p.populations,source:"kv-cache"});}
    await kv.set("state-populations-v1",JSON.stringify({populations:POP,fetchedAt:Date.now()}));
    return c.json({populations:POP,source:"census-2023"});
  }catch(e){return c.json({populations:POP,source:"fallback"});}
});

app.post(`${P}/admin/cleanup-dc`,async(c)=>{
  try{
    let d=0;for(const k of["churches:DC","churches:sidx:DC"]){if(await kv.get(k)){await kv.del(k);d++;}}
    const meta=await kv.get("churches:meta");if(meta?.stateCounts?.DC){delete meta.stateCounts.DC;await kv.set("churches:meta",meta);d++;}
    if(d>0){void recordChurchAudit({state:"DC",action:"dc_removed",new_value:{deleted:d},source:"admin_dc_remove",actor_type:"system"});}
    await invalidateReviewStatsCache();
    return c.json({message:`DC cleanup done. ${d} removed.`,deleted:d});
  }catch(e){return c.json({error:`${e}`},500);}
});

app.post(`${P}/admin/cleanup-blocked-denominations`,async(c)=>{
  try{
    const meta=await kv.get("churches:meta");const sc:Record<string,number>={...(meta?.stateCounts||{})};
    const states=Object.keys(sc);
    if(!states.length)return c.json({message:"No states populated.",cleaned:0});
    let cleanedStates=0,removedTotal=0;
    for(const st of states){
      const key=`churches:${st}`;
      const ch=await kv.get(key);
      if(!Array.isArray(ch)||!ch.length)continue;
      const filtered=ch.filter((x:any)=>!isBlockedDenomination(x.denomination));
      const removed=ch.length-filtered.length;
      if(removed>0){
        await kv.set(key,filtered);
        await writeIdx(st,filtered);
        sc[st]=filtered.length;
        removedTotal+=removed;
        cleanedStates++;
        void recordChurchAudit({state:st,action:"cleanup_blocked_denominations",old_value:{churchCount:ch.length},new_value:{churchCount:filtered.length,removed},source:"admin_cleanup",actor_type:"system"});
      }
    }
    if(meta){meta.stateCounts=sc;meta.lastBlockedCleanup=new Date().toISOString();await kv.set("churches:meta",meta);}
    await invalidateReviewStatsCache();
    return c.json({message:`Cleanup complete. Removed ${removedTotal} churches across ${cleanedStates} states.`,removed:removedTotal,states:cleanedStates});
  }catch(e){return c.json({error:`${e}`},500);}
});

app.post(`${P}/admin/remove-churches-by-name`,async(c)=>{
  try{
    const b=await c.req.json().catch(()=>({}));
    const name=typeof b?.name==="string"?b.name.trim():"";
    if(!name)return c.json({error:"Body must include { name: \"Church Name\" }"},400);
    const meta=await kv.get("churches:meta");const sc:Record<string,number>={...(meta?.stateCounts||{})};
    const states=Object.keys(sc);
    let removedMain=0,removedPending=0;
    const norm=(s:string)=>s.trim().toLowerCase();
    const target=norm(name);
    for(const st of states){
      const key=`churches:${st}`;
      const ch=await kv.get(key);
      if(Array.isArray(ch)&&ch.length){
        const filtered=ch.filter((x:any)=>norm((x.name||"").trim())!==target);
        const r=ch.length-filtered.length;
        if(r>0){
          await kv.set(key,filtered);
          await writeIdx(st,filtered);
          sc[st]=filtered.length;
          removedMain+=r;
        }
      }
      const pendingKey=`pending-churches:${st}`;
      const store=await kv.get(pendingKey);
      if(store&&Array.isArray(store.churches)&&store.churches.length){
        const before=store.churches.length;
        store.churches=store.churches.filter((pc:any)=>norm((pc.name||"").trim())!==target);
        const removedP=before-store.churches.length;
        if(removedP>0){await kv.set(pendingKey,store);removedPending+=removedP;}
      }
    }
    if(meta){meta.stateCounts=sc;await kv.set("churches:meta",meta);}
    if(removedMain>0||removedPending>0){void recordChurchAudit({state:"ALL",action:"remove_by_name",new_value:{name,removedMain,removedPending},source:"admin_remove_name",actor_type:"system"});}
    await invalidateReviewStatsCache();
    return c.json({message:`Removed ${removedMain} church(es) from main list and ${removedPending} from pending.`,removedMain,removedPending});
  }catch(e){return c.json({error:`${e}`},500);}
});

// ── Community routes ──
const THR=1;
const ALERT_THR=3;
const ADD_CHURCH_RATE_LIMIT=5;
const ADD_CHURCH_WINDOW_MS=15*60*1000;
const SENSITIVE_FIELDS=["name","website","address","reportClosed"];
const MODERATOR_KEY=Deno.env.get("MODERATOR_KEY")||"";
function cip(c:any):string{return c.req.header("x-forwarded-for")?.split(",")[0]?.trim()||c.req.header("x-real-ip")||"unknown";}
function checkModKey(c:any):boolean{const k=new URL(c.req.url).searchParams.get("key")||c.req.header("x-moderator-key")||"";return!!MODERATOR_KEY&&k===MODERATOR_KEY;}
function getModKey(c:any):string{return new URL(c.req.url).searchParams.get("key")||c.req.header("x-moderator-key")||"";}
function inReviewKVKey(modKey:string):string{let h=0;for(let i=0;i<modKey.length;i++)h=((h<<5)-h+modKey.charCodeAt(i))|0;return`moderate:in-review:${Math.abs(h).toString(36)}`;}
function modKeyHash(modKey:string):string{let h=0;for(let i=0;i<modKey.length;i++)h=((h<<5)-h+modKey.charCodeAt(i))|0;return Math.abs(h).toString(36);}
const IN_REVIEW_GLOBAL_KEY="moderate:in-review:global";
function normalizePhone(s:string):string{
  const digits=(s??"").replace(/\D/g,"");
  if(digits.length===11&&digits[0]==="1")return digits.slice(1);
  if(digits.length<10)return "";
  return digits;
}
const VF=["name","website","address","reportClosed","attendance","denomination","serviceTimes","languages","ministries","pastorName","phone","email","homeCampusId"];
function consensus(subs:any[]){
  const res:Record<string,any>={};
  for(const f of VF){
    const fs=subs.filter((s:any)=>s.field===f);
    const byIp=new Map<string,any>();for(const s of fs){const e=byIp.get(s.ip);if(!e||s.timestamp>e.timestamp)byIp.set(s.ip,s);}
    const u=Array.from(byIp.values()),v=u.length;
    // Build submissions breakdown (value -> count)
    const vc=new Map<string,number>();for(const s of u){const k=f==="attendance"?String(Math.round(parseFloat(s.value)||0)):s.value.trim();vc.set(k,(vc.get(k)||0)+1);}
    const submissions=Array.from(vc.entries()).map(([val,count])=>({value:val,count})).sort((a,b)=>b.count-a.count);
    if(f==="attendance"){const vals=u.map((s:any)=>parseFloat(s.value)).filter((n:number)=>!isNaN(n));const avg=vals.length?Math.round(vals.reduce((a:number,b:number)=>a+b,0)/vals.length):null;res[f]={approved:v>=THR&&avg!==null,value:v>=THR&&avg!==null?String(avg):null,votes:v,needed:THR,submissions};}
    else{let av:string|null=null,mx=0;for(const[val,cnt]of vc){if(cnt>=THR&&cnt>mx){av=u.filter((s:any)=>s.value.trim()===val).sort((a:any,b:any)=>b.timestamp-a.timestamp)[0].value.trim();mx=cnt;}}res[f]={approved:av!==null,value:av,votes:v,needed:THR,submissions};}
  }
  return res;
}

function medianSorted(arr:number[]):number{
  if(!arr.length)return 0;
  const s=[...arr].sort((a,b)=>a-b),m=Math.floor(s.length/2);
  return s.length%2?s[m]:Math.round((s[m-1]+s[m])/2);
}

async function computeCalibrationForState(st:string,churches:any[]):Promise<{medians:Record<string,number>;approvedChurchIds:string[]}>{
  const churchById=new Map<string,any>();for(const c of churches)churchById.set(c.id,c);
  const denomValues:Record<string,number[]>={};
  const approvedChurchIds:string[]=[];
  const all=await kv.getByPrefix(`suggestions:${st}-`);
  if(Array.isArray(all)){
    for(const entry of all){
      if(!entry||!Array.isArray(entry.submissions))continue;
      const id=entry.churchId||"";if(!id)continue;
      const con=consensus(entry.submissions);
      const attData=con.attendance as {approved?:boolean;value?:string}|undefined;
      if(attData?.approved&&attData?.value!=null){
        const v=parseInt(attData.value);if(!isNaN(v)&&v>0){
          approvedChurchIds.push(id);
          const ch=churchById.get(id);const denom=(ch?.denomination||"Unknown").trim()||"Unknown";
          if(!denomValues[denom])denomValues[denom]=[];denomValues[denom].push(v);
        }
      }
    }
  }
  const medians:Record<string,number>={};
  for(const[denom,vals]of Object.entries(denomValues))if(vals.length)medians[denom]=medianSorted(vals);
  return{medians,approvedChurchIds};
}

function applyCalibrationToChurches(churches:any[],cal:{medians:Record<string,number>;approvedChurchIds:string[]}):void{
  const approvedSet=new Set(cal.approvedChurchIds);
  for(const c of churches){
    if(approvedSet.has(c.id))continue;
    const denom=(c.denomination||"Unknown").trim()||"Unknown";
    const med=cal.medians[denom];if(med==null)continue;
    const floor=Math.round(med*0.75);const cap=Math.min(25000,Math.round((c.attendance||10)*1.5));
    const newAtt=Math.max(c.attendance||10,floor);
    c.attendance=Math.min(Math.max(10,Math.round(newAtt)),cap);
  }
}

type ApplyResult={updated:boolean;state?:string;churches?:any[];corrections?:Record<string,any>;previousValues?:Record<string,string>};
type AuditContext={source:string;actorIp?:string;actorModKey?:string};
async function applyApprovedCorrections(churchId:string,con:Record<string,any>,auditContext?:AuditContext):Promise<ApplyResult>{
  const corrections:Record<string,any>={};
  for(const[field,data]of Object.entries(con)){if((data as any).approved&&(data as any).value!==null)corrections[field]=(data as any).value;}
  if(!Object.keys(corrections).length)return {updated:false};
  const parts=churchId.split("-");const st=parts[0]==="community"?parts[1]:parts[0];
  if(!st||st.length!==2)return {updated:false};
  const key=`churches:${st}`;const churches=await kv.get(key);
  if(!Array.isArray(churches))return {updated:false};
  const auditEntries:{field:string;oldVal:unknown;newVal:unknown}[]=[];
  const previousValues:Record<string,string>={};
  let updated=false;let auditChurchName:string|null=null;let auditChurchCityState:string|null=null;
  for(const ch of churches){
    if(ch.id===churchId){
      auditChurchName=ch.name||null;auditChurchCityState=[ch.city,ch.state].filter(Boolean).join(", ")||null;
      for(const[f,v]of Object.entries(corrections)){
        const oldVal=(ch as any)[f];
        const oldValForStorage=f==="address"?[ch.address,ch.city,ch.state].filter(Boolean).join(", "):String(oldVal??"");
        auditEntries.push({field:f,oldVal,newVal:v});
        previousValues[f]=oldValForStorage;
        if(f==="attendance"){ch.attendance=parseInt(v)||ch.attendance;}
        else if(f==="languages"||f==="ministries"){ch[f]=String(v).split(",").map((s:string)=>s.trim()).filter(Boolean);}
        else if(f==="address"){
          const val=String(v).trim();
          if(val.startsWith("{")){
            try{
              const o=JSON.parse(val) as Record<string,unknown>;
              (ch as any).address=String(o.address??"").trim();
              (ch as any).city=String(o.city??"").trim();
              (ch as any).state=String(o.state??"").trim().toUpperCase().slice(0,2);
              const lat=typeof o.lat==="number"&&!isNaN(o.lat)?o.lat:undefined;
              const lng=typeof o.lng==="number"&&!isNaN(o.lng)?o.lng:undefined;
              if(lat!=null&&lng!=null&&lat>=18&&lat<=72&&lng>=-180&&lng<=-65){(ch as any).lat=lat;(ch as any).lng=lng;}
            }catch{ (ch as any).address=val; }
          }else{
            const parts=val.split(",").map((s:string)=>s.trim());
            (ch as any).address=parts[0]??"";
            (ch as any).city=parts[1]??"";
            (ch as any).state=(parts[2]??"").toUpperCase().slice(0,2);
          }
        }
        else if(f==="phone"){(ch as any).phone=normalizePhone(String(v))||undefined;}
        else if(f==="homeCampusId"){(ch as any).homeCampusId=(String(v).trim()||undefined);}
        else{(ch as any)[f]=v;}
      }
      ch.lastVerified=Date.now();updated=true;
      break;
    }
  }
  if(updated){
    await kv.set(key,churches);
    if(auditContext){const opts=auditContext.actorModKey?{hashModKey:auditContext.actorModKey}:auditContext.actorIp?{hashIp:auditContext.actorIp}:undefined;for(const e of auditEntries){await recordChurchAudit({church_id:churchId,church_name:auditChurchName,church_city_state:auditChurchCityState,state:st,action:"field_updated",field:e.field,old_value:e.oldVal,new_value:e.newVal,source:auditContext.source},opts);}}
    await invalidateReviewStatsCache();
    return {updated:true,state:st,churches,corrections,previousValues};
  }
  return {updated:false};
}
async function runDeferredIndexAndStats(st:string,churches:any[],churchId:string,corrections:Record<string,any>):Promise<void>{
  await writeIdx(st,churches);
  try{await kv.del(`calibration:${st}`);}catch(_){}
  const statsKey="community:stats";const stats=(await kv.get(statsKey))||{totalCorrections:0,churchesImproved:[],totalConfirmations:0,corrections:[]};
  const improved=Array.isArray(stats.churchesImproved)?stats.churchesImproved:[];
  if(!improved.includes(churchId))improved.push(churchId);
  stats.churchesImproved=improved;stats.totalCorrections=(stats.totalCorrections||0)+Object.keys(corrections).length;
  const history=Array.isArray(stats.corrections)?stats.corrections:[];
  for(const[f,v]of Object.entries(corrections))history.unshift({churchId,field:f,value:v,appliedAt:Date.now()});
  stats.corrections=history.slice(0,500);stats.lastUpdated=Date.now();
  await kv.set(statsKey,stats);
}

app.post(`${P}/suggestions`,async(c)=>{
  try{
    const ip=cip(c);const{churchId,field,value}=await c.req.json();
    if(!churchId||!field||!value)return c.json({error:"Missing fields"},400);
    if(!VF.includes(field))return c.json({error:"Invalid field"},400);
    if(field==="denomination"&&isBlockedDenomination(String(value)))return c.json({error:"Denomination not supported"},400);
    if(field==="attendance"){const n=parseInt(value);if(isNaN(n)||n<1||n>50000)return c.json({error:"Attendance 1-50000"},400);}
    if(field==="homeCampusId"){const v=String(value).trim();if(!v)return c.json({error:"Main campus ID required"},400);if(!stateFromChurchId(v))return c.json({error:"Invalid church ID format"},400);}
    let storeValue=String(value).trim();
    if(!storeValue)return c.json({error:"Value is required"},400);
    if(field==="reportClosed"){storeValue="closed";}
    if(field==="name"&&storeValue.length<2)return c.json({error:"Church name must be at least 2 characters"},400);
    if(field==="phone"){storeValue=normalizePhone(storeValue);if(!storeValue)return c.json({error:"Invalid phone number"},400);}
    const k=`suggestions:${churchId}`;const ex=(await kv.get(k))||{churchId,submissions:[]};
    // Ensure churchId is stored in the value for getByPrefix lookups
    if(!ex.churchId)ex.churchId=churchId;
    const day=Date.now()-86400000;const r=ex.submissions.find((s:any)=>s.ip===ip&&s.field===field&&s.timestamp>day);
    if(r){r.value=storeValue;r.timestamp=Date.now();}else ex.submissions.push({ip,field,value:storeValue,timestamp:Date.now()});
    await kv.set(k,ex);const con=consensus(ex.submissions);
    const isSensitive=SENSITIVE_FIELDS.includes(field);
    if(isSensitive){
      return c.json({success:true,field,consensus:con[field],allFields:con,applied:false,needsModeration:true});
    }
    const applied=await applyApprovedCorrections(churchId,con,{source:"suggestion",actorIp:ip});
    if(applied.updated&&applied.state&&applied.churches&&applied.corrections){void runDeferredIndexAndStats(applied.state,applied.churches,churchId,applied.corrections).catch(()=>{});}
    return c.json({success:true,field,consensus:con[field],allFields:con,applied:applied.updated});
  }catch(e){return c.json({error:`${e}`},500);}
});

app.get(`${P}/suggestions/approved/:state`,async(c)=>{
  try{
    const st=c.req.param("state").toUpperCase();
    // getByPrefix returns array of values (not {key,value} pairs)
    const all=await kv.getByPrefix(`suggestions:${st}-`);
    const approved:Record<string,Record<string,string>>={};
    if(Array.isArray(all)){
      for(const entry of all){
        // entry IS the value object directly: {churchId, submissions: [...]}
        if(!entry||!Array.isArray(entry.submissions))continue;
        const id=entry.churchId||"";
        if(!id)continue;
        const con=consensus(entry.submissions);
        const corr:Record<string,string>={};
        for(const[f,d]of Object.entries(con)){if((d as any).approved&&(d as any).value!==null)corr[f]=(d as any).value;}
        if(Object.keys(corr).length)approved[id]=corr;
      }
    }
    return c.json({state:st,corrections:approved});
  }catch(e){return c.json({state:c.req.param("state")?.toUpperCase()||"",corrections:{},error:`${e}`},500);}
});

app.get(`${P}/suggestions/pending/:state`,async(c)=>{
  try{
    const st=c.req.param("state").toUpperCase();
    const all=await kv.getByPrefix(`suggestions:${st}-`);
    const pending:Array<{churchId:string;fields:Record<string,{votes:number;needed:number;topValue:string;submissions:{value:string;count:number}[]}>}>=[];
    if(Array.isArray(all)){
      for(const entry of all){
        if(!entry||!Array.isArray(entry.submissions)||!entry.churchId)continue;
        const con=consensus(entry.submissions);
        const pf:Record<string,any>={};
        for(const[f,d]of Object.entries(con)){
          const fd=d as any;
          if(fd.votes>0&&!fd.approved){
            pf[f]={votes:fd.votes,needed:fd.needed,topValue:fd.submissions?.[0]?.value||"",submissions:fd.submissions||[]};
          }
        }
        if(Object.keys(pf).length)pending.push({churchId:entry.churchId,fields:pf});
      }
    }
    return c.json({state:st,pending});
  }catch(e){return c.json({state:c.req.param("state")?.toUpperCase()||"",pending:[],error:`${e}`},500);}
});

app.get(`${P}/suggestions/:churchId`,async(c)=>{
  try{
    const id=c.req.param("churchId");const data=(await kv.get(`suggestions:${id}`))||{submissions:[]};
    const subs=Array.isArray(data.submissions)?data.submissions:[];
    const con=consensus(subs);const ip=cip(c),my:Record<string,string>={};
    for(const s of subs){if(s.ip===ip)my[s.field]=s.value;}
    return c.json({churchId:id,consensus:con,myVotes:my,totalSubmissions:subs.length});
  }catch(e){return c.json({error:`${e}`},500);}
});

// ── Community-managed alerts (create/resolve by voting) ──
const ALERTS_ACTIVE_KEY="alerts:active";
const ALERTS_PROPOSALS_CREATE_KEY="alerts:proposals:create";
const ALERTS_PROPOSALS_RESOLVE_KEY="alerts:proposals:resolve";

const alertsActiveHandler=async(c:any)=>{
  try{
    const raw=await kv.get(ALERTS_ACTIVE_KEY);
    const list=Array.isArray(raw)?raw:[];
    const alerts=list.filter((a:any)=>!a.resolved).map((a:any)=>({id:a.id,shortLabel:a.shortLabel,description:a.description,resolved:!!a.resolved,createdAt:a.createdAt,source:a.source||"community"}));
    return c.json({alerts});
  }catch(e){return c.json({alerts:[],error:String(e)},500);}
};
app.get(`${P}/alerts/active`,alertsActiveHandler);
app.get("/alerts/active",alertsActiveHandler);

const alertsProposalsHandler=async(c:any)=>{
  try{
    const ip=cip(c);
    const createRaw=await kv.get(ALERTS_PROPOSALS_CREATE_KEY);
    const resolveRaw=await kv.get(ALERTS_PROPOSALS_RESOLVE_KEY);
    const createList=Array.isArray(createRaw)?createRaw:[];
    const resolveList=Array.isArray(resolveRaw)?resolveRaw:[];
    const create=createList.map((p:any)=>{
      const votes=Array.isArray(p.votes)?p.votes:[];
      const myVote=votes.some((v:any)=>v.ip===ip);
      return{id:p.id,shortLabel:p.shortLabel,description:p.description,votes:votes.length,needed:ALERT_THR,myVote,createdAt:p.createdAt};
    });
    const resolve=resolveList.map((p:any)=>{
      const votes=Array.isArray(p.votes)?p.votes:[];
      const myVote=votes.some((v:any)=>v.ip===ip);
      return{alertId:p.alertId,votes:votes.length,needed:ALERT_THR,myVote,createdAt:p.createdAt};
    });
    return c.json({create,resolve});
  }catch(e){return c.json({create:[],resolve:[],error:String(e)},500);}
};
app.get(`${P}/alerts/proposals`,alertsProposalsHandler);
app.get("/alerts/proposals",alertsProposalsHandler);

async function promoteCreateProposal(proposal:any,activeList:any[]):Promise<void>{
  const next={id:proposal.id,shortLabel:proposal.shortLabel,description:proposal.description,resolved:false,createdAt:proposal.createdAt||Date.now(),source:"community"};
  activeList.push(next);
  await kv.set(ALERTS_ACTIVE_KEY,activeList);
}

const alertsProposalsCreateHandler=async(c:any)=>{
  try{
    const ip=cip(c);const b=await c.req.json();
    const shortLabel=typeof b?.shortLabel==="string"?b.shortLabel.trim():"";const description=typeof b?.description==="string"?b.description.trim():"";
    if(!shortLabel||shortLabel.length<1)return c.json({error:"shortLabel required"},400);
    const id=crypto.randomUUID();
    const ts=Date.now();
    const createRaw=await kv.get(ALERTS_PROPOSALS_CREATE_KEY);const createList=Array.isArray(createRaw)?createRaw:[];
    const proposal={id,shortLabel,description,votes:[{ip,ts}],createdAt:ts};
    createList.push(proposal);await kv.set(ALERTS_PROPOSALS_CREATE_KEY,createList);
    const activeRaw=await kv.get(ALERTS_ACTIVE_KEY);const activeList=Array.isArray(activeRaw)?activeRaw:[];
    if(proposal.votes.length>=ALERT_THR){createList.pop();await kv.set(ALERTS_PROPOSALS_CREATE_KEY,createList);await promoteCreateProposal(proposal,activeList);}
    const createOut=createList.map((p:any)=>({id:p.id,shortLabel:p.shortLabel,description:p.description,votes:p.votes?.length??0,needed:ALERT_THR,myVote:p.votes?.some((v:any)=>v.ip===ip),createdAt:p.createdAt}));
    return c.json({success:true,proposals:{create:createOut},promoted:proposal.votes.length>=ALERT_THR});
  }catch(e){return c.json({error:String(e)},500);}
};
app.post(`${P}/alerts/proposals/create`,alertsProposalsCreateHandler);
app.post("/alerts/proposals/create",alertsProposalsCreateHandler);

const alertsProposalsVoteHandler=async(c:any)=>{
  try{
    const ip=cip(c);const proposalId=c.req.param("id");
    const createRaw=await kv.get(ALERTS_PROPOSALS_CREATE_KEY);const createList=Array.isArray(createRaw)?createRaw:[];
    const idx=createList.findIndex((p:any)=>p.id===proposalId);if(idx<0)return c.json({error:"Proposal not found"},404);
    const p=createList[idx];if(!Array.isArray(p.votes))p.votes=[];if(p.votes.some((v:any)=>v.ip===ip))return c.json({success:true,alreadyVoted:true});
    p.votes.push({ip,ts:Date.now()});
    const activeRaw=await kv.get(ALERTS_ACTIVE_KEY);let activeList=Array.isArray(activeRaw)?activeRaw:[];
    if(p.votes.length>=ALERT_THR){createList.splice(idx,1);await kv.set(ALERTS_PROPOSALS_CREATE_KEY,createList);await promoteCreateProposal(p,activeList);}
    else{await kv.set(ALERTS_PROPOSALS_CREATE_KEY,createList);}
    const createOut=createList.map((x:any)=>({id:x.id,shortLabel:x.shortLabel,description:x.description,votes:x.votes?.length??0,needed:ALERT_THR,myVote:x.votes?.some((v:any)=>v.ip===ip),createdAt:x.createdAt}));
    const alerts=activeList.filter((a:any)=>!a.resolved).map((a:any)=>({id:a.id,shortLabel:a.shortLabel,description:a.description,resolved:!!a.resolved,createdAt:a.createdAt,source:a.source||"community"}));
    return c.json({success:true,proposals:{create:createOut},alerts,promoted:p.votes.length>=ALERT_THR});
  }catch(e){return c.json({error:String(e)},500);}
};
app.post(`${P}/alerts/proposals/create/:id/vote`,alertsProposalsVoteHandler);
app.post("/alerts/proposals/create/:id/vote",alertsProposalsVoteHandler);

const alertsProposalsResolveHandler=async(c:any)=>{
  try{
    const ip=cip(c);const b=await c.req.json();
    const alertId=typeof b?.alertId==="string"?b.alertId.trim():"";if(!alertId)return c.json({error:"alertId required"},400);
    const ts=Date.now();
    const resolveRaw=await kv.get(ALERTS_PROPOSALS_RESOLVE_KEY);const resolveList=Array.isArray(resolveRaw)?resolveRaw:[];
    let r=resolveList.find((x:any)=>x.alertId===alertId);
    if(!r){r={alertId,votes:[{ip,ts}],createdAt:ts};resolveList.push(r);}else{if(!Array.isArray(r.votes))r.votes=[];if(r.votes.some((v:any)=>v.ip===ip))return c.json({success:true,alreadyVoted:true});r.votes.push({ip,ts});}
    const activeRaw=await kv.get(ALERTS_ACTIVE_KEY);const activeList=Array.isArray(activeRaw)?activeRaw:[];
    if(r.votes.length>=ALERT_THR){const ai=activeList.findIndex((a:any)=>a.id===alertId);if(ai>=0){activeList[ai].resolved=true;}resolveList.splice(resolveList.indexOf(r),1);await kv.set(ALERTS_PROPOSALS_RESOLVE_KEY,resolveList);await kv.set(ALERTS_ACTIVE_KEY,activeList);}
    else{await kv.set(ALERTS_PROPOSALS_RESOLVE_KEY,resolveList);}
    const alerts=activeList.filter((a:any)=>!a.resolved).map((a:any)=>({id:a.id,shortLabel:a.shortLabel,description:a.description,resolved:!!a.resolved,createdAt:a.createdAt,source:a.source||"community"}));
    const resolveOut=resolveList.map((x:any)=>({alertId:x.alertId,votes:x.votes?.length??0,needed:ALERT_THR,myVote:x.votes?.some((v:any)=>v.ip===ip),createdAt:x.createdAt}));
    return c.json({success:true,alerts,proposals:{resolve:resolveOut}});
  }catch(e){return c.json({error:String(e)},500);}
};
app.post(`${P}/alerts/proposals/resolve`,alertsProposalsResolveHandler);
app.post("/alerts/proposals/resolve",alertsProposalsResolveHandler);

app.post(`${P}/churches/add`,async(c)=>{
  try{
    const ip=cip(c);const b=await c.req.json();
    const rlKey=`ratelimit:add-church:${ip}`;
    const raw=await kv.get(rlKey);
    const now=Date.now();
    const data=(!raw||(now-(raw.windowStart||0))>ADD_CHURCH_WINDOW_MS)?{count:1,windowStart:now}:{count:(raw.count||0)+1,windowStart:raw.windowStart||now};
    if(data.count>ADD_CHURCH_RATE_LIMIT)return c.json({error:"Too many church submissions. Please try again later."},429);
    await kv.set(rlKey,data);
    const{name,address:addr,city:ci,state,lat,lng,denomination,attendance,website,serviceTimes,languages,ministries,pastorName,phone,email}=b;
    if(!name||typeof name!=="string"||name.trim().length<2)return c.json({error:"Name required"},400);
    const st=String(state).toUpperCase();if(!gS(st))return c.json({error:"Invalid state"},400);
    const pLat=parseFloat(lat),pLng=parseFloat(lng);
    if(isNaN(pLat)||isNaN(pLng)||pLat<18||pLat>72||pLng<-180||pLng>-65)return c.json({error:"Valid US coords required"},400);
    const att=Math.max(1,Math.min(parseInt(attendance)||50,50000));
    const rawDenom=(denomination??"").trim();
    if(rawDenom&&isBlockedDenomination(rawDenom))return c.json({error:"Denomination not supported"},400);
    const id=`community-${st}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const mainKey=`churches:${st}`;const mainChurches=(await kv.get(mainKey))||[];
    const existingShortIds=new Set((mainChurches as any[]).map((c:any)=>c.shortId||toShortId(c.id,c.state||st)));
    let shortId:string;do{shortId=Math.floor(10000000+Math.random()*90000000).toString();}while(existingShortIds.has(shortId));
    const k=`pending-churches:${st}`;const store=(await kv.get(k))||{churches:[]};
    const dup=store.churches.find((ch:any)=>ch.name.trim().toLowerCase()===name.trim().toLowerCase()&&Math.abs(ch.lat-pLat)<0.001&&Math.abs(ch.lng-pLng)<0.001);
    if(dup){if(!dup.verifications.some((v:any)=>v.ip===ip)){dup.verifications.push({ip,timestamp:Date.now()});if(dup.verifications.length>=THR)dup.approved=true;await kv.set(k,store);}return c.json({success:true,church:dup,isDuplicate:true});}
    const mainDup=Array.isArray(mainChurches)&&(mainChurches as any[]).find((ch:any)=>(ch.name||"").trim().toLowerCase()===name.trim().toLowerCase()&&Math.abs((ch.lat||0)-pLat)<0.001&&Math.abs((ch.lng||0)-pLng)<0.001);
    if(mainDup){return c.json({success:true,isDuplicate:true,existingChurch:{id:mainDup.id,shortId:mainDup.shortId,name:mainDup.name,city:mainDup.city,state:mainDup.state||st}});}
    const nc={id,shortId,name:name.trim(),address:(addr||"").trim(),city:(ci||"").trim(),state:st,lat:pLat,lng:pLng,denomination:(rawDenom||"Unknown"),attendance:att,website:(website||"").trim(),serviceTimes:(serviceTimes||"").trim()||undefined,languages:Array.isArray(languages)&&languages.length?languages:undefined,ministries:Array.isArray(ministries)&&ministries.length?ministries:undefined,pastorName:(pastorName||"").trim()||undefined,phone:normalizePhone(phone||"")||undefined,email:(email||"").trim()||undefined,submittedByIp:ip,submittedAt:Date.now(),approved:true,verifications:[{ip,timestamp:Date.now()}]};
    store.churches.push(nc);await kv.set(k,store);
    const churchForMain={id,shortId,name:nc.name,address:nc.address,city:nc.city,state:st,lat:pLat,lng:pLng,denomination:nc.denomination,attendance:att,website:nc.website,serviceTimes:nc.serviceTimes,languages:nc.languages,ministries:nc.ministries,pastorName:nc.pastorName,phone:nc.phone,email:nc.email,lastVerified:Date.now()};
    if(Array.isArray(mainChurches)){mainChurches.push(churchForMain);await kv.set(mainKey,mainChurches);await writeIdx(st,mainChurches);await invalidateReviewStatsCache();await queueChurch(churchForMain);void recordChurchAudit({church_id:id,church_name:nc.name,church_city_state:[nc.city,st].filter(Boolean).join(", "),state:st,action:"church_added",new_value:{name:nc.name,city:nc.city,state:st,denomination:nc.denomination},source:"community_add"},{hashIp:ip});}
    return c.json({success:true,church:nc});
  }catch(e){return c.json({error:`${e}`},500);}
});

app.get(`${P}/churches/pending/:state`,async(c)=>{
  try{
    const st=c.req.param("state").toUpperCase(),ip=cip(c);
    const store=(await kv.get(`pending-churches:${st}`))||{churches:[]};
    const churches=Array.isArray(store.churches)?store.churches:[];
    return c.json({state:st,churches:churches.map((ch:any)=>({id:ch.id,name:ch.name,address:ch.address,city:ch.city,state:ch.state,lat:ch.lat,lng:ch.lng,denomination:ch.denomination,attendance:ch.attendance,website:ch.website,approved:ch.approved,verificationCount:Array.isArray(ch.verifications)?ch.verifications.length:0,needed:THR,myVerification:Array.isArray(ch.verifications)&&ch.verifications.some((v:any)=>v.ip===ip),submittedAt:ch.submittedAt}))});
  }catch(e){return c.json({state:c.req.param("state")?.toUpperCase()||"",churches:[],error:`${e}`},500);}
});

app.post(`${P}/churches/verify/:pendingId`,async(c)=>{
  try{
    const ip=cip(c),pid=c.req.param("pendingId");
    const parts=pid.split("-");if(parts.length<3||parts[0]!=="community")return c.json({error:"Invalid ID"},400);
    const k=`pending-churches:${parts[1]}`;const store=(await kv.get(k))||{churches:[]};
    const churches=Array.isArray(store.churches)?store.churches:[];
    const ch=churches.find((x:any)=>x.id===pid);if(!ch)return c.json({error:"Not found"},404);
    if(!Array.isArray(ch.verifications))ch.verifications=[];
    if(ch.verifications.some((v:any)=>v.ip===ip))return c.json({success:true,alreadyVerified:true});
    ch.verifications.push({ip,timestamp:Date.now()});if(ch.verifications.length>=THR)ch.approved=true;
    await kv.set(k,store);
    return c.json({success:true,church:{...ch,verificationCount:ch.verifications.length,needed:THR,myVerification:true}});
  }catch(e){return c.json({error:`${e}`},500);}
});

// ── Confirm data & Community stats ──

app.post(`${P}/churches/confirm/:churchId`,async(c)=>{
  try{
    const ip=cip(c);const churchId=c.req.param("churchId");
    const parts=churchId.split("-");const st=parts[0]==="community"?parts[1]:parts[0];
    if(!st||st.length!==2)return c.json({error:"Invalid church ID"},400);
    const confirmKey=`confirms:${churchId}`;const existing=(await kv.get(confirmKey))||{confirmations:[]};
    const day=Date.now()-86400000;
    if(existing.confirmations.find((conf:any)=>conf.ip===ip&&conf.timestamp>day))return c.json({success:true,alreadyConfirmed:true});
    existing.confirmations.push({ip,timestamp:Date.now()});await kv.set(confirmKey,existing);
    const key=`churches:${st}`;const churches=await kv.get(key);
    if(Array.isArray(churches)){const ch=churches.find((x:any)=>x.id===churchId);if(ch){ch.lastVerified=Date.now();await kv.set(key,churches);void recordChurchAudit({church_id:churchId,church_name:ch.name,church_city_state:[ch.city,ch.state].filter(Boolean).join(", "),state:st,action:"church_confirmed",source:"confirm"},{hashIp:ip});}}
    const stats=(await kv.get("community:stats"))||{totalCorrections:0,churchesImproved:[],totalConfirmations:0,corrections:[]};
    stats.totalConfirmations=(stats.totalConfirmations||0)+1;stats.lastUpdated=Date.now();await kv.set("community:stats",stats);
    return c.json({success:true,totalConfirmations:existing.confirmations.length});
  }catch(e){return c.json({error:`${e}`},500);}
});

app.get(`${P}/community/stats`,async(c)=>{
  try{
    const state=(c.req.query("state")||"").toString().toUpperCase();
    const stats=(await kv.get("community:stats"))||{totalCorrections:0,churchesImproved:[],totalConfirmations:0,corrections:[],lastUpdated:null};
    const corrections=Array.isArray(stats.corrections)?stats.corrections:[];
    const improved=Array.isArray(stats.churchesImproved)?stats.churchesImproved:[];
    if(state&&state.length===2){
      const prefix1=state+"-";const prefix2="community-"+state+"-";
      const match=(id: string)=>id.startsWith(prefix1)||id.startsWith(prefix2);
      const stateCorrections=corrections.filter((h: any)=>h&&match(String(h.churchId||"")));
      const stateImproved=improved.filter((id: string)=>match(String(id)));
      return c.json({totalCorrections:stateCorrections.length,churchesImproved:stateImproved.length,totalConfirmations:0,lastUpdated:stats.lastUpdated});
    }
    return c.json({totalCorrections:stats.totalCorrections||0,churchesImproved:improved.length,totalConfirmations:stats.totalConfirmations||0,lastUpdated:stats.lastUpdated});
  }catch(e){return c.json({totalCorrections:0,churchesImproved:0,totalConfirmations:0,error:`${e}`},500);}
});

app.get(`${P}/community/history/:churchId`,async(c)=>{
  try{
    const churchId=c.req.param("churchId");const stats=(await kv.get("community:stats"))||{corrections:[]};
    const history=Array.isArray(stats.corrections)?stats.corrections.filter((h:any)=>h.churchId===churchId):[];
    return c.json({churchId,history});
  }catch(e){return c.json({churchId:c.req.param("churchId"),history:[],error:`${e}`},500);}
});

// ── Moderator endpoints ──
const US_STATES_LIST=["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
const MODERATE_BATCH=10;
function normForCompare(s:string|null|undefined):string{if(s==null)return "";return String(s).trim().replace(/\s+/g," ");}
function valuesMatchForReview(field:string,current:string|null,proposed:string):boolean{
  const a=normForCompare(current);const b=normForCompare(proposed);
  if(!a&&!b)return true;
  if(field==="website")return a.toLowerCase()===b.toLowerCase();
  return a===b;
}
const moderatePendingHandler=async(c:any)=>{
  try{
    if(!checkModKey(c))return c.json({error:"Unauthorized"},401);
    const pendingSuggestions:any[]=[];
    const allSuggestions=await kv.getByPrefix("suggestions:");
    const statesNeeded=new Set<string>();
    if(Array.isArray(allSuggestions)){
      for(const entry of allSuggestions){
        if(!entry||!Array.isArray(entry.submissions)||!entry.churchId)continue;
        const con=consensus(entry.submissions);
        for(const f of SENSITIVE_FIELDS){
          const d=con[f] as any;
          if(d&&d.votes>0&&d.value!==null){
            const parts=entry.churchId.split("-");const st=parts[0]==="community"?parts[1]:parts[0];
            if(st&&st.length===2)statesNeeded.add(st);
          }
        }
      }
    }
    const churchKeys=[...statesNeeded].map(st=>`churches:${st}`);
    const churchesByState=new Map<string,any[]>();
    for(let i=0;i<churchKeys.length;i+=MODERATE_BATCH){
      const batch=churchKeys.slice(i,i+MODERATE_BATCH);
      const values=await kv.mget(batch);
      for(let j=0;j<batch.length;j++){
        const st=batch[j].replace("churches:","");
        if(Array.isArray(values[j]))churchesByState.set(st,values[j]);
      }
    }
    if(Array.isArray(allSuggestions)){
      for(const entry of allSuggestions){
        if(!entry||!Array.isArray(entry.submissions)||!entry.churchId)continue;
        const con=consensus(entry.submissions);
        for(const f of SENSITIVE_FIELDS){
          const d=con[f] as any;
          if(d&&d.votes>0&&d.value!==null){
            const parts=entry.churchId.split("-");const st=parts[0]==="community"?parts[1]:parts[0];
            let currentValue:string|null=null;
            let ch:any=null;
            if(st&&st.length===2){
              const churches=churchesByState.get(st);
              if(Array.isArray(churches)){ch=churches.find((x:any)=>x.id===entry.churchId);if(ch)currentValue=f==="address"?[ch.address,ch.city,ch.state].filter(Boolean).join(", "):String(ch[f]||"");}
            }
            let alreadyApplied=false;
            if(valuesMatchForReview(f,currentValue,d.value)){
              const storedPrev=(entry as any).previousValues?.[f];
              if(storedPrev!=null&&String(storedPrev).trim()!==""){currentValue=String(storedPrev);alreadyApplied=true;}
              else continue;
            }
            pendingSuggestions.push({churchId:entry.churchId,field:f,proposedValue:d.value,currentValue,churchName:ch?.name,churchCity:ch?.city,churchState:ch?.state,churchShortId:ch?.shortId,votes:d.votes,submissions:d.submissions||[],alreadyApplied});
          }
        }
      }
    }
    const pendingChurches:any[]=[];
    for(let i=0;i<US_STATES_LIST.length;i+=MODERATE_BATCH){
      const batch=US_STATES_LIST.slice(i,i+MODERATE_BATCH);
      const pendingKeys=batch.map(st=>`pending-churches:${st}`);
      const pendingValues=await kv.mget(pendingKeys);
      for(let j=0;j<batch.length;j++){
        const store=pendingValues[j];
        const st=batch[j];
        if(!store||!Array.isArray(store.churches))continue;
        for(const ch of store.churches){if(!ch.approved)pendingChurches.push({...ch,state:st});}
      }
    }
    const modKey=getModKey(c);
    const globalRaw=await kv.get(IN_REVIEW_GLOBAL_KEY);
    const globalSugs=Array.isArray(globalRaw?.suggestions)?globalRaw.suggestions:[];
    const globalChs=Array.isArray(globalRaw?.churches)?globalRaw.churches:[];
    const myHash=modKey?modKeyHash(modKey):"";
    const inReviewSuggestions=globalSugs.map((s:any)=>({churchId:s.churchId,field:s.field,byMe:s.modKeyHash===myHash}));
    const inReviewChurches=globalChs.map((c:any)=>({churchId:c.churchId,byMe:c.modKeyHash===myHash}));
    return c.json({pendingSuggestions,pendingChurches,inReviewSuggestions,inReviewChurches});
  }catch(e){return c.json({error:`${e}`},500);}
};
app.get(`${P}/moderate/pending`,moderatePendingHandler);
app.get("/moderate/pending",moderatePendingHandler);

async function removeFromInReviewKV(modKey:string,type:string,churchId:string,field?:string):Promise<void>{
  const key=inReviewKVKey(modKey);
  const raw=await kv.get(key)||{suggestions:[],churches:[]};
  const suggestions=Array.isArray(raw.suggestions)?raw.suggestions:[];
  const churches=Array.isArray(raw.churches)?raw.churches:[];
  const mh=modKeyHash(modKey);
  if(type==="suggestion"&&field!==undefined){
    const next=suggestions.filter((s:any)=>!(s.churchId===churchId&&s.field===field));
    if(next.length!==suggestions.length)await kv.set(key,{suggestions:next,churches});
  }else if(type==="church"){
    const next=churches.filter((id:string)=>id!==churchId);
    if(next.length!==churches.length)await kv.set(key,{suggestions,churches:next});
  }
  const gRaw=(await kv.get(IN_REVIEW_GLOBAL_KEY))||{suggestions:[],churches:[]};
  const gSugs=Array.isArray(gRaw.suggestions)?gRaw.suggestions:[];
  const gChs=Array.isArray(gRaw.churches)?gRaw.churches:[];
  if(type==="suggestion"&&field!==undefined){
    const next=gSugs.filter((s:any)=>!(s.churchId===churchId&&s.field===field&&s.modKeyHash===mh));
    if(next.length!==gSugs.length)await kv.set(IN_REVIEW_GLOBAL_KEY,{suggestions:next,churches:gChs});
  }else if(type==="church"){
    const next=gChs.filter((c:any)=>!(c.churchId===churchId&&c.modKeyHash===mh));
    if(next.length!==gChs.length)await kv.set(IN_REVIEW_GLOBAL_KEY,{suggestions:gSugs,churches:next});
  }
}

const moderateApproveSuggestionHandler=async(c:any)=>{
  try{
    if(!checkModKey(c))return c.json({error:"Unauthorized"},401);
    const{churchId,field,value:editedValue}=await c.req.json();
    if(!churchId||!field)return c.json({error:"Missing churchId or field"},400);
    const k=`suggestions:${churchId}`;const ex=await kv.get(k);
    if(!ex||!Array.isArray(ex.submissions))return c.json({error:"No suggestions found"},404);
    let valueToApply:any;
    if(editedValue!==undefined&&editedValue!==null&&String(editedValue).trim()!==""){
      valueToApply=String(editedValue).trim();
    }else{
      const con=consensus(ex.submissions);
      const d=con[field] as any;
      if(!d||d.value===null)return c.json({error:"No value to approve"},400);
      valueToApply=d.value;
    }
    if(field==="reportClosed"){
      const parts=churchId.split("-");const st=parts[0]==="community"?parts[1]:parts[0];
      if(!st||st.length!==2)return c.json({error:"Invalid church ID"},400);
      let auditChurchName:string|null=null;let auditChurchCityState:string|null=null;
      const mainKey=`churches:${st}`;const mainChurches=await kv.get(mainKey);
      if(Array.isArray(mainChurches)){
        const ch=mainChurches.find((x:any)=>x.id===churchId);
        if(ch){auditChurchName=ch.name||null;auditChurchCityState=[ch.city,ch.state].filter(Boolean).join(", ")||null;}
        const filtered=mainChurches.filter((x:any)=>x.id!==churchId);
        if(filtered.length!==mainChurches.length){
          await kv.set(mainKey,filtered);
          await writeIdx(st,filtered);
          const meta=await kv.get("churches:meta");if(meta){meta.stateCounts=meta.stateCounts||{};meta.stateCounts[st]=filtered.length;meta.lastUpdated=new Date().toISOString();await kv.set("churches:meta",meta);}
        }
      }
      const pendingKey=`pending-churches:${st}`;const store=await kv.get(pendingKey);
      if(store&&Array.isArray(store.churches)&&store.churches.length){
        const pendingCh=store.churches.find((x:any)=>x.id===churchId);
        if(pendingCh&&!auditChurchName){auditChurchName=pendingCh.name||null;auditChurchCityState=[pendingCh.city,pendingCh.state].filter(Boolean).join(", ")||null;}
        const before=store.churches.length;
        store.churches=store.churches.filter((x:any)=>x.id!==churchId);
        if(store.churches.length!==before)await kv.set(pendingKey,store);
      }
      await invalidateReviewStatsCache();
      if(st){void recordChurchAudit({church_id:churchId,church_name:auditChurchName,church_city_state:auditChurchCityState,state:st,action:"church_removed",field:"reportClosed",new_value:valueToApply,source:"moderate_approve"},{hashModKey:getModKey(c)});}
      ex.submissions=ex.submissions.filter((s:any)=>s.field!==field);
      await kv.set(k,ex);
      const modKey=getModKey(c);if(modKey)await removeFromInReviewKV(modKey,"suggestion",churchId,field);
      return c.json({success:true,applied:true,churchId,field,value:valueToApply});
    }
    const singleCon:Record<string,any>={};
    singleCon[field]={approved:true,value:valueToApply,votes:0,needed:THR};
    const applied=await applyApprovedCorrections(churchId,singleCon,{source:"moderate_approve",actorModKey:getModKey(c)});
    if(applied.previousValues){ex.previousValues=ex.previousValues||{};for(const[f,val]of Object.entries(applied.previousValues))ex.previousValues[f]=val;}
    ex.submissions=ex.submissions.filter((s:any)=>s.field!==field);
    await kv.set(k,ex);
    const modKey=getModKey(c);if(modKey)await removeFromInReviewKV(modKey,"suggestion",churchId,field);
    if(applied.updated&&applied.state&&applied.churches&&applied.corrections){void runDeferredIndexAndStats(applied.state,applied.churches,churchId,applied.corrections).catch(()=>{});}
    return c.json({success:true,applied:applied.updated,churchId,field,value:valueToApply});
  }catch(e){return c.json({error:`${e}`},500);}
};
app.post(`${P}/moderate/approve/suggestion`,moderateApproveSuggestionHandler);
app.post("/moderate/approve/suggestion",moderateApproveSuggestionHandler);

const moderateRejectSuggestionHandler=async(c:any)=>{
  try{
    if(!checkModKey(c))return c.json({error:"Unauthorized"},401);
    const{churchId,field}=await c.req.json();
    if(!churchId||!field)return c.json({error:"Missing churchId or field"},400);
    const k=`suggestions:${churchId}`;const ex=await kv.get(k);
    if(!ex||!Array.isArray(ex.submissions))return c.json({error:"No suggestions found"},404);
    const con=consensus(ex.submissions);const rejectedVal=(con[field] as any)?.value;
    ex.submissions=ex.submissions.filter((s:any)=>s.field!==field);
    await kv.set(k,ex);
    const stRej=churchId.split("-")[0]==="community"?churchId.split("-")[1]:churchId.split("-")[0];
    if(stRej&&stRej.length===2){void recordChurchAudit({church_id:churchId,state:stRej,action:"suggestion_rejected",field,new_value:rejectedVal,source:"moderate_reject"},{hashModKey:getModKey(c)});}
    const modKey=getModKey(c);if(modKey)await removeFromInReviewKV(modKey,"suggestion",churchId,field);
    return c.json({success:true,churchId,field,rejected:true});
  }catch(e){return c.json({error:`${e}`},500);}
};
app.post(`${P}/moderate/reject/suggestion`,moderateRejectSuggestionHandler);
app.post("/moderate/reject/suggestion",moderateRejectSuggestionHandler);

const moderateApproveChurchHandler=async(c:any)=>{
  try{
    if(!checkModKey(c))return c.json({error:"Unauthorized"},401);
    const{churchId}=await c.req.json();
    if(!churchId)return c.json({error:"Missing churchId"},400);
    const parts=churchId.split("-");if(parts.length<3||parts[0]!=="community")return c.json({error:"Invalid community church ID"},400);
    const st=parts[1];const k=`pending-churches:${st}`;const store=await kv.get(k);
    if(!store||!Array.isArray(store.churches))return c.json({error:"Not found"},404);
    const ch=store.churches.find((x:any)=>x.id===churchId);
    if(!ch)return c.json({error:"Church not found"},404);
    ch.approved=true;await kv.set(k,store);
    const mainKey=`churches:${st}`;const mainChurches=(await kv.get(mainKey))||[];
    if(Array.isArray(mainChurches)){
      const exists=mainChurches.some((mc:any)=>mc.id===churchId);
      if(!exists){
        mainChurches.push({id:ch.id,shortId:ch.shortId,name:ch.name,address:ch.address,city:ch.city,state:st,lat:ch.lat,lng:ch.lng,denomination:ch.denomination,attendance:ch.attendance,website:ch.website,serviceTimes:ch.serviceTimes,languages:ch.languages,ministries:ch.ministries,pastorName:ch.pastorName,phone:ch.phone,email:ch.email,lastVerified:Date.now()});
        await kv.set(mainKey,mainChurches);await writeIdx(st,mainChurches);
        void recordChurchAudit({church_id:churchId,church_name:ch.name,church_city_state:[ch.city,ch.state].filter(Boolean).join(", "),state:st,action:"church_approved",new_value:{name:ch.name,city:ch.city,state:st},source:"moderate_approve"},{hashModKey:getModKey(c)});
      }
    }
    const modKey=getModKey(c);if(modKey)await removeFromInReviewKV(modKey,"church",churchId);
    return c.json({success:true,churchId,approved:true});
  }catch(e){return c.json({error:`${e}`},500);}
};
app.post(`${P}/moderate/approve/church`,moderateApproveChurchHandler);
app.post("/moderate/approve/church",moderateApproveChurchHandler);

const moderateRejectChurchHandler=async(c:any)=>{
  try{
    if(!checkModKey(c))return c.json({error:"Unauthorized"},401);
    const{churchId}=await c.req.json();
    if(!churchId)return c.json({error:"Missing churchId"},400);
    const parts=churchId.split("-");if(parts.length<3||parts[0]!=="community")return c.json({error:"Invalid community church ID"},400);
    const st=parts[1];const k=`pending-churches:${st}`;const store=await kv.get(k);
    if(!store||!Array.isArray(store.churches))return c.json({error:"Not found"},404);
    store.churches=store.churches.filter((x:any)=>x.id!==churchId);
    await kv.set(k,store);
    void recordChurchAudit({church_id:churchId,state:st,action:"church_rejected",source:"moderate_reject"},{hashModKey:getModKey(c)});
    const modKey=getModKey(c);if(modKey)await removeFromInReviewKV(modKey,"church",churchId);
    return c.json({success:true,churchId,rejected:true});
  }catch(e){return c.json({error:`${e}`},500);}
};
app.post(`${P}/moderate/reject/church`,moderateRejectChurchHandler);

const moderateInReviewAddHandler=async(c:any)=>{
  try{
    if(!checkModKey(c))return c.json({error:"Unauthorized"},401);
    const modKey=getModKey(c);if(!modKey)return c.json({error:"Unauthorized"},401);
    const body=await c.req.json().catch(()=>({}));
    const{type,churchId,field}=body;
    if(!type||!churchId)return c.json({error:"Missing type or churchId"},400);
    if(type!=="suggestion"&&type!=="church")return c.json({error:"Invalid type"},400);
    if(type==="suggestion"&&field===undefined)return c.json({error:"Missing field for suggestion"},400);
    const key=inReviewKVKey(modKey);
    const raw=(await kv.get(key))||{suggestions:[],churches:[]};
    const suggestions=Array.isArray(raw.suggestions)?[...raw.suggestions]:[];
    const churches=Array.isArray(raw.churches)?[...raw.churches]:[];
    const mh=modKeyHash(modKey);
    if(type==="suggestion"){
      const exists=suggestions.some((s:any)=>s.churchId===churchId&&s.field===field);
      if(!exists)suggestions.push({churchId,field});
    }else{
      if(!churches.includes(churchId))churches.push(churchId);
    }
    await kv.set(key,{suggestions,churches});
    const gRaw=(await kv.get(IN_REVIEW_GLOBAL_KEY))||{suggestions:[],churches:[]};
    const gSugs=Array.isArray(gRaw.suggestions)?[...gRaw.suggestions]:[];
    const gChs=Array.isArray(gRaw.churches)?[...gRaw.churches]:[];
    if(type==="suggestion"){
      if(!gSugs.some((s:any)=>s.churchId===churchId&&s.field===field))gSugs.push({churchId,field,modKeyHash:mh});
    }else{
      if(!gChs.some((c:any)=>c.churchId===churchId))gChs.push({churchId,modKeyHash:mh});
    }
    await kv.set(IN_REVIEW_GLOBAL_KEY,{suggestions:gSugs,churches:gChs});
    return c.json({success:true});
  }catch(e){return c.json({error:`${e}`},500);}
};

const moderateInReviewRemoveHandler=async(c:any)=>{
  try{
    if(!checkModKey(c))return c.json({error:"Unauthorized"},401);
    const modKey=getModKey(c);if(!modKey)return c.json({error:"Unauthorized"},401);
    const body=await c.req.json().catch(()=>({}));
    const{type,churchId,field}=body;
    if(!type||!churchId)return c.json({error:"Missing type or churchId"},400);
    if(type==="suggestion"&&field===undefined)return c.json({error:"Missing field for suggestion"},400);
    await removeFromInReviewKV(modKey,type,churchId,field);
    return c.json({success:true});
  }catch(e){return c.json({error:`${e}`},500);}
};

app.post(`${P}/moderate/in-review/add`,moderateInReviewAddHandler);
app.post("/moderate/in-review/add",moderateInReviewAddHandler);
app.post(`${P}/moderate/in-review/remove`,moderateInReviewRemoveHandler);
app.post("/moderate/in-review/remove",moderateInReviewRemoveHandler);
app.post("/moderate/reject/church",moderateRejectChurchHandler);

// ── Audit log (moderator-only) ──
app.get(`${P}/audit/recent`,async(c)=>{
  try{
    if(!checkModKey(c))return c.json({error:"Unauthorized"},401);
    const limit=Math.min(500,Math.max(1,parseInt(c.req.query("limit")||"200")||200));
    const entries=await queryAuditRecent(limit);
    return c.json({entries});
  }catch(e){return c.json({error:`${e}`},500);}
});
app.get(`${P}/audit/state/:state`,async(c)=>{
  try{
    if(!checkModKey(c))return c.json({error:"Unauthorized"},401);
    const st=(c.req.param("state")||"").toUpperCase();if(!st||st.length!==2)return c.json({error:"Invalid state"},400);
    const limit=Math.min(500,Math.max(1,parseInt(c.req.query("limit")||"200")||200));
    const entries=await queryAuditByState(st,limit);
    return c.json({state:st,entries});
  }catch(e){return c.json({error:`${e}`},500);}
});
app.get(`${P}/audit/church/:churchId`,async(c)=>{
  try{
    if(!checkModKey(c))return c.json({error:"Unauthorized"},401);
    const churchId=c.req.param("churchId");if(!churchId)return c.json({error:"Missing churchId"},400);
    const limit=Math.min(500,Math.max(1,parseInt(c.req.query("limit")||"100")||100));
    const entries=await queryAuditByChurch(churchId,limit);
    return c.json({churchId,entries});
  }catch(e){return c.json({error:`${e}`},500);}
});

// ── Church reactions (Netflix-style thumbs) ──
const REACTIONS = ["not_for_me", "like", "love"] as const;
function reactionCounts(reactions: { reaction: string }[]) {
  const counts = { not_for_me: 0, like: 0, love: 0 };
  for (const r of reactions) {
    if (REACTIONS.includes(r.reaction as any)) (counts as any)[r.reaction]++;
  }
  return counts;
}

app.get(`${P}/churches/reactions/:churchId`, async (c) => {
  try {
    const churchId = c.req.param("churchId");
    const ip = cip(c);
    const key = `reactions:${churchId}`;
    const store = (await kv.get(key)) || { reactions: [] };
    const reactions = Array.isArray(store.reactions) ? store.reactions : [];
    const myEntry = reactions.find((x: any) => x.ip === ip);
    const myReaction = myEntry ? myEntry.reaction : null;
    return c.json({ churchId, myReaction, counts: reactionCounts(reactions) });
  } catch (e) {
    return c.json({ churchId: c.req.param("churchId"), myReaction: null, counts: { not_for_me: 0, like: 0, love: 0 }, error: `${e}` }, 500);
  }
});

app.post(`${P}/churches/react/:churchId`, async (c) => {
  try {
    const churchId = c.req.param("churchId");
    const ip = cip(c);
    const body = await c.req.json().catch(() => ({}));
    const reaction = body.reaction;
    if (!reaction || !REACTIONS.includes(reaction)) {
      return c.json({ error: "Invalid reaction; use not_for_me, like, or love" }, 400);
    }
    const key = `reactions:${churchId}`;
    const store = (await kv.get(key)) || { reactions: [] };
    const reactions = Array.isArray(store.reactions) ? store.reactions : [];
    const existing = reactions.find((x: any) => x.ip === ip);
    const isToggleOff = existing && existing.reaction === reaction;
    const withoutMe = reactions.filter((x: any) => x.ip !== ip);
    if (!isToggleOff) {
      withoutMe.push({ ip, reaction, timestamp: Date.now() });
    }
    store.reactions = withoutMe;
    await kv.set(key, store);
    return c.json({ success: true, myReaction: isToggleOff ? null : reaction, counts: reactionCounts(withoutMe) });
  } catch (e) {
    return c.json({ error: `${e}` }, 500);
  }
});

app.get(`${P}/churches/reactions/bulk`, async (c) => {
  try {
    const st = c.req.query("state")?.toUpperCase();
    if (!st || st.length !== 2) return c.json({ error: "Missing or invalid state" }, 400);
    const churches = await kv.get(`churches:${st}`);
    if (!Array.isArray(churches) || churches.length === 0) return c.json({ state: st, counts: {} });
    const keys = churches.map((ch: any) => `reactions:${ch.id}`);
    const BATCH = 200;
    const counts: Record<string, { not_for_me: number; like: number; love: number }> = {};
    for (let i = 0; i < keys.length; i += BATCH) {
      const chunk = keys.slice(i, i + BATCH);
      const values = await kv.mget(chunk);
      for (let j = 0; j < chunk.length; j++) {
        const churchId = chunk[j].replace(/^reactions:/, "");
        const store = values[j];
        const reactions = store?.reactions && Array.isArray(store.reactions) ? store.reactions : [];
        counts[churchId] = reactionCounts(reactions);
      }
    }
    return c.json({ state: st, counts });
  } catch (e) {
    return c.json({ state: c.req.query("state") ?? "", counts: {}, error: `${e}` }, 500);
  }
});

// ── Twitter / X automated posting v2 ──
const TWITTER_URL="https://api.twitter.com/2/tweets";
const DAILY_TWEET_CAP=3;
// National milestones used for \"we reached X churches\" tweets.
// Includes early milestones plus higher ones for future growth.
const NATIONAL_MILESTONES=[500,1000,2500,5000,10000,25000,50000,100000,250000,500000];
const STATE_MILESTONES=[100,250,500,1000,2500];
const COMMUNITY_MILESTONES=[100,500,1000,2500,5000];

function percentEncode(s:string):string{return encodeURIComponent(s).replace(/[!'()*]/g,c=>"%"+c.charCodeAt(0).toString(16).toUpperCase());}

async function hmacSha1(key:Uint8Array,data:string):Promise<string>{
  const ck=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-1"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",ck,new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function oauthHeader(method:string,url:string,body:Record<string,string>={}):Promise<string>{
  const apiKey=Deno.env.get("TWITTER_API_KEY")||"";
  const apiSecret=Deno.env.get("TWITTER_API_SECRET")||"";
  const token=Deno.env.get("TWITTER_ACCESS_TOKEN")||"";
  const tokenSecret=Deno.env.get("TWITTER_ACCESS_TOKEN_SECRET")||"";
  if(!apiKey||!apiSecret||!token||!tokenSecret)throw new Error("Twitter credentials not configured");
  const ts=Math.floor(Date.now()/1000).toString();
  const nonce=crypto.randomUUID().replace(/-/g,"");
  const params:Record<string,string>={
    oauth_consumer_key:apiKey,oauth_nonce:nonce,oauth_signature_method:"HMAC-SHA1",
    oauth_timestamp:ts,oauth_token:token,oauth_version:"1.0",...body
  };
  const sorted=Object.keys(params).sort().map(k=>`${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const base=`${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(sorted)}`;
  const sigKey=new TextEncoder().encode(`${percentEncode(apiSecret)}&${percentEncode(tokenSecret)}`);
  const sig=await hmacSha1(sigKey,base);
  return `OAuth oauth_consumer_key="${percentEncode(apiKey)}",oauth_nonce="${percentEncode(nonce)}",oauth_signature="${percentEncode(sig)}",oauth_signature_method="HMAC-SHA1",oauth_timestamp="${ts}",oauth_token="${percentEncode(token)}",oauth_version="1.0"`;
}

async function postTweet(text:string):Promise<{success:boolean;tweetId?:string;error?:string}>{
  try{
    const auth=await oauthHeader("POST",TWITTER_URL);
    const res=await fetch(TWITTER_URL,{method:"POST",headers:{"Authorization":auth,"Content-Type":"application/json"},body:JSON.stringify({text})});
    if(!res.ok){const e=await res.text();return{success:false,error:`${res.status}: ${e}`};}
    const data=await res.json();return{success:true,tweetId:data?.data?.id};
  }catch(e){return{success:false,error:`${e}`};}
}

function hashCode(s:string):number{let h=0;for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}return h;}

function pickTemplate<T>(templates:T[],seed:string):T{return templates[Math.abs(hashCode(seed))%templates.length];}

// Queue a church for future tweeting (1/day max)
async function queueChurch(ch:any):Promise<void>{
  try{
    if(!Deno.env.get("TWITTER_API_KEY"))return;
    const queue:any[]=(await kv.get("twitter:church-queue"))||[];
    // Dedup by church id
    if(queue.some((q:any)=>q.id===ch.id))return;
    queue.push({id:ch.id,shortId:ch.shortId,name:ch.name,city:ch.city,state:ch.state,denomination:ch.denomination,queuedAt:Date.now()});
    // Keep queue manageable
    if(queue.length>100)queue.splice(0,queue.length-100);
    await kv.set("twitter:church-queue",queue);
  }catch(_){}
}

// Queue a deploy message for next scheduled slot
async function queueDeploy(msg:string):Promise<void>{
  try{
    if(!Deno.env.get("TWITTER_API_KEY"))return;
    const queue:any[]=(await kv.get("twitter:deploy-queue"))||[];
    queue.push({message:msg,queuedAt:Date.now()});
    if(queue.length>20)queue.splice(0,queue.length-20);
    await kv.set("twitter:deploy-queue",queue);
  }catch(_){}
}

// ── Tweet text builders ──

function churchTweet(ch:any):string{
  const templates=[
    (n:string,c:string,s:string,u:string)=>`Here's ${n} in ${c}, ${s} — just added to the map! ${u}`,
    (n:string,c:string,s:string,u:string)=>`Here's a new one: ${n} in ${c}, ${s} is now on the map. ${u}`,
    (n:string,c:string,s:string,u:string)=>`Here's another church mapped: ${n} in ${c}, ${s}. ${u}`,
    (n:string,c:string,s:string,u:string)=>`Here's ${n} — ${c}, ${s} now represented on the map! ${u}`,
    (n:string,c:string,s:string,u:string)=>`Here's your newest addition: ${n} in ${c}, ${s}. ${u}`,
  ];
  const st=(ch.state||"").toUpperCase();
  const sid=(ch.shortId&&/^\d{8}$/.test(ch.shortId))?ch.shortId:toShortId(ch.id||"",ch.state||"",ch.shortId);
  const url=`heresmychurch.com/state/${st.toLowerCase()}/${sid}`;
  const name=(ch.name||"A church").slice(0,80);
  const city=(ch.city||"").slice(0,40)||"a city";
  return pickTemplate(templates,ch.id||name)(name,city,st,url).slice(0,280);
}

const MAX_DEPLOY_TWEET_LEN = 89;
const DEPLOY_TWEET_FALLBACK = "We shipped a small update to the map.";

/** Words that mean the commit is internal/dev-only — don't tweet that. */
const DEV_JARGON = /\b(refactor|api\s+endpoint|endpoints|maintainability|readability|cors|typescript|eslint|dependencies|middleware|webhook|auth\s+token|env\s+var)\b/i;

/** Turn commit message into one specific, layman tweet about the actual improvement. Not random. */
function deployTweet(msg?: string): string {
  const raw = (msg || "").replace(/\n/g, " ").trim();
  if (!raw) return DEPLOY_TWEET_FALLBACK.slice(0, MAX_DEPLOY_TWEET_LEN);

  // Explicit tweet text: use "tweet: Your exact phrase" in the commit message
  const tweetMatch = raw.match(/\btweet:\s*(.+)/i);
  if (tweetMatch) {
    const exact = tweetMatch[1].replace(/\n/g, " ").trim();
    if (exact.length >= 15) return exact.slice(0, MAX_DEPLOY_TWEET_LEN);
  }

  // Humanize conventional commit into one sentence (feat/fix → We added / We fixed)
  const noPrefix = raw.replace(/^(feat|fix|chore|refactor|docs|style)(\([^)]*\))?:\s*/i, "").trim();
  const rest = noPrefix.slice(0, 80);
  if (!rest) return DEPLOY_TWEET_FALLBACK.slice(0, MAX_DEPLOY_TWEET_LEN);

  const lead = rest.charAt(0).toLowerCase() + rest.slice(1);
  let out: string;
  if (/^feat/i.test(raw)) out = "We added " + lead;
  else if (/^fix/i.test(raw)) out = "We fixed " + lead;
  else if (/^chore|^docs|^style|^refactor/i.test(raw)) out = "We updated " + lead;
  else out = "We updated " + lead;

  out = out.replace(/^(We added) add /i, "$1 ").replace(/^(We fixed) fix(ed)? /i, "$1 ").replace(/^(We updated) update(d)? /i, "$1 ");
  if (!out.endsWith(".") && !out.endsWith("!")) out += ".";

  // If it still sounds like internal dev notes, use the generic line instead
  if (DEV_JARGON.test(out)) return DEPLOY_TWEET_FALLBACK.slice(0, MAX_DEPLOY_TWEET_LEN);
  return out.slice(0, MAX_DEPLOY_TWEET_LEN);
}

function nationalMilestoneTweet(total:number,milestone:number):string{
  const templates=[
    (t:number)=>`Here's a milestone: ${t.toLocaleString()} churches mapped across America! Every church added helps someone find their community.`,
    (t:number)=>`Here's something to celebrate: ${t.toLocaleString()} churches now on the map across the U.S.!`,
    (t:number)=>`Here's how far we've come: ${t.toLocaleString()} churches mapped so far. Thanks to everyone adding their church!`,
  ];
  // Seed by the milestone we just crossed so copy is stable for that threshold.
  return pickTemplate(templates,`national-${milestone}`)(total).slice(0,280);
}

function stateMilestoneTweet(st:string,stateName:string,count:number):string{
  const templates=[
    (sn:string,c:number)=>`Here's a milestone for ${sn}: ${c.toLocaleString()} churches now on the map!`,
    (sn:string,c:number)=>`Here's some news from ${sn}: we just hit ${c.toLocaleString()} churches mapped!`,
    (sn:string,c:number)=>`Here's ${sn} growing: ${c.toLocaleString()} churches and counting!`,
  ];
  return pickTemplate(templates,`state-${st}-${count}`)(stateName,count).slice(0,280);
}

function accuracyMilestoneTweet(stateName:string,pct:number):string{
  const templates=[
    (sn:string,p:number)=>`Here's progress: ${p}% of churches in ${sn} now have complete info. The community keeps making the data better!`,
    (sn:string,p:number)=>`Here's the community at work: ${sn} churches are ${p}% complete with accurate data!`,
    (sn:string,p:number)=>`Here's a win for data quality: ${p}% of ${sn}'s churches now have full details!`,
  ];
  return pickTemplate(templates,`acc-${stateName}-${pct}`)(stateName,pct).slice(0,280);
}

function communityMilestoneTweet(corrections:number):string{
  const templates=[
    (c:number)=>`Here's the community at work: ${c.toLocaleString()} corrections made to church data so far! Every fix makes the map more useful.`,
    (c:number)=>`Here's a milestone: our community has made ${c.toLocaleString()} data corrections. That's real people making real improvements!`,
  ];
  return pickTemplate(templates,`community-${corrections}`)(corrections).slice(0,280);
}

// ── Fun facts generator ──

async function generateFunFact():Promise<{text:string;category:string}|null>{
  try{
    const meta=await kv.get("churches:meta");
    const sc:Record<string,number>=meta?.stateCounts||{};
    const total=Object.values(sc).reduce((a:number,b:number)=>a+b,0);
    if(total<50)return null;

    const stats=(await kv.get("community:stats"))||{totalCorrections:0,churchesImproved:[],totalConfirmations:0};
    const pop=await kv.get("state-populations-v1");

    // Collect all possible facts
    const facts:{text:string;category:string;id:string}[]=[];
    const stateEntries=Object.entries(sc).filter(([a,c])=>a!=="DC"&&c>10);
    const stateInfo=(abbr:string)=>US.find(s=>s.a===abbr);

    // Category 1: State coverage with population
    if(pop&&stateEntries.length>0){
      const randomStates=stateEntries.sort(()=>Math.random()-0.5).slice(0,5);
      for(const[st,count]of randomStates){
        const si=stateInfo(st);const p=pop[st];
        if(si&&p&&p>0){
          const ratio=Math.round(p/count);
          facts.push({text:`Here's a look at ${si.n}: ${count.toLocaleString()} churches mapped — that's about 1 church for every ${ratio.toLocaleString()} people.`,category:"coverage",id:`cov-${st}`});
        }
      }
    }

    // Category 2: State comparisons (top/bottom)
    if(stateEntries.length>=5){
      const sorted=[...stateEntries].sort((a,b)=>b[1]-a[1]);
      const top3=sorted.slice(0,3).map(([st,c])=>`${stateInfo(st)?.n||st} (${c.toLocaleString()})`).join(", ");
      facts.push({text:`Here's the top 3 states by churches mapped: ${top3}.`,category:"comparison",id:"top3"});
      const bottom3=sorted.slice(-3).reverse().map(([st,c])=>`${stateInfo(st)?.n||st} (${c.toLocaleString()})`).join(", ");
      facts.push({text:`Here's where we need the most help: ${bottom3} have the fewest churches mapped. Know a church there? Add it!`,category:"comparison",id:"bottom3"});
    }

    // Category 3: Denomination breakdown (pick a random populated state)
    if(stateEntries.length>0){
      const[randomSt]=stateEntries[Math.floor(Math.random()*stateEntries.length)];
      const churches=await kv.get(`churches:${randomSt}`);
      if(Array.isArray(churches)&&churches.length>20){
        const denomCounts:Record<string,number>={};
        for(const ch of churches){const d=(ch.denomination||"Unknown").trim();denomCounts[d]=(denomCounts[d]||0)+1;}
        const sortedDenoms=Object.entries(denomCounts).filter(([d])=>d!=="Unknown").sort((a,b)=>b[1]-a[1]);
        if(sortedDenoms.length>0){
          const[topDenom,topCount]=sortedDenoms[0];
          const pct=Math.round((topCount/churches.length)*100);
          const si=stateInfo(randomSt);
          facts.push({text:`Here's a fun fact: ${topDenom} churches make up ${pct}% of all churches mapped in ${si?.n||randomSt}.`,category:"denomination",id:`denom-${randomSt}`});
        }
      }
    }

    // Category 4: National denomination stats
    {
      const allDenoms:Record<string,number>={};
      // Sample up to 10 states for performance
      const sample=stateEntries.sort(()=>Math.random()-0.5).slice(0,10);
      const keys=sample.map(([st])=>`churches:${st}`);
      const vals=await kv.mget(keys);
      for(const churches of vals){
        if(!Array.isArray(churches))continue;
        for(const ch of churches){const d=(ch.denomination||"Unknown").trim();allDenoms[d]=(allDenoms[d]||0)+1;}
      }
      const sortedAll=Object.entries(allDenoms).filter(([d])=>d!=="Unknown").sort((a,b)=>b[1]-a[1]);
      if(sortedAll.length>=3){
        const totalSampled=Object.values(allDenoms).reduce((a,b)=>a+b,0);
        const[topD,topC]=sortedAll[0];
        const topPct=Math.round((topC/totalSampled)*100);
        facts.push({text:`Here's a fun fact: ${topD} is the most common denomination on the map, making up about ${topPct}% of churches.`,category:"denomination",id:`denom-national-${topD}`});
      }
    }

    // Category 5: Community contributions
    if(stats.totalCorrections>0){
      const improved=Array.isArray(stats.churchesImproved)?stats.churchesImproved.length:0;
      facts.push({text:`Here's something cool: The community has made ${stats.totalCorrections.toLocaleString()} corrections to church data, improving ${improved.toLocaleString()} churches so far.`,category:"community",id:`comm-${stats.totalCorrections}`});
    }

    // Category 6: Total churches nationally (exclude DC so we never say "51 states")
    const stateCountForCopy=stateEntries.filter(([a])=>a!=="DC").length;
    facts.push({text:`Here's where we stand: ${total.toLocaleString()} churches mapped across ${stateCountForCopy} states. Every church added helps someone find their community.`,category:"total",id:`total-${total}`});

    // Category 7: Attendance patterns (sample a state)
    if(stateEntries.length>0){
      const[randomSt]=stateEntries[Math.floor(Math.random()*stateEntries.length)];
      const churches=await kv.get(`churches:${randomSt}`);
      if(Array.isArray(churches)&&churches.length>20){
        const atts=churches.map((ch:any)=>ch.attendance||0).filter((a:number)=>a>0);
        if(atts.length>10){
          const avg=Math.round(atts.reduce((a:number,b:number)=>a+b,0)/atts.length);
          const si=stateInfo(randomSt);
          facts.push({text:`Here's an interesting find: The average church in ${si?.n||randomSt} on our map has about ${avg.toLocaleString()} people attending.`,category:"attendance",id:`att-${randomSt}`});
        }
      }
    }

    if(!facts.length)return null;

    // Avoid repeating recent fun facts
    const history:string[]=(await kv.get("twitter:funfact-history"))||[];
    const available=facts.filter(f=>!history.includes(f.id));
    const pick=available.length>0?available[Math.floor(Math.random()*available.length)]:facts[Math.floor(Math.random()*facts.length)];

    // Update history
    history.unshift(pick.id);
    await kv.set("twitter:funfact-history",history.slice(0,50));

    return{text:pick.text.slice(0,280),category:pick.category};
  }catch(_){return null;}
}

// ── Milestone detection ──

async function checkMilestones():Promise<{text:string;id:string}|null>{
  try{
    const reached:any=(await kv.get("twitter:milestones"))||{national:[],states:{},accuracy:{},community:[]};
    // Normalize old format (was just an array)
    if(Array.isArray(reached)){
      const old=reached as number[];
      const normalized={national:old,states:{} as Record<string,number[]>,accuracy:{} as Record<string,number[]>,community:[] as number[]};
      await kv.set("twitter:milestones",normalized);
      return checkMilestonesInner(normalized);
    }
    return checkMilestonesInner(reached);
  }catch(_){return null;}
}

async function checkMilestonesInner(reached:{national:number[];states:Record<string,number[]>;accuracy:Record<string,number[]>;community:number[]}):Promise<{text:string;id:string}|null>{
  const meta=await kv.get("churches:meta");
  const sc:Record<string,number>=meta?.stateCounts||{};

  // National milestones — pre-seed already-passed ones, only tweet the newest crossing
  const total=Object.values(sc).reduce((a:number,b:number)=>a+b,0);
  let nationalDirty=false;
  let latestNational:{m:number;next:number}|null=null;
  for(const m of NATIONAL_MILESTONES){
    if(total>=m&&!reached.national.includes(m)){
      reached.national.push(m);nationalDirty=true;
      const next=NATIONAL_MILESTONES.find(x=>x>m)||m*2;
      latestNational={m,next};
    }
  }
  if(nationalDirty)await kv.set("twitter:milestones",reached);
  if(latestNational){
    return{text:nationalMilestoneTweet(total,latestNational.m),id:`national-${latestNational.m}`};
  }

  // State milestones — pre-seed passed ones, only tweet the newest per state
  let stateDirty=false;
  let latestState:{st:string;name:string;count:number;m:number}|null=null;
  for(const[st,count]of Object.entries(sc)){
    const si=US.find(s=>s.a===st);
    if(!si)continue;
    if(!reached.states[st])reached.states[st]=[];
    for(const m of STATE_MILESTONES){
      if(count>=m&&!reached.states[st].includes(m)){
        reached.states[st].push(m);stateDirty=true;
        latestState={st,name:si.n,count,m};
      }
    }
  }
  if(stateDirty)await kv.set("twitter:milestones",reached);
  if(latestState){
    return{text:stateMilestoneTweet(latestState.st,latestState.name,latestState.count),id:`state-${latestState.st}-${latestState.m}`};
  }

  // Accuracy milestones (check a few random states)
  const populated=Object.entries(sc).filter(([_,c])=>c>50);
  const sample=populated.sort(()=>Math.random()-0.5).slice(0,5);
  for(const[st]of sample){
    const churches=await kv.get(`churches:${st}`);
    if(!Array.isArray(churches)||churches.length<50)continue;
    let needsReview=0;
    for(const ch of churches){const r=churchNeedsReview(ch);if(r.needsReview)needsReview++;}
    const completePct=Math.round(((churches.length-needsReview)/churches.length)*100);
    const si=US.find(s=>s.a===st);
    if(!si)continue;
    const accThresholds=[80,90,95];
    const stReached=reached.accuracy[st]||[];
    for(const t of accThresholds){
      if(completePct>=t&&!stReached.includes(t)){
        if(!reached.accuracy[st])reached.accuracy[st]=[];
        reached.accuracy[st].push(t);
        await kv.set("twitter:milestones",reached);
        return{text:accuracyMilestoneTweet(si.n,completePct),id:`acc-${st}-${t}`};
      }
    }
  }

  // Community correction milestones — pre-seed passed ones
  const stats=(await kv.get("community:stats"))||{totalCorrections:0};
  let commDirty=false;let latestComm:number|null=null;
  for(const m of COMMUNITY_MILESTONES){
    if(stats.totalCorrections>=m&&!reached.community.includes(m)){
      reached.community.push(m);commDirty=true;latestComm=m;
    }
  }
  if(commDirty)await kv.set("twitter:milestones",reached);
  if(latestComm){
    return{text:communityMilestoneTweet(stats.totalCorrections),id:`community-${latestComm}`};
  }

  return null;
}

// ── Scheduled posting logic ──

async function getDaily():{date:string;count:number;types:{church:number;deploy:number;milestone:number;funfact:number}}{
  const today=new Date().toISOString().slice(0,10);
  const daily=(await kv.get("twitter:daily"))||{date:"",count:0,types:{church:0,deploy:0,milestone:0,funfact:0}};
  if(daily.date!==today)return{date:today,count:0,types:{church:0,deploy:0,milestone:0,funfact:0}};
  if(!daily.types)daily.types={church:0,deploy:0,milestone:0,funfact:0};
  return daily;
}

async function logTweet(eventType:string,entityId:string,text:string,result:{success:boolean;tweetId?:string;error?:string},daily:any):Promise<void>{
  const log:any[]=(await kv.get("twitter:log"))||[];
  log.unshift({eventType,entityId,text,timestamp:Date.now(),success:result.success,tweetId:result.tweetId,error:result.error});
  await kv.set("twitter:log",log.slice(0,100));
  daily.count++;
  const typeKey=eventType==="church_added"?"church":eventType==="deploy"?"deploy":eventType==="milestone"?"milestone":"funfact";
  daily.types[typeKey]=(daily.types[typeKey]||0)+1;
  await kv.set("twitter:daily",daily);
}

async function runScheduledPost():Promise<{posted:boolean;type?:string;text?:string;error?:string}>{
  try{
    if(!Deno.env.get("TWITTER_API_KEY"))return{posted:false,error:"No Twitter credentials"};

    const daily=await getDaily();
    if(daily.count>=DAILY_TWEET_CAP)return{posted:false,error:`Daily cap reached (${DAILY_TWEET_CAP})`};

    // Priority 1: Church from queue (max 1/day)
    if(daily.types.church<1){
      const queue:any[]=(await kv.get("twitter:church-queue"))||[];
      if(queue.length>0){
        const ch=queue.shift()!;
        await kv.set("twitter:church-queue",queue);
        const text=churchTweet(ch);
        const result=await postTweet(text);
        await logTweet("church_added",ch.id,text,result,daily);
        return{posted:true,type:"church_added",text};
      }
    }

    // Priority 2: Deploy from queue
    if(daily.types.deploy<2){
      const queue:any[]=(await kv.get("twitter:deploy-queue"))||[];
      if(queue.length>0){
        const deploy=queue.shift()!;
        await kv.set("twitter:deploy-queue",queue);
        const text=deployTweet(deploy.message||"improvements");
        const result=await postTweet(text);
        await logTweet("deploy",`deploy-${deploy.queuedAt}`,text,result,daily);
        return{posted:true,type:"deploy",text};
      }
    }

    // Priority 3: Milestones
    if(daily.types.milestone<1){
      const milestone=await checkMilestones();
      if(milestone){
        const result=await postTweet(milestone.text);
        await logTweet("milestone",milestone.id,milestone.text,result,daily);
        return{posted:true,type:"milestone",text:milestone.text};
      }
    }

    // Priority 4: Fun facts (max 2/day)
    if(daily.types.funfact<2){
      const fact=await generateFunFact();
      if(fact){
        const result=await postTweet(fact.text);
        await logTweet("funfact",`fact-${Date.now()}`,fact.text,result,daily);
        return{posted:true,type:"funfact",text:fact.text};
      }
    }

    return{posted:false,error:"Nothing to post"};
  }catch(e){return{posted:false,error:`${e}`};}
}

// Monday morning: weekly community impact recap (overrides that slot)
const ONE_WEEK_MS=7*24*60*60*1000;

async function generateWeeklyRecap():Promise<string|null>{
  try{
    const now=Date.now();
    const cutoff=now-ONE_WEEK_MS;
    const log:any[]=(await kv.get("twitter:log"))||[];
    const churchAddedCount=log.filter((e:any)=>e.eventType==="church_added"&&e.timestamp>cutoff).length;
    const stats=(await kv.get("community:stats"))||{totalCorrections:0};
    const currentCorrections=stats.totalCorrections||0;
    const lastCorrections=(await kv.get("twitter:weekly-recap-last-corrections")) as number|undefined;
    const correctionsDelta=lastCorrections!=null?Math.max(0,currentCorrections-lastCorrections):currentCorrections;

    if(churchAddedCount===0&&correctionsDelta===0)return null;
    const parts:string[]=[];
    if(churchAddedCount>0)parts.push(`${churchAddedCount} new church${churchAddedCount===1?"":"es"} on the map`);
    if(correctionsDelta>0)parts.push(`${correctionsDelta.toLocaleString()} data correction${correctionsDelta===1?"":"s"}`);
    const line=parts.join(", ");
    const text=`This week's community impact: ${line}. Thanks for making the map better for everyone!`;
    return text.length<=280?text:null;
  }catch(_){return null;}
}

async function runMondayRecap():Promise<{posted:boolean;type?:string;text?:string;error?:string}>{
  try{
    if(!Deno.env.get("TWITTER_API_KEY"))return{posted:false,error:"No Twitter credentials"};
    const dateKey=new Date().toISOString().slice(0,10);
    if(await kv.get(`twitter:weekly-recap-posted:${dateKey}`))return{posted:false,error:"Weekly recap already posted this Monday"};
    const text=await generateWeeklyRecap();
    if(!text)return{posted:false,error:"No weekly recap"};
    const result=await postTweet(text);
    await kv.set(`twitter:weekly-recap-posted:${dateKey}`,true);
    const stats=(await kv.get("community:stats"))||{totalCorrections:0};
    await kv.set("twitter:weekly-recap-last-corrections",stats.totalCorrections||0);
    const log:any[]=(await kv.get("twitter:log"))||[];
    log.unshift({eventType:"weekly_recap",entityId:`recap-${dateKey}`,text,timestamp:Date.now(),success:result.success,tweetId:result.tweetId,error:result.error});
    await kv.set("twitter:log",log.slice(0,100));
    return{posted:result.success,type:"weekly_recap",text,error:result.error};
  }catch(e){return{posted:false,error:`${e}`};}
}

// Weekend: Saturday = 1 fun fact only, Sunday = 1 church spotlight only
const SPOTLIGHT_LAST_VERIFIED_DAYS=90;
const SPOTLIGHT_LAST_VERIFIED_MS=SPOTLIGHT_LAST_VERIFIED_DAYS*24*60*60*1000;

function churchSpotlightTweet(ch:any):string{
  const st=(ch.state||"").toUpperCase();
  const sid=(ch.shortId&&/^\d{8}$/.test(ch.shortId))?ch.shortId:toShortId(ch.id||"",ch.state||"",ch.shortId);
  const url=`heresmychurch.com/state/${st.toLowerCase()}/${sid}`;
  const name=(ch.name||"A church").slice(0,80);
  const city=(ch.city||"").slice(0,40)||"a city";
  const templates=[
    (n:string,c:string,s:string,u:string)=>`This week's church spotlight: ${n} in ${c}, ${s}. ${u}`,
    (n:string,c:string,s:string,u:string)=>`Spotlight: ${n} — ${c}, ${s}. See them on the map. ${u}`,
    (n:string,c:string,s:string,u:string)=>`Church spotlight: ${n} in ${c}, ${s}. ${u}`,
  ];
  return pickTemplate(templates,ch.id||name)(name,city,st,url).slice(0,280);
}

async function runWeekendSaturday():Promise<{posted:boolean;type?:string;text?:string;error?:string}>{
  try{
    if(!Deno.env.get("TWITTER_API_KEY"))return{posted:false,error:"No Twitter credentials"};
    const fact=await generateFunFact();
    if(!fact)return{posted:false,error:"No fun fact"};
    const result=await postTweet(fact.text);
    const log:any[]=(await kv.get("twitter:log"))||[];
    log.unshift({eventType:"funfact",entityId:`fact-${Date.now()}`,text:fact.text,timestamp:Date.now(),success:result.success,tweetId:result.tweetId,error:result.error});
    await kv.set("twitter:log",log.slice(0,100));
    return{posted:result.success,type:"funfact",text:fact.text,error:result.error};
  }catch(e){return{posted:false,error:`${e}`};}
}

async function runWeekendSunday():Promise<{posted:boolean;type?:string;text?:string;error?:string}>{
  try{
    if(!Deno.env.get("TWITTER_API_KEY"))return{posted:false,error:"No Twitter credentials"};
    const meta=await kv.get("churches:meta");const sc:Record<string,number>=meta?.stateCounts||{};
    const stateKeys=Object.keys(sc).filter(st=>st!=="DC"&&(sc[st]||0)>20);
    if(!stateKeys.length)return{posted:false,error:"No states with churches"};
    const lastSpotlightId=await kv.get("twitter:last-spotlight-church-id") as string|undefined;
    const now=Date.now();
    const eligible:any[]=[];
    const shuffled=stateKeys.sort(()=>Math.random()-0.5).slice(0,10);
    for(const st of shuffled){
      const churches=await kv.get(`churches:${st}`);
      if(!Array.isArray(churches))continue;
      for(const ch of churches){
        if(ch.id===lastSpotlightId)continue;
        const r=churchNeedsReview(ch);
        const recentlyVerified=ch.lastVerified&&(now-(ch.lastVerified as number)<=SPOTLIGHT_LAST_VERIFIED_MS);
        if(recentlyVerified||!r.needsReview){eligible.push(ch);}
      }
      if(eligible.length>=50)break;
    }
    if(!eligible.length)return{posted:false,error:"No spotlight church"};
    const ch=eligible[Math.floor(Math.random()*eligible.length)];
    const text=churchSpotlightTweet(ch);
    const result=await postTweet(text);
    await kv.set("twitter:last-spotlight-church-id",ch.id);
    const log:any[]=(await kv.get("twitter:log"))||[];
    log.unshift({eventType:"church_spotlight",entityId:ch.id,text,timestamp:Date.now(),success:result.success,tweetId:result.tweetId,error:result.error});
    await kv.set("twitter:log",log.slice(0,100));
    return{posted:result.success,type:"church_spotlight",text,error:result.error};
  }catch(e){return{posted:false,error:`${e}`};}
}

// Saturday window 12:00–13:45 UTC; Sunday window 17:00–18:45 UTC (8 x 15min slots each)
function getWeekendWindowAndSlot(now:Date):{window:string;slot:number;dateKey:string}|null{
  const h=now.getUTCHours(),m=now.getUTCMinutes();
  const dateKey=now.toISOString().slice(0,10);
  const day=now.getUTCDay();
  if(day===6&&h>=12&&h<=13){const slot=(h-12)*4+Math.floor(m/15);return{window:"saturday",slot,dateKey};}
  if(day===0&&h>=17&&h<=18){const slot=(h-17)*4+Math.floor(m/15);return{window:"sunday",slot,dateKey};}
  return null;
}

// Random slot per window: morning 12–14 UTC, afternoon 17–19 UTC, evening 22–24 UTC (8 x 15min slots each)
function getWindowAndSlot(now:Date):{window:string;slot:number;dateKey:string}|null{
  const h=now.getUTCHours(),m=now.getUTCMinutes();
  const dateKey=now.toISOString().slice(0,10);
  const day=now.getUTCDay();
  if(day>=1&&day<=5){
    if(h>=12&&h<=13){const slot=(h-12)*4+Math.floor(m/15);return{window:"morning",slot,dateKey};}
    if(h>=17&&h<=18){const slot=(h-17)*4+Math.floor(m/15);return{window:"afternoon",slot,dateKey};}
    if(h>=22&&h<=23){const slot=(h-22)*4+Math.floor(m/15);return{window:"evening",slot,dateKey};}
  }
  return null;
}
function chosenSlotForWindow(dateKey:string,window:string):number{
  return Math.abs(hashCode(`${dateKey}-${window}`))%8;
}

// Twitter scheduled endpoint (called by GitHub Actions cron)
app.post(`${P}/twitter/scheduled`,async(c)=>{
  try{
    const body=await c.req.json().catch(()=>({}));
    const secret=Deno.env.get("TWITTER_WEBHOOK_SECRET")||"";
    if(!secret||body.secret!==secret)return c.json({error:"Unauthorized"},401);
    const force=body.force===true;
    const now=new Date();
    const day=now.getUTCDay();
    const dateKey=now.toISOString().slice(0,10);

    if(force){
      if(day===6){const result=await runWeekendSaturday();return c.json(result);}
      if(day===0){const result=await runWeekendSunday();return c.json(result);}
      if(day===1){const recapResult=await runMondayRecap();if(recapResult.posted)return c.json(recapResult);}
      const result=await runScheduledPost();
      return c.json(result);
    }

    // Weekend: Saturday 1 fun fact, Sunday 1 church spotlight (single slot per day)
    const weekendWs=getWeekendWindowAndSlot(now);
    if(weekendWs){
      const key=`twitter:${weekendWs.window}-posted:${weekendWs.dateKey}`;
      const alreadyPosted=await kv.get(key);
      if(alreadyPosted)return c.json({posted:false,skipped:`already posted this ${weekendWs.window}`});
      const chosen=chosenSlotForWindow(weekendWs.dateKey,weekendWs.window);
      if(weekendWs.slot!==chosen)return c.json({posted:false,skipped:"not this slot",slot:weekendWs.slot,chosen});
      const result=weekendWs.window==="saturday"?await runWeekendSaturday():await runWeekendSunday();
      if(result.posted)await kv.set(key,true);
      return c.json(result);
    }

    // Weekday: 3 windows, random slot per window. Monday morning = weekly recap slot (overrides normal post).
    const ws=getWindowAndSlot(now);
    if(ws){
      const key=`twitter:window-posted:${ws.dateKey}:${ws.window}`;
      const alreadyPosted=await kv.get(key);
      if(alreadyPosted)return c.json({posted:false,skipped:"already posted this window"});
      const chosen=chosenSlotForWindow(ws.dateKey,ws.window);
      if(ws.slot!==chosen)return c.json({posted:false,skipped:"not this slot",slot:ws.slot,chosen});
      if(day===1&&ws.window==="morning"){
        const recapAlready=await kv.get(`twitter:weekly-recap-posted:${ws.dateKey}`);
        if(!recapAlready){
          const recapResult=await runMondayRecap();
          if(recapResult.posted){
            await kv.set(key,true);
            return c.json(recapResult);
          }
        }
      }
      const result=await runScheduledPost();
      if(result.posted)await kv.set(key,true);
      return c.json(result);
    }
    return c.json({posted:false,error:"Outside scheduled windows"});
  }catch(e){return c.json({error:`${e}`},500);}
});

// Twitter queue deploy (called by GitHub Actions on push)
app.post(`${P}/twitter/queue-deploy`,async(c)=>{
  try{
    const body=await c.req.json();
    const secret=Deno.env.get("TWITTER_WEBHOOK_SECRET")||"";
    if(!secret||body.secret!==secret)return c.json({error:"Unauthorized"},401);
    await queueDeploy(body.message||"improvements");
    return c.json({success:true,queued:true});
  }catch(e){return c.json({error:`${e}`},500);}
});

// Twitter status/debug route
app.get(`${P}/twitter/status`,async(c)=>{
  try{
    const secret=c.req.query("secret")||"";
    const expected=Deno.env.get("TWITTER_WEBHOOK_SECRET")||"";
    if(!expected||secret!==expected)return c.json({error:"Unauthorized"},401);
    const log=(await kv.get("twitter:log"))||[];
    const daily=await getDaily();
    const milestones=(await kv.get("twitter:milestones"))||{};
    const churchQueue:any[]=(await kv.get("twitter:church-queue"))||[];
    const deployQueue:any[]=(await kv.get("twitter:deploy-queue"))||[];
    return c.json({recentTweets:log.slice(0,20),daily,milestones,queues:{churches:churchQueue.length,deploys:deployQueue.length}});
  }catch(e){return c.json({error:`${e}`},500);}
});

// Twitter admin reset route — clears queues and milestone tracking state
app.post(`${P}/twitter/admin/reset`,async(c)=>{
  try{
    const body=await c.req.json().catch(()=>({}));
    const secret=String(body.secret||"");
    const expected=Deno.env.get("TWITTER_WEBHOOK_SECRET")||"";
    if(!expected||secret!==expected)return c.json({error:"Unauthorized"},401);

    const cleared:{deployQueue:boolean;churchQueue:boolean;milestones:boolean}={
      deployQueue:false,
      churchQueue:false,
      milestones:false,
    };

    await kv.set("twitter:deploy-queue",[]);
    cleared.deployQueue=true;

    await kv.set("twitter:church-queue",[]);
    cleared.churchQueue=true;

    await kv.set("twitter:milestones",{national:[],states:{},accuracy:{},community:[]});
    cleared.milestones=true;

    return c.json({success:true,cleared});
  }catch(e){return c.json({error:`${e}`},500);}
});

// ── One-time migration: apply all pending corrections & merge pending churches ──
app.post(`${P}/migrate/apply-pending`,async(c)=>{
  try{
    let correctionsApplied=0,churchesMerged=0;
    // 1. Apply all pending corrections (skip sensitive fields — those need moderator approval)
    const allSuggestions=await kv.getByPrefix("suggestions:");
    const toDefer:{st:string;churches:any[];churchId:string;corrections:Record<string,any>}[]=[];
    if(Array.isArray(allSuggestions)){
      for(const entry of allSuggestions){
        if(!entry||!Array.isArray(entry.submissions)||!entry.churchId)continue;
        const con=consensus(entry.submissions);
        // Filter out sensitive fields from auto-apply
        const safeCon:Record<string,any>={};
        for(const[f,d]of Object.entries(con)){if(!SENSITIVE_FIELDS.includes(f))safeCon[f]=d;}
        if(!Object.keys(safeCon).length)continue;
        const applied=await applyApprovedCorrections(entry.churchId,safeCon);
        if(applied.updated&&applied.state&&applied.churches&&applied.corrections){correctionsApplied++;toDefer.push({st:applied.state,churches:applied.churches,churchId:entry.churchId,corrections:applied.corrections});}
      }
    }
    for(const d of toDefer){await runDeferredIndexAndStats(d.st,d.churches,d.churchId,d.corrections);}
    // 2. Merge all pending churches into main data
    const states=["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
    for(const st of states){
      const store=await kv.get(`pending-churches:${st}`);
      if(!store||!Array.isArray(store.churches)||!store.churches.length)continue;
      const mainKey=`churches:${st}`;const mainChurches=(await kv.get(mainKey))||[];
      if(!Array.isArray(mainChurches))continue;
      let added=false;
      for(const pc of store.churches){
        pc.approved=true;
        // Check for duplicates by name+location
        const exists=mainChurches.some((mc:any)=>mc.name?.trim().toLowerCase()===pc.name?.trim().toLowerCase()&&Math.abs((mc.lat||0)-(pc.lat||0))<0.001&&Math.abs((mc.lng||0)-(pc.lng||0))<0.001);
        if(exists)continue;
        mainChurches.push({id:pc.id,shortId:pc.shortId||toShortId(pc.id,st),name:pc.name,address:pc.address,city:pc.city,state:st,lat:pc.lat,lng:pc.lng,denomination:pc.denomination,attendance:pc.attendance,website:pc.website,serviceTimes:pc.serviceTimes,languages:pc.languages,ministries:pc.ministries,pastorName:pc.pastorName,phone:pc.phone,email:pc.email,lastVerified:Date.now()});
        churchesMerged++;added=true;
      }
      if(added){const unique=addShortIdsUnique(mainChurches,st);await kv.set(mainKey,unique);await writeIdx(st,unique);}
      await kv.set(`pending-churches:${st}`,store);
    }
    return c.json({success:true,correctionsApplied,churchesMerged});
  }catch(e){return c.json({error:`${e}`},500);}
});

Deno.serve(app.fetch);