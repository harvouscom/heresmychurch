import type { Church } from "./church-data";
import { normalizeSearchText, tokenizeSearchText } from "./search-normalize";
import { scoreChurchMatch } from "./search-scoring";

export interface SearchableChurch {
  name: string;
  city?: string;
  address?: string;
  denomination?: string;
}

export interface ChurchMatchResult {
  matched: boolean;
  score: number;
}

/**
 * Determines whether a church matches a free-text query, and returns a
 * relevance score suitable for sorting. Matching:
 * - normalizes both query and church fields (lowercase, strip punctuation)
 * - requires all tokens for very short queries (1–2 words)
 * - for longer queries, requires at least ~60% of tokens to match
 */
export function matchQueryToChurch(
  query: string,
  church: SearchableChurch
): ChurchMatchResult {
  const normQ = normalizeSearchText(query);
  if (!normQ) return { matched: false, score: 0 };

  const queryTokens = tokenizeSearchText(normQ);
  if (queryTokens.length === 0) return { matched: false, score: 0 };

  const blobTokens = tokenizeSearchText(
    `${church.name} ${church.city || ""} ${church.denomination || ""} ${church.address || ""}`
  );
  if (blobTokens.length === 0) return { matched: false, score: 0 };

  const blobSet = new Set(blobTokens);
  let matchCount = 0;
  for (const t of queryTokens) {
    if (blobSet.has(t)) matchCount++;
  }

  const minRequired =
    queryTokens.length <= 2
      ? queryTokens.length
      : Math.max(1, Math.ceil(queryTokens.length * 0.6));

  const matched = matchCount >= minRequired;
  if (!matched) return { matched: false, score: 0 };

  const score = scoreChurchMatch(query, {
    name: church.name,
    city: church.city,
    address: church.address,
  });

  return { matched: true, score };
}

