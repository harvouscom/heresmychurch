import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import * as kv from "./kv_store.tsx";
import { generateOgImage } from "./og-image.tsx";
import * as regrid from "./regrid.ts";
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
  if(eT==="way"||eT==="relation")m*=1.1;
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
  return`[out:json][timeout:90];area["ISO3166-2"="${iso}"]->.searchArea;(node["amenity"="place_of_worship"]["religion"="christian"]${f};way["amenity"="place_of_worship"]["religion"="christian"]${f};relation["amenity"="place_of_worship"]["religion"="christian"]${f};);out center 10000;`;
}
function splitB(b:[number,number,number,number]):[number,number,number,number][]{const[s,w,n,e]=b,mL=(s+n)/2,mN=(w+e)/2;return[[s,w,mL,mN],[s,mN,mL,e],[mL,w,n,mN],[mL,mN,n,e]];}

function parse(els:any[],st:string):any[]{
  const b=B[st.toUpperCase()];
  return els.map((el:any,i:number)=>{
    const lat=el.lat||el.center?.lat,lng=el.lon||el.center?.lon;
    if(!lat||!lng)return null;
    if(b){const[s,w,n,e]=b;if(lat<s-0.01||lat>n+0.01||lng<w-0.01||lng>e+0.01)return null;}
    const t=el.tags||{};
    const denomination=normD(t);
    if(isBlockedDenomination(denomination))return null;
    return{id:`${st}-${el.id||i}`,name:t.name||t["name:en"]||"Unnamed Church",lat,lng,denomination,attendance:estA(t,el.id,el.type),state:st.toUpperCase(),city:city(t),address:t["addr:street"]?`${t["addr:housenumber"]||""} ${t["addr:street"]}`.trim():"",website:t.website||t["contact:website"]||""};
  }).filter(Boolean);
}

async function fetchCh(st:string):Promise<any[]>{
  const info=gS(st);if(!info)throw new Error(`Unknown: ${st}`);
  const iso=`US-${st.toUpperCase()}`,b=B[st.toUpperCase()];
  if(BIG.has(st.toUpperCase())&&b){
    const qs=splitB(b);const seen=new Set<string>();let all:any[]=[];
    for(let i=0;i<qs.length;i++){
      try{const els=await ovpQ(bQ(iso,qs[i]),`${st}-Q${i+1}`);for(const c of parse(els,st)){if(!seen.has(c.id)){seen.add(c.id);all.push(c);}}}catch(e){console.log(`Q${i+1} fail:${e}`);}
      if(i<qs.length-1)await new Promise(r=>setTimeout(r,500));
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
function addShortIds(ch:any[],st:string):any[]{return ch.map((c:any)=>({...c,shortId:toShortId(c.id,c.state||st,c.shortId)}));}

// ── Search index ──
function buildIdx(ch:any[]){return ch.map((c:any)=>({id:c.id,n:c.name||"",c:c.city||"",d:c.denomination||"",a:c.attendance||0,ad:c.address||"",la:c.lat||0,lo:c.lng||0}));}
async function writeIdx(st:string,ch:any[]){await kv.set(`churches:sidx:${st}`,buildIdx(ch));}

// Relevance scoring: keep in sync with src/app/components/search-scoring.ts
const PHRASE=1000,ALL_IN_NAME=500,NAME_STARTS=300,TOK_NAME=50,TOK_LOC=30;
function scoreMatch(q:string,n:string,ci:string,ad:string):number{
  const tokens=q.split(/\s+/).filter(Boolean);
  const name=n.toLowerCase(),city=ci.toLowerCase(),address=ad.toLowerCase();
  let s=0;
  if(name.includes(q))s+=PHRASE;
  const inName=tokens.filter((t:string)=>name.includes(t));
  if(inName.length===tokens.length)s+=ALL_IN_NAME;
  if(tokens.length>0&&name.startsWith(tokens[0]))s+=NAME_STARTS;
  s+=inName.length*TOK_NAME;
  for(const t of tokens)if(city.includes(t)||address.includes(t))s+=TOK_LOC;
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
    const limit=(stP&&pop.includes(stP))?Math.min(parseInt(c.req.query("limit")||"100")||100,200):Math.min(parseInt(c.req.query("limit")||"10")||10,25);
    const sM:Record<string,string>={};
    for(const s of US){sM[s.a.toLowerCase()]=s.a;sM[s.n.toLowerCase()]=s.a;}
    sM["dc"]="MD";sM["d.c."]="MD";sM["district of columbia"]="MD";

    let target=pop,search=tokens;
    if(stP&&pop.includes(stP)){target=[stP];}
    else{
      const det:string[]=[],txt:string[]=[],used=new Set<number>(),full=tokens.join(" ");
      for(const s of US){const ln=s.n.toLowerCase();if(ln.includes(" ")&&full.includes(ln)&&pop.includes(s.a)){if(!det.includes(s.a))det.push(s.a);const ws=ln.split(" ");let sf=0;for(const w of ws){for(let i=sf;i<tokens.length;i++){if(!used.has(i)&&tokens[i]===w){used.add(i);sf=i+1;break;}}}}}
      for(let i=0;i<tokens.length;i++){if(used.has(i))continue;const m=sM[tokens[i]];if(m&&pop.includes(m)){det.push(m);used.add(i);}else txt.push(tokens[i]);}
      if(det.length){target=[...new Set(det)];search=txt;}
    }

    const exp=[...target];if(target.includes("MD")&&!target.includes("DC"))exp.push("DC");

    const COLLECT_CAP=500;
    const candidates:Array<{score:number,id:string,shortId:string,name:string,city:string,state:string,denomination:string,attendance:number,lat:number,lng:number,address:string}>=[];
    const seen=new Set<string>();
    for(const st of exp){
      if(candidates.length>=COLLECT_CAP)break;
      const realSt=st==="DC"?"MD":st;
      let items:any[]=null;
      try{
        const idx=await kv.get(`churches:sidx:${st}`);
        if(Array.isArray(idx)&&idx.length){items=idx;}
        else{
          const raw=await kv.get(`churches:${st}`);
          if(Array.isArray(raw)&&raw.length)items=raw;
        }
      }catch(_){}
      if(!Array.isArray(items))continue;
      const isIdx=items.length>0&&items[0]?.n!==undefined;
      for(const e of items){
        if(candidates.length>=COLLECT_CAP)break;
        const n=isIdx?e.n:(e.name||""),ci=isIdx?e.c:(e.city||""),d=isIdx?e.d:(e.denomination||""),ad=isIdx?e.ad:(e.address||"");
        if(search.length){const h=`${n} ${ci} ${d} ${ad}`.toLowerCase();if(!search.every((t:string)=>h.includes(t)))continue;}
        const k=`${n.toLowerCase().replace(/[^a-z0-9]/g,"")}|${ci.toLowerCase().replace(/[^a-z0-9]/g,"")}|${realSt}`;
        if(seen.has(k))continue;seen.add(k);
        const row={id:e.id,shortId:toShortId(e.id,realSt,e.shortId),name:n||"Unknown Church",city:ci,state:realSt,denomination:d||"Unknown",attendance:isIdx?e.a:e.attendance,lat:isIdx?e.la:e.lat,lng:isIdx?e.lo:e.lng,address:ad||""};
        candidates.push({score:scoreMatch(q,n,ci,ad),...row});
      }
    }
    candidates.sort((a,b)=>b.score-a.score||(a.name||"").localeCompare(b.name||""));
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
        if(val.startsWith("{")){try{const o=JSON.parse(val) as Record<string,string>;(ch as any).address=(o.address??"").trim();(ch as any).city=(o.city??"").trim();(ch as any).state=(o.state??"").trim().toUpperCase().slice(0,2);}catch{ (ch as any).address=val; }}
        else{const parts=val.split(",").map((s:string)=>s.trim());(ch as any).address=parts[0]??"";(ch as any).city=parts[1]??(ch as any).city;(ch as any).state=(parts[2]??(ch as any).state||"").toUpperCase().slice(0,2);}
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

app.get(`${P}/churches/:state`,async(c)=>{
  try{
    const st=c.req.param("state").toUpperCase(),info=gS(st);
    if(!info)return c.json({error:`Unknown state: ${st}`},400);
    let ch=await kv.get(`churches:${st}`);
    if(!ch||!Array.isArray(ch)||!ch.length)return c.json({churches:[],state:{abbrev:info.a,name:info.n,lat:info.la,lng:info.lo},fromCache:false,message:`No data for ${info.n}. POST /churches/populate/${st} to fetch.`});
    if(st==="MD"){try{const dc=await kv.get("churches:DC");if(Array.isArray(dc)&&dc.length){const ids=new Set(ch.map((c:any)=>c.id));for(const x of dc)if(!ids.has(x.id))ch.push({...x,state:"MD"});}}catch(_){}}
    const corrections=await getApprovedCorrectionsForState(st);
    mergeCorrectionsIntoChurches(ch,corrections);
    const withShort=addShortIds(ch,st);
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
    await kv.set(`churches:${st}`,ch);await writeIdx(st,ch);
    const meta=(await kv.get("churches:meta"))||{stateCounts:{}};meta.stateCounts[st]=ch.length;meta.lastUpdated=new Date().toISOString();await kv.set("churches:meta",meta);
    return c.json({message:`Populated ${ch.length} churches for ${info.n}`,count:ch.length,state:{abbrev:info.a,name:info.n,lat:info.la,lng:info.lo},ardaEnriched:en});
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

// Refresh attendance estimates (re-run estA + refARDA + state scaling). Single state or all.
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
        await kv.set(`churches:${st}`,ch);await writeIdx(st,ch);
        if(meta){meta.stateCounts[st]=ch.length;meta.lastUpdated=new Date().toISOString();await kv.set("churches:meta",meta);}
        refreshed++;
      }catch(e){console.log(`Refresh ${st} error:${e}`);}
      if(states.length>1)await new Promise(r=>setTimeout(r,500));
    }
    return c.json({message:`Refreshed attendance for ${refreshed} state(s).`,refreshed});
  }catch(e){return c.json({error:`${e}`},500);}
});

// Regrid: enrich attendance from building sqft (batch, capped at 2000 for trial).
app.post(`${P}/admin/enrich-regrid/:state`,async(c)=>{
  try{
    const st=c.req.param("state").toUpperCase(),info=gS(st);
    if(!info)return c.json({error:`Unknown state: ${st}`},400);
    const meta=await kv.get("churches:meta");const populated=Object.keys(meta?.stateCounts||{});
    if(!populated.includes(st))return c.json({error:`State ${st} not populated. Populate first.`},400);
    if(!Deno.env.get("REGRID_TOKEN")?.trim())return c.json({error:"Regrid token not set.",message:"Set REGRID_TOKEN in Supabase secrets."},503);
    let ch=await kv.get(`churches:${st}`);
    if(!Array.isArray(ch)||!ch.length)return c.json({error:`No churches for ${st}`},400);

    function attendanceStats(arr:any[]){const a=arr.map((x:any)=>x.attendance||0).filter((n:number)=>n>0);const total=a.reduce((s:number,n:number)=>s+n,0);const sorted=[...a].sort((x,y)=>x-y);const mid=Math.floor(sorted.length/2);const median=sorted.length?sorted.length%2?sorted[mid]:Math.round((sorted[mid-1]+sorted[mid])/2):0;return{total,median,count:arr.length};}
    const before=attendanceStats(ch);

    const points=ch.map((c:any)=>({id:c.id,lat:c.lat,lng:c.lng,address:c.address||"",city:c.city||"",state:c.state||st}));
    let sqftByChurchId:Map<string,number>;
    try{
      const {job_uuid}=await regrid.submitBatch(points);
      const maxWaitMs=20*60*1000,pollIntervalMs=4000;
      const deadline=Date.now()+maxWaitMs;
      while(Date.now()<deadline){
        const status=await regrid.getBatchStatus(job_uuid);
        if(status.status==="ready")break;
        if(status.status==="failed")return c.json({error:"Regrid job failed",job_uuid,status},502);
        await new Promise(r=>setTimeout(r,pollIntervalMs));
      }
      if(Date.now()>=deadline)return c.json({error:"Regrid job timed out",job_uuid},504);
      sqftByChurchId=await regrid.downloadBatchResults(job_uuid);
    }catch(batchErr:any){
      if(batchErr?.message?.includes("401")||batchErr?.message?.includes("No Batch")){
        sqftByChurchId=await regrid.enrichPointsRealtime(points);
      }else throw batchErr;
    }
    let enriched=0;
    for(const c of ch){
      const sqft=sqftByChurchId.get(c.id);
      if(sqft!=null&&sqft>0){
        (c as any).buildingSqft=sqft;
        (c as any).attendance=Math.max(10,Math.min(25000,Math.round(sqft/55)));
        enriched++;
      }
    }
    const noMatch=ch.length-enriched;
    await kv.set(`churches:${st}`,ch);await writeIdx(st,ch);

    const after=attendanceStats(ch);
    return c.json({message:`Regrid enrichment done for ${info.n}.`,state:st,enriched,noMatch,attendanceBefore:before,attendanceAfter:after});
  }catch(e:any){
    if(e?.message==="Regrid token not set.")return c.json({error:"Regrid token not set.",message:"Set REGRID_TOKEN in Supabase secrets."},503);
    console.log("enrich-regrid error:",e);
    return c.json({error:String(e?.message||e)},500);
  }
});

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
      }
    }
    if(meta){meta.stateCounts=sc;meta.lastBlockedCleanup=new Date().toISOString();await kv.set("churches:meta",meta);}
    return c.json({message:`Cleanup complete. Removed ${removedTotal} churches across ${cleanedStates} states.`,removed:removedTotal,states:cleanedStates});
  }catch(e){return c.json({error:`${e}`},500);}
});

// ── Community routes ──
const THR=1;
function cip(c:any):string{return c.req.header("x-forwarded-for")?.split(",")[0]?.trim()||c.req.header("x-real-ip")||"unknown";}
function normalizePhone(s:string):string{
  const digits=(s??"").replace(/\D/g,"");
  if(digits.length===11&&digits[0]==="1")return digits.slice(1);
  if(digits.length<10)return "";
  return digits;
}
const VF=["name","website","address","attendance","denomination","serviceTimes","languages","ministries","pastorName","phone","email","homeCampusId"];
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

async function applyApprovedCorrections(churchId:string,con:Record<string,any>):Promise<boolean>{
  const corrections:Record<string,any>={};
  for(const[field,data]of Object.entries(con)){if((data as any).approved&&(data as any).value!==null)corrections[field]=(data as any).value;}
  if(!Object.keys(corrections).length)return false;
  const parts=churchId.split("-");const st=parts[0]==="community"?parts[1]:parts[0];
  if(!st||st.length!==2)return false;
  const key=`churches:${st}`;const churches=await kv.get(key);
  if(!Array.isArray(churches))return false;
  let updated=false;
  for(const ch of churches){
    if(ch.id===churchId){
      for(const[f,v]of Object.entries(corrections)){
        if(f==="attendance"){ch.attendance=parseInt(v)||ch.attendance;}
        else if(f==="languages"||f==="ministries"){ch[f]=String(v).split(",").map((s:string)=>s.trim()).filter(Boolean);}
        else if(f==="address"){
          const val=String(v).trim();
          if(val.startsWith("{")){
            try{
              const o=JSON.parse(val) as Record<string,string>;
              (ch as any).address=(o.address??"").trim();
              (ch as any).city=(o.city??"").trim();
              (ch as any).state=(o.state??"").trim().toUpperCase().slice(0,2);
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
      ch.lastVerified=Date.now();updated=true;break;
    }
  }
  if(updated){
    await kv.set(key,churches);await writeIdx(st,churches);
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
  return updated;
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
    if(field==="phone"){storeValue=normalizePhone(storeValue);if(!storeValue)return c.json({error:"Invalid phone number"},400);}
    const k=`suggestions:${churchId}`;const ex=(await kv.get(k))||{churchId,submissions:[]};
    // Ensure churchId is stored in the value for getByPrefix lookups
    if(!ex.churchId)ex.churchId=churchId;
    const day=Date.now()-86400000;const r=ex.submissions.find((s:any)=>s.ip===ip&&s.field===field&&s.timestamp>day);
    if(r){r.value=storeValue;r.timestamp=Date.now();}else ex.submissions.push({ip,field,value:storeValue,timestamp:Date.now()});
    await kv.set(k,ex);const con=consensus(ex.submissions);
    const applied=await applyApprovedCorrections(churchId,con);
    return c.json({success:true,field,consensus:con[field],allFields:con,applied});
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

app.post(`${P}/churches/add`,async(c)=>{
  try{
    const ip=cip(c);const b=await c.req.json();
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
    if(Array.isArray(mainChurches)){mainChurches.push(churchForMain);await kv.set(mainKey,mainChurches);await writeIdx(st,mainChurches);}
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
    if(Array.isArray(churches)){const ch=churches.find((x:any)=>x.id===churchId);if(ch){ch.lastVerified=Date.now();await kv.set(key,churches);}}
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

// ── One-time migration: apply all pending corrections & merge pending churches ──
app.post(`${P}/migrate/apply-pending`,async(c)=>{
  try{
    let correctionsApplied=0,churchesMerged=0;
    // 1. Apply all pending corrections
    const allSuggestions=await kv.getByPrefix("suggestions:");
    if(Array.isArray(allSuggestions)){
      for(const entry of allSuggestions){
        if(!entry||!Array.isArray(entry.submissions)||!entry.churchId)continue;
        const con=consensus(entry.submissions);
        const applied=await applyApprovedCorrections(entry.churchId,con);
        if(applied)correctionsApplied++;
      }
    }
    // 2. Merge all pending churches into main data
    const states=["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
    for(const st of states){
      const store=await kv.get(`pending-churches:${st}`);
      if(!store||!Array.isArray(store.churches)||!store.churches.length)continue;
      const mainKey=`churches:${st}`;const mainChurches=(await kv.get(mainKey))||[];
      if(!Array.isArray(mainChurches))continue;
      let added=false;
      for(const pc of store.churches){
        if(!pc.verifications||!pc.verifications.length)continue;
        pc.approved=true;
        // Check for duplicates by name+location
        const exists=mainChurches.some((mc:any)=>mc.name?.trim().toLowerCase()===pc.name?.trim().toLowerCase()&&Math.abs((mc.lat||0)-(pc.lat||0))<0.001&&Math.abs((mc.lng||0)-(pc.lng||0))<0.001);
        if(exists)continue;
        mainChurches.push({id:pc.id,name:pc.name,address:pc.address,city:pc.city,state:st,lat:pc.lat,lng:pc.lng,denomination:pc.denomination,attendance:pc.attendance,website:pc.website,serviceTimes:pc.serviceTimes,languages:pc.languages,ministries:pc.ministries,pastorName:pc.pastorName,phone:pc.phone,email:pc.email,lastVerified:Date.now()});
        churchesMerged++;added=true;
      }
      if(added){await kv.set(mainKey,mainChurches);await writeIdx(st,mainChurches);}
      await kv.set(`pending-churches:${st}`,store);
    }
    return c.json({success:true,correctionsApplied,churchesMerged});
  }catch(e){return c.json({error:`${e}`},500);}
});

Deno.serve(app.fetch);