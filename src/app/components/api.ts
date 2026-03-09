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
}

export async function fetchStates(): Promise<StatesResponse> {
  const res = await fetchWithRetry(`${BASE_URL}/churches/states`, { headers, timeoutMs: 15000 });
  if (!res.ok) {
    const text = await res.text();
    console.error("Error fetching states:", text);
    throw new Error(`Failed to fetch states: ${res.status}`);
  }
  return res.json();
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
  return res.json();
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
  return res.json();
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
  return res.json();
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
  church: PendingChurchData;
  message?: string;
  isDuplicate?: boolean;
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

// ── State Population ──

export interface SearchResult {
  id: string;
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
  return res.json();
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