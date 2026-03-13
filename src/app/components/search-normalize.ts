/**
 * Shared helpers for normalizing and tokenizing search text.
 *
 * These should stay in sync with the equivalent helpers in the Supabase
 * Edge Function (make-server-283d8046) so that frontend and backend
 * searches behave the same.
 */

/**
 * Normalizes a string for search by:
 * - lowercasing
 * - replacing all non-alphanumeric characters with spaces
 * - collapsing multiple spaces
 * - trimming leading/trailing whitespace
 */
export function normalizeSearchText(text: string): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  const cleaned = lower.replace(/[^a-z0-9]+/g, " ");
  return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * Tokenizes a string into distinct, normalized search tokens.
 */
export function tokenizeSearchText(text: string): string[] {
  const norm = normalizeSearchText(text);
  if (!norm) return [];
  const parts = norm.split(" ").filter(Boolean);
  // Deduplicate while preserving order
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      tokens.push(p);
    }
  }
  return tokens;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cb = b.charCodeAt(j - 1);
      if (ca === cb) {
        curr[j] = prev[j - 1];
      } else {
        const insert = curr[j - 1] + 1;
        const remove = prev[j] + 1;
        const replace = prev[j - 1] + 1;
        curr[j] = insert < remove ? (insert < replace ? insert : replace) : remove < replace ? remove : replace;
      }
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j];
    }
  }

  return prev[n];
}

/**
 * Returns a similarity score between 0 and 1 for two tokens,
 * based on normalized Levenshtein distance. 1 = identical.
 */
export function tokenSimilarity(a: string, b: string): number {
  const ta = normalizeSearchText(a);
  const tb = normalizeSearchText(b);
  if (!ta || !tb) return 0;
  if (ta === tb) return 1;
  const maxLen = Math.max(ta.length, tb.length);
  if (!maxLen) return 0;
  const dist = levenshteinDistance(ta, tb);
  const sim = 1 - dist / maxLen;
  return sim < 0 ? 0 : sim;
}


