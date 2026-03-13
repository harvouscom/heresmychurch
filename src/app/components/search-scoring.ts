/**
 * Relevance scoring for church search. Keeps server (make-server) in sync when
 * changing: same rules are inlined in the Edge Function.
 */

import { normalizeSearchText, tokenizeSearchText, tokenSimilarity } from "./search-normalize";

const PHRASE_IN_NAME = 1000;
const ALL_TOKENS_IN_NAME = 500;
const NAME_STARTS_WITH_FIRST = 300;
const TOKEN_IN_NAME = 50;
const TOKEN_IN_CITY_OR_ADDRESS = 30;

export interface ChurchForScoring {
  name: string;
  city?: string;
  address?: string;
}

/**
 * Returns a relevance score for a church match. Higher = better.
 * Name match is primary; city/address add refinement boost.
 */
export function scoreChurchMatch(
  query: string,
  church: ChurchForScoring
): number {
  const normQ = normalizeSearchText(query);
  if (!normQ) return 0;

  const tokens = tokenizeSearchText(normQ);
  if (tokens.length === 0) return 0;

  const nameNorm = normalizeSearchText(church.name || "");
  const cityNorm = normalizeSearchText(church.city || "");
  const addressNorm = normalizeSearchText(church.address || "");

  const nameTokens = tokenizeSearchText(church.name || "");
  const cityTokens = tokenizeSearchText(church.city || "");
  const addressTokens = tokenizeSearchText(church.address || "");

  let score = 0;

  // Query as phrase in name (normalized)
  if (nameNorm.includes(normQ)) {
    score += PHRASE_IN_NAME;
  }

  const bestSimIn = (token: string, tokensArr: string[]): number => {
    let best = 0;
    for (const t of tokensArr) {
      const sim = tokenSimilarity(token, t);
      if (sim > best) best = sim;
      if (best >= 1) break;
    }
    return best;
  };

  // All tokens (approximately) found in name
  const allInName = tokens.every((t) => bestSimIn(t, nameTokens) >= 0.9);
  if (allInName) {
    score += ALL_TOKENS_IN_NAME;
  }

  // Name starts with first token (allowing light fuzziness)
  if (tokens.length > 0 && nameTokens.length > 0) {
    const firstToken = tokens[0];
    const firstNameToken = nameTokens[0];
    if (tokenSimilarity(firstToken, firstNameToken) >= 0.85) {
      score += NAME_STARTS_WITH_FIRST;
    }
  }

  // Per-token contributions in name (with fuzzy tolerance)
  for (const t of tokens) {
    const sim = bestSimIn(t, nameTokens);
    if (sim >= 0.9) {
      score += TOKEN_IN_NAME;
    } else if (sim >= 0.7) {
      score += Math.round(TOKEN_IN_NAME * (sim - 0.6));
    }
  }

  // Refinement: each token in city or address (with fuzzy tolerance)
  for (const t of tokens) {
    const simCity = bestSimIn(t, cityTokens);
    const simAddr = bestSimIn(t, addressTokens);
    const best = simCity > simAddr ? simCity : simAddr;
    if (best >= 0.85) {
      score += TOKEN_IN_CITY_OR_ADDRESS;
    } else if (best >= 0.7) {
      score += Math.round(TOKEN_IN_CITY_OR_ADDRESS * (best - 0.6));
    }
  }

  return score;
}
