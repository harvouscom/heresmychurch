#!/usr/bin/env node
/**
 * Refuses a production API deploy from a checkout that could undo what's live.
 *
 * Deploying from a stale branch drops bindings and vars, and during the move off Supabase it
 * could send writes back to Postgres. Requires a clean tree that contains the latest origin/main.
 * Run from package.json before `wrangler deploy` and `supabase functions deploy`.
 *
 * Emergency override, for a deliberate rollback: HMC_DEPLOY_FORCE=1
 */
import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

if (process.env.HMC_DEPLOY_FORCE === "1") {
  console.warn("check-deploy-ref: skipped (HMC_DEPLOY_FORCE=1)");
  process.exit(0);
}

const problems = [];
try {
  git("fetch", "origin", "main", "--quiet");
  if (git("status", "--porcelain")) problems.push("the working tree has uncommitted changes");
  try {
    git("merge-base", "--is-ancestor", "origin/main", "HEAD");
  } catch {
    problems.push(`HEAD (${git("rev-parse", "--short", "HEAD")}) doesn't contain origin/main (${git("rev-parse", "--short", "origin/main")})`);
  }
} catch (e) {
  problems.push(`couldn't check git state: ${e.message}`);
}

if (problems.length) {
  console.error("Deploy refused:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("Deploy from an up-to-date origin/main checkout. For a deliberate rollback, set HMC_DEPLOY_FORCE=1.");
  process.exit(1);
}
