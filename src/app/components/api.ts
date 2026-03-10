import { projectId, publicAnonKey } from "/utils/supabase/info";
import type { Church, StateInfo } from "./church-data";

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-283d8046`;

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${publicAnonKey}`,
};

// Fetch with timeout via AbortController
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 30000, ...fetchOpts } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
    return res;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Retry wrapper for network-level failures (TypeError: Failed to fetch)
async function fetchWithRetry(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
  maxRetries: number = 2
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchWithTimeout(url, options);
    } catch (err: any) {
      lastError = err;
      const isNetworkError =
        err instanceof TypeError ||
        err.message?.includes("timed out") ||
        err.message?.includes("Failed to fetch");
      if (!isNetworkError || attempt === maxRetries) throw err;
      const waitMs = (attempt + 1) * 3000;
      console.warn(
        `Network error on attempt ${attempt + 1}/${maxRetries + 1} for ${url}: ${err.message}. Retrying in ${waitMs / 1000}s...`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError;
}

export interface StatesResponse {
  states: StateInfo[];
  totalChurches: number;
  populatedStates: number;
}

export interface ChurchesResponse {
  churches: Church[];
  state: { abbrev: string; name: string; lat: number; lng: number };
  count?: number;
  fromCache?: boolean;
  message?: string;
}

export interface PopulateResponse {
  message?: string;
  count?: number;
  alreadyCached?: boolean;
  error?: string;
}

export interface DenominationsResponse {
  denominations: { name: string; count: number }[];
}

export interface SuggestionConsensus {
  approved: boolean;
  value: string | null;
  votes: number;
  needed: number;
  submissions: { value: string; count: number }[];
}

export interface SuggestionsResponse {
  churchId: string;
  consensus: Record<string, SuggestionConsensus>;
  myVotes: Record<string, string>;
  totalSubmissions: number;
}

export interface SubmitSuggestionResponse {
  success?: boolean;
  field: string;
  consensus: SuggestionConsensus;
  allFields: Record<string, SuggestionConsensus>;
  error?: string;
  applied?: boolean;
}

export async function fetchStates(): Promise<StatesResponse> {
  const res = await fetchWithRetry(`${BASE_URL}/churches/states`, { headers, timeoutMs: 15000 });
  if (!res.ok) {
    const text = await res.text();
    console.error("Error fetching states:", text);
    throw new Error(`Failed to fetch states: ${res.status}`);
  }
  const data = await res.json();
  // Defensive: ensure states is always an array
  return {
    states: Array.isArray(data.states) ? data.states : [],
    totalChurches: data.totalChurches ?? 0,
    populatedStates: data.populatedStates ?? 0,
  };
}

export async function fetchChurches(
  stateAbbrev: string
): Promise<ChurchesResponse> {
  const res = await fetchWithRetry(
    `${BASE_URL}/churches/${stateAbbrev.toUpperCase()}`,
    { headers, timeoutMs: 30000 }
  );
  if (!res.ok) {
    const text = await res.text();
    console.error(`Error fetching churches for ${stateAbbrev}:`, text);
    throw new Error(`Failed to fetch churches: ${res.status}`);
  }
  const data = await res.json();
  // Defensive: ensure churches is always an array
  return {
    churches: Array.isArray(data.churches) ? data.churches : [],
    state: data.state || { abbrev: stateAbbrev, name: stateAbbrev, lat: 0, lng: 0 },
    count: data.count,
    fromCache: data.fromCache,
    message: data.message,
  };
}

export async function populateState(
  stateAbbrev: string,
  force: boolean = false
): Promise<PopulateResponse> {
  const url = `${BASE_URL}/churches/populate/${stateAbbrev.toUpperCase()}${force ? "?force=true" : ""}`;
  // Population can take a very long time for large states (4 quadrant queries)
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers,
    timeoutMs: 300000, // 5 minutes — large states need time for quadrant queries
  }, 3); // up to 3 retries for population
  if (!res.ok) {
    const text = await res.text();
    console.error(`Error populating ${stateAbbrev}:`, text);
    throw new Error(`Failed to populate: ${res.status}`);
  }
  return res.json();
}

export async function fetchDenominations(): Promise<DenominationsResponse> {
  const res = await fetchWithRetry(`${BASE_URL}/churches/denominations/all`, {
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Error fetching denominations:", text);
    throw new Error(`Failed to fetch denominations: ${res.status}`);
  }
  return res.json();
}

// Helper to normalize consensus fields — ensures submissions is always an array
function normalizeConsensus(raw: Record<string, any>): Record<string, SuggestionConsensus> {
  const result: Record<string, SuggestionConsensus> = {};
  for (const [key, val] of Object.entries(raw)) {
    result[key] = {
      approved: val?.approved ?? false,
      value: val?.value ?? null,
      votes: val?.votes ?? 0,
      needed: val?.needed ?? 3,
      submissions: Array.isArray(val?.submissions) ? val.submissions : [],
    };
  }
  return result;
}

export async function fetchSuggestions(
  churchId: string
): Promise<SuggestionsResponse> {
  const res = await fetchWithRetry(
    `${BASE_URL}/suggestions/${encodeURIComponent(churchId)}`,
    { headers }
  );
  if (!res.ok) {
    const text = await res.text();
    console.error(`Error fetching suggestions for ${churchId}:`, text);
    throw new Error(`Failed to fetch suggestions: ${res.status}`);
  }
  const data = await res.json();
  return {
    churchId: data.churchId ?? churchId,
    consensus: data.consensus ? normalizeConsensus(data.consensus) : {},
    myVotes: data.myVotes ?? {},
    totalSubmissions: data.totalSubmissions ?? 0,
  };
}

export async function submitSuggestion(
  churchId: string,
  field: "website" | "address" | "attendance" | "denomination" | "serviceTimes" | "languages" | "ministries" | "pastorName" | "phone" | "email",
  value: string
): Promise<SubmitSuggestionResponse> {
  const res = await fetchWithRetry(`${BASE_URL}/suggestions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ churchId, field, value }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Error submitting suggestion:`, text);
    throw new Error(`Failed to submit suggestion: ${res.status}`);
  }
  const data = await res.json();
  return {
    success: data.success,
    field: data.field ?? field,
    consensus: {
      approved: data.consensus?.approved ?? false,
      value: data.consensus?.value ?? null,
      votes: data.consensus?.votes ?? 0,
      needed: data.consensus?.needed ?? 3,
      submissions: Array.isArray(data.consensus?.submissions) ? data.consensus.submissions : [],
    },
    allFields: data.allFields ? normalizeConsensus(data.allFields) : {},
    error: data.error,
    applied: data.applied,
  };
}

// ── Community-added churches ──

export interface PendingChurchData {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  denomination: string;
  attendance: number;
  website: string;
  approved: boolean;
  verificationCount: number;
  needed: number;
  myVerification: boolean;
  submittedAt: number;
}

export interface PendingChurchesResponse {
  state: string;
  churches: PendingChurchData[];
}

export interface AddChurchResponse {
  success: boolean;
  church?: PendingChurchData;
  message?: string;
  isDuplicate?: boolean;
  /** When isDuplicate is true and the match was in main (not pending) data. */
  existingChurch?: { id: string; shortId?: string; name: string; city?: string; state: string };
}

export interface VerifyChurchResponse {
  success: boolean;
  church: PendingChurchData;
  message?: string;
  alreadyVerified?: boolean;
}

export async function fetchPendingChurches(
  stateAbbrev: string
): Promise<PendingChurchesResponse> {
  const res = await fetchWithRetry(
    `${BASE_URL}/churches/pending/${stateAbbrev.toUpperCase()}`,
    { headers }
  );
  if (!res.ok) {
    const text = await res.text();
    console.error(`Error fetching pending churches for ${stateAbbrev}:`, text);
    throw new Error(`Failed to fetch pending churches: ${res.status}`);
  }
  return res.json();
}

export async function addChurch(data: {
  name: string;
  address?: string;
  city?: string;
  state: string;
  lat: number;
  lng: number;
  denomination?: string;
  attendance?: number;
  website?: string;
  serviceTimes?: string;
  languages?: string[];
  ministries?: string[];
  pastorName?: string;
  phone?: string;
  email?: string;
}): Promise<AddChurchResponse> {
  const res = await fetchWithRetry(`${BASE_URL}/churches/add`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Error adding church:`, text);
    throw new Error(text || `Failed to add church: ${res.status}`);
  }
  return res.json();
}

export async function verifyChurch(
  pendingId: string
): Promise<VerifyChurchResponse> {
  const res = await fetchWithRetry(
    `${BASE_URL}/churches/verify/${encodeURIComponent(pendingId)}`,
    { method: "POST", headers }
  );
  if (!res.ok) {
    const text = await res.text();
    console.error(`Error verifying church:`, text);
    throw new Error(text || `Failed to verify church: ${res.status}`);
  }
  return res.json();
}

// ── Pending Suggestions (corrections needing more votes) ──

export interface PendingSuggestionField {
  votes: number;
  needed: number;
  topValue: string;
  submissions: { value: string; count: number }[];
}

export interface PendingSuggestion {
  churchId: string;
  fields: Record<string, PendingSuggestionField>;
}

export interface PendingSuggestionsResponse {
  state: string;
  pending: PendingSuggestion[];
}

export async function fetchPendingSuggestions(
  stateAbbrev: string
): Promise<PendingSuggestionsResponse> {
  const res = await fetchWithRetry(
    `${BASE_URL}/suggestions/pending/${stateAbbrev.toUpperCase()}`,
    { headers }
  );
  if (!res.ok) {
    const text = await res.text();
    console.error(`Error fetching pending suggestions for ${stateAbbrev}:`, text);
    throw new Error(`Failed to fetch pending suggestions: ${res.status}`);
  }
  const data = await res.json();
  return {
    state: data.state ?? stateAbbrev.toUpperCase(),
    pending: Array.isArray(data.pending) ? data.pending : [],
  };
}

// ── State Population ──

export interface SearchResult {
  id: string;
  shortId?: string;
  name: string;
  city: string;
  state: string;
  denomination: string;
  attendance: number;
  lat: number;
  lng: number;
  address: string;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  statesSearched?: number;
  stateFilter?: string[];
  message?: string;
}

export async function searchChurches(
  query: string,
  limit: number = 10,
  state?: string
): Promise<SearchResponse> {
  let url = `${BASE_URL}/churches/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  if (state) url += `&state=${encodeURIComponent(state.toUpperCase())}`;
  const res = await fetchWithRetry(url, { headers, timeoutMs: 15000 });
  if (!res.ok) {
    const text = await res.text();
    console.error("Error searching churches:", text);
    throw new Error(`Search failed: ${res.status}`);
  }
  const data = await res.json();
  // Defensive: ensure results is always an array
  return {
    results: Array.isArray(data.results) ? data.results : [],
    query: data.query ?? query,
    statesSearched: data.statesSearched,
    stateFilter: data.stateFilter,
    message: data.message,
  };
}

// ── Community stats & confirmation ──

export interface CommunityStats {
  totalCorrections: number;
  churchesImproved: number;
  totalConfirmations: number;
  lastUpdated: number | null;
}

export interface CorrectionHistoryEntry {
  churchId: string;
  field: string;
  value: string;
  appliedAt: number;
}

export async function confirmChurchData(churchId: string): Promise<{ success: boolean; alreadyConfirmed?: boolean; totalConfirmations?: number }> {
  const res = await fetchWithRetry(`${BASE_URL}/churches/confirm/${encodeURIComponent(churchId)}`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error(`Failed to confirm: ${res.status}`);
  return res.json();
}

export async function fetchCommunityStats(): Promise<CommunityStats> {
  const res = await fetchWithRetry(`${BASE_URL}/community/stats`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
  return res.json();
}

export async function fetchCorrectionHistory(churchId: string): Promise<{ churchId: string; history: CorrectionHistoryEntry[] }> {
  const res = await fetchWithRetry(`${BASE_URL}/community/history/${encodeURIComponent(churchId)}`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch history: ${res.status}`);
  return res.json();
}

// ── Church reactions (Netflix-style thumbs) ──

export type ReactionType = "not_for_me" | "like" | "love";

export interface ReactionCounts {
  not_for_me: number;
  like: number;
  love: number;
}

export interface ReactionsResponse {
  churchId: string;
  myReaction: ReactionType | null;
  counts: ReactionCounts;
  error?: string;
}

export interface SubmitReactionResponse {
  success: boolean;
  myReaction: ReactionType;
  counts: ReactionCounts;
  error?: string;
}

export async function fetchReactions(churchId: string): Promise<ReactionsResponse> {
  const res = await fetchWithRetry(
    `${BASE_URL}/churches/reactions/${encodeURIComponent(churchId)}`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to fetch reactions: ${res.status}`);
  const data = await res.json();
  return {
    churchId: data.churchId ?? churchId,
    myReaction: data.myReaction ?? null,
    counts: data.counts ?? { not_for_me: 0, like: 0, love: 0 },
    error: data.error,
  };
}

export async function submitReaction(
  churchId: string,
  reaction: ReactionType
): Promise<SubmitReactionResponse> {
  const res = await fetchWithRetry(
    `${BASE_URL}/churches/react/${encodeURIComponent(churchId)}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ reaction }),
    }
  );
  if (!res.ok) throw new Error(`Failed to submit reaction: ${res.status}`);
  const data = await res.json();
  return {
    success: data.success ?? true,
    myReaction: data.myReaction ?? reaction,
    counts: data.counts ?? { not_for_me: 0, like: 0, love: 0 },
    error: data.error,
  };
}

export interface ReactionsBulkResponse {
  state: string;
  counts: Record<string, ReactionCounts>;
  error?: string;
}

export async function fetchReactionsBulk(stateAbbrev: string): Promise<ReactionsBulkResponse> {
  const res = await fetchWithRetry(
    `${BASE_URL}/churches/reactions/bulk?state=${encodeURIComponent(stateAbbrev.toUpperCase())}`,
    { headers, timeoutMs: 20000 }
  );
  if (!res.ok) throw new Error(`Failed to fetch reactions bulk: ${res.status}`);
  const data = await res.json();
  return {
    state: data.state ?? stateAbbrev.toUpperCase(),
    counts: data.counts ?? {},
    error: data.error,
  };
}

export interface PopulationResponse {
  populations: Record<string, number>;
  source: string;
}

export async function fetchStatePopulations(): Promise<PopulationResponse> {
  const res = await fetchWithRetry(`${BASE_URL}/population`, {
    headers,
    timeoutMs: 15000,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Error fetching state populations:", text);
    throw new Error(`Failed to fetch populations: ${res.status}`);
  }
  return res.json();
}