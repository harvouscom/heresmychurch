export const PORTAL_BASE = ((import.meta.env.VITE_HMC_PORTAL_API_BASE_URL as string | undefined) || (import.meta.env.DEV ? 'http://127.0.0.1:8790' : (import.meta.env.VITE_HMC_API_BASE_URL as string | undefined) || 'https://api.heresmychurch.com')).replace(/\/$/, '');
export async function portalRequest(path: string, body?: unknown, signal?: AbortSignal, extraHeaders: Record<string, string> = {}) {
  const response = await fetch(`${PORTAL_BASE}/${path}`, { signal, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to load. Please try again.'); return data;
}
