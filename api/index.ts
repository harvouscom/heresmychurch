import { dispatchConfirmationEmails, setConfirmationEmailBinding, type ConfirmationEmailBinding } from "../supabase/functions/make-server-283d8046/email-confirmation.ts";
/**
 * Cloudflare Worker entry for the HMC API (api.heresmychurch.com).
 *
 * Runs the same Hono app as the Supabase edge function
 * (supabase/functions/make-server-283d8046/app.ts). Deno-style imports in that code
 * (npm:, jsr:) are mapped to npm packages by `alias` in api/wrangler.jsonc.
 */
import { setReviewAi, type AiBinding } from "../supabase/functions/make-server-283d8046/review-evidence.ts";
import app, { publishTarget, enqueueFullPublication } from "../supabase/functions/make-server-283d8046/app.ts";
import { setEnv, setOgImageRenderer, setWaitUntil } from "../supabase/functions/make-server-283d8046/runtime.ts";
import { setR2Binding } from "../supabase/functions/make-server-283d8046/r2.ts";
import { setD1, setKvBucket, setSearchD1 } from "../supabase/functions/make-server-283d8046/bindings.ts";
import { setPublicationQueue, dispatchPublications, publishQueuedTarget, publicationHealth, releasePublication, validPublicationTarget, nudgePublications } from "../supabase/functions/make-server-283d8046/publication.ts";
import { collectRetiredObjects } from "../supabase/functions/make-server-283d8046/recovery.ts";
import { generateOgImage } from "./og-image.ts";
import { handlePresence } from "./presence.ts";

export { PresenceRoom } from "./presence.ts";

const PREFIX = "/make-server-283d8046";

interface Env {
  [name: string]: unknown;
  /** hmc-data bucket (static files); replaces the S3 keys the Supabase function uses. */
  AI?: AiBinding;
  CONFIRMATION_EMAIL?: ConfirmationEmailBinding;
  HMC_DATA?: R2Bucket;
  /** Main store: KV rows, audit log, monthly snapshots. */
  HMC_DB?: D1Database;
  /** Church search with FTS5. Separate so a heavy search can't block KV reads. */
  HMC_SEARCH_DB?: D1Database;
  /** Private bucket for KV values too large for a D1 row. */
  HMC_KV?: R2Bucket;
  /** Live visitor counts. */
  PRESENCE?: DurableObjectNamespace;
  PUBLICATIONS?: Queue<{target:string}>;
}

// og-image.tsx is Deno-only (esm.sh React + og_edge); Workers use workers-og.
setOgImageRenderer(generateOgImage);

function configure(env:Env,ctx:ExecutionContext):void {
    setEnv((name) => {
      const v = env[name];
      return typeof v === "string" ? v : undefined;
    });
    setReviewAi(env.AI ?? null);
    setConfirmationEmailBinding(env.CONFIRMATION_EMAIL ?? null);
    setWaitUntil((p) => ctx.waitUntil(p));
    setR2Binding(env.HMC_DATA ?? null);
    setD1(env.HMC_DB ?? null);
    setSearchD1(env.HMC_SEARCH_DB ?? null);
    setKvBucket(env.HMC_KV ?? null);

    setPublicationQueue(env.PUBLICATIONS ?? null);
 }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if(new URL(request.url).pathname==="/presence"&&env.PRESENCE)return handlePresence(request,env.PRESENCE);
    configure(env,ctx);
    if(!env.MAINTENANCE_READONLY)nudgePublications(p=>ctx.waitUntil(p));
    // Routes are mounted under /make-server-283d8046 (the Supabase function name);
    // accept bare paths too, so api.heresmychurch.com/churches/TX works.
    const url = new URL(request.url);
    if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) {
      url.pathname = PREFIX + (url.pathname === "/" ? "" : url.pathname);
    }

    return app.fetch(new Request(url.toString(), request), env, ctx);
  },
  async queue(batch:MessageBatch<{target:string}>,env:Env,ctx:ExecutionContext):Promise<void>{
    configure(env,ctx);
    for(const message of batch.messages){
      const target=message.body?.target;
      if(!validPublicationTarget(target)){console.error("publication_invalid_message");message.ack();continue;}
      if(env.MAINTENANCE_READONLY){await releasePublication(target);message.ack();continue;}
      try{await publishQueuedTarget(target,publishTarget);message.ack();}
      catch(e){
        console.error(JSON.stringify({event:"publication_failed",target,attempt:message.attempts,error:e instanceof Error?e.message:"unknown"}));
        message.retry({delaySeconds:Math.min(900,30*2**Math.min(message.attempts-1,5))});
      }
    }
  },
  async scheduled(controller:ScheduledController,env:Env,ctx:ExecutionContext):Promise<void>{
    configure(env,ctx);
    if(env.MAINTENANCE_READONLY)return;
    if(controller.cron==="0 9 * * *")await enqueueFullPublication();
    await dispatchPublications();
    await dispatchConfirmationEmails();
    if(new Date(controller.scheduledTime).getUTCMinutes()===0)await collectRetiredObjects();
    const health=await publicationHealth() as any;
    if(health.summary?.blocked||health.summary?.oldest_requested_at<Date.now()-900000){
      if(health.summary?.pending)console.warn(JSON.stringify({event:"publication_attention",...health.summary}));
    }
  },
};
