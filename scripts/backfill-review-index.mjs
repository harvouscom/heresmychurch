#!/usr/bin/env node
// Rebuild only the moderation projection, one bounded region per request. No church fields change.
const base=(process.env.HMC_FUNCTIONS_BASE_URL||'https://api.heresmychurch.com').replace(/\/$/,'');
const key=(process.env.ADMIN_KEY || process.env.MODERATOR_KEY);if(!key){console.error('MODERATOR_KEY is required.');process.exit(2);}
let offset=Number(process.env.REVIEW_INDEX_OFFSET||0),checked=0;const failed=[];
for(;;){
 let response,body;
 for(let attempt=0;attempt<5;attempt++){
  try{response=await fetch(`${base}/moderate/review-index/backfill?offset=${offset}`,{method:'POST',headers:{'x-moderator-key':key,'x-admin-key':key},signal:AbortSignal.timeout(120000)});body=await response.json();if(response.ok||response.status<500)break;await new Promise(r=>setTimeout(r,1000*2**attempt));}
  catch(e){if(attempt===4)throw e;await new Promise(r=>setTimeout(r,1000*2**attempt));}
 }
 if(!response?.ok)throw Error(`Review-index backfill failed at offset ${offset}: HTTP ${response?.status}`);
 for(const row of body.regions??[]){checked++;if(!row.ready)failed.push(row.region);}
 if(checked%25===0||body.next==null)console.log(`Indexed ${Math.min(offset+1,body.total)}/${body.total} regions${failed.length?`; ${failed.length} changed during rebuild and need another pass`:''}`);
 if(body.next==null)break;offset=body.next;
}
if(failed.length){console.error('Regions needing another pass:',failed.join(', '));process.exit(1);}
console.log('Review-index backfill complete.');
