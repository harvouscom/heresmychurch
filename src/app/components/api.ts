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

export interface NationalReviewStateStats {
  total: number;
  needsReview: number;
  missingAddress: number;
  missingServiceTimes: number;
  missingDenomination: number;
}

export interface NationalReviewStatsResponse {
  states: Record<string, NationalReviewStateStats>;
  totalChurches: number;
  totalNeedsReview: number;
  percentage: number;
  missingAddress: number;
  missingServiceTimes: number;
  missingDenomination: number;
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
  needsModeration?: boolean;
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

export async function fetchNationalReviewStats(): Promise<NationalReviewStatsResponse> {
  const res = await fetchWithRetry(`${BASE_URL}/churches/review-stats`, { headers, timeoutMs: 60000 });
  if (!res.ok) {
    const text = await res.text();
    console.error("Error fetching national review stats:", text);
    throw new Error(`Failed to fetch review stats: ${res.status}`);
  }
  const data = await res.json();
  const totalChurches = data.totalChurches ?? 0;
  return {
    states: data.states ?? {},
    totalChurches,
    totalNeedsReview: data.totalNeedsReview ?? 0,
    percentage: data.percentage ?? 0,
    missingAddress: data.missingAddress ?? 0,
    missingServiceTimes: data.missingServiceTimes ?? 0,
    missingDenomination: data.missingDenomination ?? 0,
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
  field: "name" | "website" | "address" | "attendance" | "denomination" | "serviceTimes" | "languages" | "ministries" | "pastorName" | "phone" | "email" | "homeCampusId",
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
    let msg = `Failed to submit suggestion: ${res.status}`;
    try {
      const errBody = JSON.parse(text) as { error?: string };
      if (errBody?.error) msg = errBody.error;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
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
    needsModeration: data.needsModeration,
  };
}

// ── Community-added churches ──

export interface PendingChurchData {
  id: string;
  shortId?: string;
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
  needsModeration?: boolean;
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
    if (res.status === 429) {
      let msg = "Too many submissions. Please try again later.";
      try {
        const body = JSON.parse(text) as { error?: string };
        if (body?.error) msg = body.error;
      } catch {
        // use default msg
      }
      throw new Error(msg);
    }
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
  state?: string,
  priorityStates?: string[]
): Promise<SearchResponse> {
  let url = `${BASE_URL}/churches/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  if (priorityStates?.length) {
    url += `&priorityStates=${priorityStates.map((s) => s.toUpperCase()).join(",")}`;
  } else if (state) {
    url += `&state=${encodeURIComponent(state.toUpperCase())}`;
  }
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

export async function fetchCommunityStats(stateAbbrev?: string): Promise<CommunityStats> {
  const url = stateAbbrev
    ? `${BASE_URL}/community/stats?state=${encodeURIComponent(stateAbbrev)}`
    : `${BASE_URL}/community/stats`;
  const res = await fetchWithRetry(url, { headers, cache: "no-store" });
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
  myReaction: ReactionType | null;
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
    myReaction: data.myReaction !== undefined ? data.myReaction : reaction,
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

// ── Community-managed alerts ──

async function parseAlertsResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `Alerts API returned invalid JSON (${res.status}): ${text.slice(0, 150)}`
    );
  }
}

export interface CommunityAlert {
  id: string;
  shortLabel: string;
  description: string;
  /** Optional: e.g. "1–2 days", "2 weeks" — shown below the description. */
  estimatedResolution?: string;
  resolved: boolean;
  createdAt?: number;
  source?: "community";
}

export interface AlertsActiveResponse {
  alerts: CommunityAlert[];
  error?: string;
}

export interface AlertCreateProposal {
  id: string;
  shortLabel: string;
  description: string;
  votes: number;
  needed: number;
  myVote: boolean;
  createdAt?: number;
}

export interface AlertResolveProposal {
  alertId: string;
  votes: number;
  needed: number;
  myVote: boolean;
  createdAt?: number;
}

export interface AlertProposalsResponse {
  create: AlertCreateProposal[];
  resolve: AlertResolveProposal[];
  error?: string;
}

export async function fetchActiveAlerts(): Promise<AlertsActiveResponse> {
  const res = await fetchWithRetry(`${BASE_URL}/alerts/active`, {
    headers,
    timeoutMs: 10000,
  });
  if (res.status === 404) return { alerts: [] };
  const data = (await parseAlertsResponse(res)) as AlertsActiveResponse & { error?: string };
  if (!res.ok) throw new Error((data?.error as string) || `Failed to fetch alerts: ${res.status}`);
  return { alerts: Array.isArray(data.alerts) ? data.alerts : [] };
}

export async function fetchAlertProposals(): Promise<AlertProposalsResponse> {
  const res = await fetchWithRetry(`${BASE_URL}/alerts/proposals`, {
    headers,
    timeoutMs: 10000,
  });
  if (res.status === 404) return { create: [], resolve: [] };
  const data = (await parseAlertsResponse(res)) as AlertProposalsResponse & { error?: string };
  if (!res.ok) throw new Error((data?.error as string) || `Failed to fetch alert proposals: ${res.status}`);
  return {
    create: Array.isArray(data.create) ? data.create : [],
    resolve: Array.isArray(data.resolve) ? data.resolve : [],
  };
}

export async function submitCreateAlertProposal(
  shortLabel: string,
  description: string
): Promise<{ success: boolean; proposals: AlertProposalsResponse; promoted?: boolean }> {
  const res = await fetchWithRetry(`${BASE_URL}/alerts/proposals/create`, {
    method: "POST",
    headers,
    body: JSON.stringify({ shortLabel, description }),
    timeoutMs: 10000,
  });
  const data = (await parseAlertsResponse(res)) as { success?: boolean; proposals?: { create?: unknown[]; resolve?: unknown[] }; promoted?: boolean; error?: string };
  if (!res.ok) throw new Error((data?.error as string) || `Failed to propose alert: ${res.status}`);
  return {
    success: data.success,
    proposals: {
      create: Array.isArray(data.proposals?.create) ? data.proposals.create : [],
      resolve: Array.isArray(data.proposals?.resolve) ? data.proposals.resolve : [],
    },
    promoted: data.promoted,
  };
}

export async function voteCreateProposal(
  proposalId: string
): Promise<{ success: boolean; proposals: AlertProposalsResponse; alerts?: CommunityAlert[]; promoted?: boolean }> {
  const res = await fetchWithRetry(`${BASE_URL}/alerts/proposals/create/${encodeURIComponent(proposalId)}/vote`, {
    method: "POST",
    headers,
    timeoutMs: 10000,
  });
  const data = (await parseAlertsResponse(res)) as { success?: boolean; proposals?: { create?: unknown[]; resolve?: unknown[] }; alerts?: CommunityAlert[]; promoted?: boolean; error?: string };
  if (!res.ok) throw new Error((data?.error as string) || `Failed to vote: ${res.status}`);
  return {
    success: data.success,
    proposals: {
      create: Array.isArray(data.proposals?.create) ? data.proposals.create : [],
      resolve: Array.isArray(data.proposals?.resolve) ? data.proposals.resolve : [],
    },
    alerts: Array.isArray(data.alerts) ? data.alerts : undefined,
    promoted: data.promoted,
  };
}

export async function voteResolveProposal(
  alertId: string
): Promise<{ success: boolean; alerts: CommunityAlert[]; proposals: { resolve: AlertResolveProposal[] } }> {
  const res = await fetchWithRetry(`${BASE_URL}/alerts/proposals/resolve`, {
    method: "POST",
    headers,
    body: JSON.stringify({ alertId }),
    timeoutMs: 10000,
  });
  const data = (await parseAlertsResponse(res)) as { success?: boolean; alerts?: CommunityAlert[]; proposals?: { resolve?: AlertResolveProposal[] }; error?: string };
  if (!res.ok) throw new Error((data?.error as string) || `Failed to vote resolve: ${res.status}`);
  return {
    success: data.success,
    alerts: Array.isArray(data.alerts) ? data.alerts : [],
    proposals: { resolve: Array.isArray(data.proposals?.resolve) ? data.proposals.resolve : [] },
  };
}

// ── Moderator API ──

export interface PendingSuggestionItem {
  churchId: string;
  field: string;
  proposedValue: string;
  currentValue: string | null;
  votes: number;
  submissions: { value: string; count: number }[];
  churchName?: string;
  churchCity?: string;
  churchState?: string;
  churchShortId?: string;
}

export interface PendingChurchItem {
  id: string;
  shortId?: string;
  name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  denomination: string;
  attendance: number;
  website: string;
  submittedAt: number;
}

export interface InReviewSuggestionItem {
  churchId: string;
  field: string;
  byMe?: boolean;
}

export interface InReviewChurchItem {
  churchId: string;
  byMe?: boolean;
}

export interface ModeratorPendingResponse {
  pendingSuggestions: PendingSuggestionItem[];
  pendingChurches: PendingChurchItem[];
  inReviewSuggestions?: InReviewSuggestionItem[];
  inReviewChurches?: InReviewChurchItem[];
  error?: string;
}

// Longer timeout for moderate actions (approve/reject can touch large state data).
const MODERATE_ACTION_TIMEOUT_MS = 90000;

export async function fetchModeratorPending(
  moderatorKey: string
): Promise<ModeratorPendingResponse> {
  const res = await fetchWithRetry(
    `${BASE_URL}/moderate/pending?key=${encodeURIComponent(moderatorKey)}`,
    { headers, timeoutMs: 60000 },
    2
  );
  if (res.status === 401) throw new Error("Invalid review key");
  if (!res.ok) throw new Error(`Failed to fetch pending: ${res.status}`);
  return res.json();
}

export async function moderateApproveSuggestion(
  moderatorKey: string,
  churchId: string,
  field: string
): Promise<{ success: boolean }> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/moderate/approve/suggestion?key=${encodeURIComponent(moderatorKey)}`,
    { method: "POST", headers, body: JSON.stringify({ churchId, field }), timeoutMs: MODERATE_ACTION_TIMEOUT_MS }
  );
  if (res.status === 401) throw new Error("Invalid review key");
  if (!res.ok) throw new Error(`Failed to approve: ${res.status}`);
  return res.json();
}

export async function moderateApproveSuggestionWithValue(
  moderatorKey: string,
  churchId: string,
  field: string,
  value: string
): Promise<{ success: boolean }> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/moderate/approve/suggestion?key=${encodeURIComponent(moderatorKey)}`,
    { method: "POST", headers, body: JSON.stringify({ churchId, field, value }), timeoutMs: MODERATE_ACTION_TIMEOUT_MS }
  );
  if (res.status === 401) throw new Error("Invalid review key");
  if (!res.ok) throw new Error(`Failed to approve: ${res.status}`);
  return res.json();
}

export async function moderateRejectSuggestion(
  moderatorKey: string,
  churchId: string,
  field: string
): Promise<{ success: boolean }> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/moderate/reject/suggestion?key=${encodeURIComponent(moderatorKey)}`,
    { method: "POST", headers, body: JSON.stringify({ churchId, field }), timeoutMs: MODERATE_ACTION_TIMEOUT_MS }
  );
  if (res.status === 401) throw new Error("Invalid review key");
  if (!res.ok) throw new Error(`Failed to reject: ${res.status}`);
  return res.json();
}

export async function moderateApproveChurch(
  moderatorKey: string,
  churchId: string
): Promise<{ success: boolean }> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/moderate/approve/church?key=${encodeURIComponent(moderatorKey)}`,
    { method: "POST", headers, body: JSON.stringify({ churchId }), timeoutMs: MODERATE_ACTION_TIMEOUT_MS }
  );
  if (res.status === 401) throw new Error("Invalid review key");
  if (!res.ok) throw new Error(`Failed to approve church: ${res.status}`);
  return res.json();
}

export async function moderateRejectChurch(
  moderatorKey: string,
  churchId: string
): Promise<{ success: boolean }> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/moderate/reject/church?key=${encodeURIComponent(moderatorKey)}`,
    { method: "POST", headers, body: JSON.stringify({ churchId }), timeoutMs: MODERATE_ACTION_TIMEOUT_MS }
  );
  if (res.status === 401) throw new Error("Invalid review key");
  if (!res.ok) throw new Error(`Failed to reject church: ${res.status}`);
  return res.json();
}

export async function addToInReview(
  moderatorKey: string,
  type: "suggestion" | "church",
  churchId: string,
  field?: string
): Promise<{ success: boolean }> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/moderate/in-review/add?key=${encodeURIComponent(moderatorKey)}`,
    { method: "POST", headers, body: JSON.stringify({ type, churchId, ...(type === "suggestion" && field != null ? { field } : {}) }), timeoutMs: MODERATE_ACTION_TIMEOUT_MS }
  );
  if (res.status === 401) throw new Error("Invalid review key");
  if (!res.ok) throw new Error(`Failed to add to in-review: ${res.status}`);
  return res.json();
}

export async function removeFromInReview(
  moderatorKey: string,
  type: "suggestion" | "church",
  churchId: string,
  field?: string
): Promise<{ success: boolean }> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/moderate/in-review/remove?key=${encodeURIComponent(moderatorKey)}`,
    { method: "POST", headers, body: JSON.stringify({ type, churchId, ...(type === "suggestion" && field != null ? { field } : {}) }), timeoutMs: MODERATE_ACTION_TIMEOUT_MS }
  );
  if (res.status === 401) throw new Error("Invalid review key");
  if (!res.ok) throw new Error(`Failed to remove from in-review: ${res.status}`);
  return res.json();
}