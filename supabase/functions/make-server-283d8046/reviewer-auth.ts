// Reviewer sign-in through Cloudflare Access, replacing the shared moderator key.
// Access sits in front of heresmychurch.com/review; the site Worker forwards the signed
// Cf-Access-Jwt-Assertion header here. The header can be forged on the public API host, so it is
// always verified: RS256 against the team's published keys, plus audience, issuer and expiry, and
// the identity must be on an allowlist. Configured by ACCESS_TEAM_DOMAIN (e.g. hmc.cloudflareaccess.com),
// ACCESS_AUD (the application's audience tag), REVIEWER_EMAILS and REVIEWER_SERVICE_TOKENS (client ids).
import { env } from "./runtime.ts";

export type Reviewer = { kind: "email" | "service"; id: string };

type Jwk = JsonWebKey & { kid?: string };
let jwksCache: { team: string; at: number; keys: Jwk[] } | null = null;
const JWKS_TTL_MS = 3600000;

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (ch) => ch.charCodeAt(0));
const list = (name: string) => (env(name) || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function teamKeys(team: string, refresh = false): Promise<Jwk[]> {
  if (!refresh && jwksCache && jwksCache.team === team && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access keys unavailable (${res.status})`);
  const body = await res.json() as { keys?: Jwk[] };
  jwksCache = { team, at: Date.now(), keys: Array.isArray(body.keys) ? body.keys : [] };
  return jwksCache.keys;
}

/** Test hook: preload keys instead of fetching them. */
export function setAccessKeysForTest(team: string, keys: Jwk[] | null) {
  jwksCache = keys ? { team, at: Date.now(), keys } : null;
}

/** Returns the reviewer for a valid, allowlisted Access token, otherwise null. Never throws. */
export async function verifyAccessJwt(token: string | undefined | null, now = Date.now()): Promise<Reviewer | null> {
  try {
    const team = (env("ACCESS_TEAM_DOMAIN") || "").trim().toLowerCase();
    const aud = (env("ACCESS_AUD") || "").trim();
    if (!token || !team || !aud) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    let key = (await teamKeys(team)).find((k) => k.kid === header.kid);
    if (!key) key = (await teamKeys(team, true)).find((k) => k.kid === header.kid);
    if (!key) return null;
    const cryptoKey = await crypto.subtle.importKey("jwk", { kty: key.kty, n: key.n, e: key.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(aud)) return null;
    if (claims.iss !== `https://${team}`) return null;
    const seconds = Math.floor(now / 1000);
    if (typeof claims.exp !== "number" || claims.exp <= seconds) return null;
    if (typeof claims.nbf === "number" && claims.nbf > seconds + 60) return null;
    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    if (email) return list("REVIEWER_EMAILS").includes(email) ? { kind: "email", id: email } : null;
    const service = typeof claims.common_name === "string" ? claims.common_name.trim().toLowerCase() : "";
    if (service) return list("REVIEWER_SERVICE_TOKENS").includes(service) ? { kind: "service", id: service } : null;
    return null;
  } catch {
    return null;
  }
}

/** Timing-safe string comparison for admin keys. */
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
