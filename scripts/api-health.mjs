/**
 * Build-time API health gate, shared by generate-sitemap.mjs (prebuild) and
 * generate-metro-pages.mjs (postbuild).
 *
 * Both scripts fetch every populated region's church list. When the API is down
 * each of those requests waits out a 20-45s timeout, which used to stretch builds
 * until Netlify killed them. Instead, probe once up front:
 *
 *   healthy                    → run normally
 *   unhealthy + production     → fail in seconds, so Netlify keeps the last good deploy live
 *   unhealthy + anything else  → skip the church-dependent output and warn
 *
 * "Production" is Netlify's CONTEXT=production. Overrides:
 *   HMC_REQUIRE_API=1  always fail when the API is down
 *   HMC_SKIP_API=1     always skip church-dependent output (no probe)
 */

const PROBE_TIMEOUT_MS = 12_000;

function isProduction() {
  return process.env.CONTEXT === "production";
}

async function probe(apiBase, headers) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`${apiBase}/churches/states`, { headers, signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.states) && data.states.length && data.totalChurches > 0) return { ok: true };
        return { ok: false, reason: "/churches/states returned no churches" };
      }
      if (attempt === 1) return { ok: false, reason: `/churches/states returned HTTP ${res.status}` };
    } catch (err) {
      if (attempt === 1) {
        const why = err?.name === "AbortError" ? `timed out after ${PROBE_TIMEOUT_MS / 1000}s` : String(err?.message || err);
        return { ok: false, reason: `/churches/states ${why}` };
      }
    } finally {
      clearTimeout(t);
    }
  }
  return { ok: false, reason: "unreachable" };
}

/**
 * Returns true when church data is available. Returns false when the caller should
 * skip church-dependent output. Exits the process (code 1) in production builds.
 */
export async function apiAvailableOrExit(scriptName, apiBase, headers) {
  if (process.env.HMC_SKIP_API === "1") {
    console.warn(`${scriptName}: HMC_SKIP_API=1, skipping church-dependent output`);
    return false;
  }
  const result = await probe(apiBase, headers);
  if (result.ok) return true;

  const msg = `${scriptName}: API unavailable (${result.reason}).`;
  if (isProduction() || process.env.HMC_REQUIRE_API === "1") {
    console.error(`${msg} Failing the build so the last good deploy stays live.`);
    process.exit(1);
  }
  console.warn(`${msg} Skipping church-dependent output for this non-production build.`);
  return false;
}
