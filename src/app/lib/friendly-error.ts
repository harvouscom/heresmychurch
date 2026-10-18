/**
 * Turn a thrown error into copy a visitor can act on. Server validation messages
 * (plain sentences from 4xx responses) pass through; timeouts, network failures,
 * 5xx responses and developer-facing text ("Failed to fetch churches: 503") become
 * plain-language messages.
 */
export const NETWORK_ERROR = "We couldn't reach the server. Check your connection and try again.";
export const TIMEOUT_ERROR = "This is taking longer than usual. Check your connection and try again.";
export const SERVER_ERROR = "Something went wrong on our end. Please try again in a moment.";
export const RATE_LIMIT_ERROR = "Too many requests. Please wait a moment and try again.";

export function friendlyError(err: unknown, fallback = SERVER_ERROR): string {
  let msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  msg = msg.trim();
  if (!msg) return fallback;

  // A raw JSON body (e.g. `{"error":"Name required"}`): use its message.
  if (msg.startsWith("{")) {
    try {
      const body = JSON.parse(msg) as { error?: unknown; message?: unknown };
      const inner = typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "";
      return inner ? friendlyError(inner, fallback) : fallback;
    } catch {
      return fallback;
    }
  }

  if (/timed out|timeout/i.test(msg)) return TIMEOUT_ERROR;
  if (/(^|: )failed to fetch$|networkerror|network request failed|load failed|err_|offline/i.test(msg)) return NETWORK_ERROR;
  if (/\b429\b|too many/i.test(msg)) return /too many/i.test(msg) && !/\b429\b/.test(msg) ? msg : RATE_LIMIT_ERROR;
  if (/\b5\d\d\b|internal server error|bad gateway|service unavailable|something went wrong/i.test(msg)) return fallback;
  // Developer-facing text: status codes, stack-ish prefixes, exception names.
  if (/^(failed to |error:|typeerror|syntaxerror|referenceerror)|: \d{3}\b|\bundefined\b|\bnull\b/i.test(msg)) return fallback;
  if (msg.length > 200) return fallback;
  return msg;
}
