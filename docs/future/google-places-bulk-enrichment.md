# Future: Google Places API — Bulk Enrichment of Existing Churches

Use the **Google Places API (new)** to enrich all existing church records with higher-quality data (address, phone, website, opening hours) by matching each church to a Google Place and pulling Place Details. This doc focuses on **bulk enrichment** of the current OSM-sourced dataset; on-demand enrichment at add/edit time is a separate, smaller effort.

## Goal

- **Input:** Existing churches in KV (`churches:{state}`) from OpenStreetMap + ARDA + community corrections.
- **Output:** Same churches with additional or corrected fields filled from Google’s Place data where a confident match is found.
- **Fields to enrich (from Place Details):** `address`, `city` (from address components), `phone`, `website`, and optionally `serviceTimes` (derived from `opening_hours`). Optionally overwrite `name` if we trust Google’s display name more for that match.

## Current Data Context

- **Source:** Overpass (OSM) per state → `parse()` in `supabase/functions/server/index.tsx` builds church objects with name, lat/lng, denomination, attendance, city, address (when `addr:street` exists), website.
- **Gaps:** Many churches have no address, no phone, no website, or incomplete/outdated data. Community corrections and suggestions already fill some of this; bulk enrichment would fill at scale from a single, consistent source (Google).

## What the Places API Provides

Relevant Google Maps Platform APIs:

| API | Purpose | Use in bulk job |
|-----|--------|------------------|
| **Find Place from Text** (or **Place Search – Text Search**) | Get a Place ID from a query like `"First Baptist Church, Des Moines, IA"` | Match our church (name + city/state) to a Place. |
| **Nearby Search** (optional) | Search by lat/lng + type `place_of_worship` (or keyword) | Alternative or disambiguation when text search returns multiple/no results. |
| **Place Details** (new) | Get full details for a Place ID | Fetch formatted_address, geometry, name, international_phone_number, website, opening_hours. |

**Field masks** are critical for cost control: request only the fields you need (e.g. `displayName`, `formattedAddress`, `location`, `internationalPhoneNumber`, `regularOpeningHours`, `websiteUri`). See [Place Details (New) field list](https://developers.google.com/maps/documentation/places/web-service/place-details#fields).

## Matching Strategy (Church → Place)

1. **Primary:** **Find Place from Text** with input like `"{church.name}, {church.city}, {church.state}"` (and optionally `"{church.address}"` if present). Restrict to US (`region: "us"` or equivalent). Take the top result if confidence is high (e.g. types include `place_of_worship` or `establishment` and location is in the same state).
2. **Fallback:** If no result or low confidence, try **Nearby Search** with `location=(church.lat, church.lng)`, `radius=500`, type/keyword for church. Pick closest result within radius if name is similar (normalized string distance or contains).
3. **Dedupe:** One Place ID might match multiple OSM churches (e.g. same church in OSM under two nodes). Keep a cache of `placeId → churchId` (or church ids) to avoid writing the same Place data to multiple records, or to flag duplicates for manual review.
4. **No match:** Leave the church unchanged; optionally write to an `enrichment:no_match` or `enrichment:skipped` list for that state for later review.

## Cost and Free Tier

- **Google Maps Platform** gives a **$200/month** free credit. Places API (new) is billed per request; pricing varies by SKU (e.g. Place Details, Autocomplete).
- **Bulk scale:** One enrichment ≈ 1 Find Place (or Text Search) + 1 Place Details per church. With ~100k–300k+ churches across all states, that’s **200k–600k+ requests** in one full run. At typical per-request rates (e.g. a few cents per Place Details call), a full run can **exceed the free tier** by a large margin.
- **Ways to stay within budget or reduce cost:**
  - **Throttle:** Run enrichment in batches (e.g. one state per day or per week), so monthly request volume stays within a target (e.g. under $200 equivalent).
  - **Prioritize:** Enrich states or churches that need it most first (e.g. missing address or website).
  - **Cache Place IDs:** Store `placeId` (and maybe last fetch time) per church; only call Place Details when we don’t have details yet or when doing a “refresh” run.
  - **Field masks:** Always use minimal field masks on Place Details to reduce cost and latency.
  - **Idempotency:** Support “resume”; skip churches that already have enrichment data (or a `googlePlaceId` and non-stale timestamp).

## Implementation Outline

### 1. Backend job (server-side only)

- **Location:** New Supabase Edge Function or a dedicated script (e.g. `scripts/enrich-churches-from-google.mjs`) that calls the existing server to get church lists and writes enrichment results back. Alternatively, add an admin-only route in `supabase/functions/make-server-283d8046/index.ts` that processes one state at a time (e.g. `POST /admin/enrich/:state` with optional `?dryRun=true`).
- **Secrets:** Store `GOOGLE_MAPS_API_KEY` (or preferred auth) in Supabase secrets; never expose in client.

### 2. Per-state, batched flow

- For a given state, load `churches:{state}` from KV.
- For each church (optionally filter: e.g. missing address or website first):
  - If `enrichment:google:${churchId}` already exists and is recent (e.g. &lt; 90 days), skip or optional refresh.
  - Call Find Place from Text (or Text Search) with `"{name}, {city}, {state}"`.
  - If no Place ID or low confidence, optionally try Nearby Search with (lat, lng).
  - If Place ID found: call Place Details with field mask for name, formattedAddress, location, internationalPhoneNumber, websiteUri, regularOpeningHours.
  - Parse address into street + city + state (use address_components or split formattedAddress); convert opening_hours to a simple `serviceTimes` string if desired.
  - Write result to a stable key, e.g. `enrichment:google:${churchId}` with `{ placeId, fetchedAt, name?, address?, city?, state?, phone?, website?, serviceTimes? }`.

### 3. Rate limiting and robustness

- Respect Google’s rate limits (e.g. 100 QPS for Places; check current docs). Use a queue or sleep between batches (e.g. 50–100 ms between requests).
- Retry with backoff on 429/5xx. On repeated failure for a church, mark as failed and continue.
- Log summary per state: enriched count, no-match count, error count.

### 4. Merging enrichment into app data

Two approaches (pick one or combine):

- **A. Merge at read time (like corrections):** Store enrichments in `enrichment:google:${churchId}`. When serving `GET /churches/:state`, after loading churches and applying `mergeCorrectionsIntoChurches`, apply a second merge from enrichments: for each church, if enrichment exists, overlay non-empty fields (address, city, phone, website, serviceTimes, optionally name). Same pattern as `getApprovedCorrectionsForState` + `mergeCorrectionsIntoChurches` in `server/index.tsx`.
- **B. Write-through:** Periodically or after a full state run, merge enrichment data into the church record (or into the same corrections store). Simpler read path but requires defining “source of truth” (enrichment vs community correction) and conflict resolution.

Recommendation: **A** for clarity (enrichments are a separate layer like corrections) and to avoid overwriting community-submitted data. Optionally only overlay fields that are currently empty in the church record, or prefer enrichment only when the church has no correction for that field.

### 5. Data shape for enrichment cache

Example key: `enrichment:google:${churchId}` (churchId = e.g. `IA-12345`).

```json
{
  "placeId": "ChIJ...",
  "fetchedAt": "2026-03-10T12:00:00Z",
  "name": "First Baptist Church",
  "address": "123 Main St",
  "city": "Des Moines",
  "state": "IA",
  "phone": "+1 515-555-0100",
  "website": "https://firstbaptist.org",
  "serviceTimes": "Sun 10:30 AM; Wed 6:30 PM",
  "confidence": "high"
}
```

Optional: `confidence` (high / low) or `source` (text_search | nearby) for filtering or manual review.

### 6. Converting opening_hours to serviceTimes

Google returns `regularOpeningHours` in a structured format (e.g. periods with day and time). Map to a short, human-readable string similar to existing `serviceTimes` (e.g. `"Sunday 9am, 11am; Wednesday 7pm"`). Keep logic in one place (e.g. `scripts/` or server helper) and document the format so it matches what the UI expects.

## Files to Create or Modify

| File | Purpose |
|------|--------|
| `docs/future/google-places-bulk-enrichment.md` | This doc. |
| `supabase/functions/make-server-283d8046/index.ts` (or new function) | Admin route `POST /admin/enrich/:state` and/or internal helper to fetch Place ID + Place Details; merge enrichment into church response if using read-time merge. |
| `supabase/functions/server/kv_store*.ts` | No schema change; use existing KV. New keys: `enrichment:google:{churchId}`. Optional: `enrichment:no_match:{state}` as array of church ids. |
| `scripts/enrich-churches-from-google.mjs` (optional) | Standalone script that reads state list, calls backend or Google APIs directly, writes enrichment results to KV via server API or direct KV access. |
| `src/app/components/church-data.ts` | No change to `Church` type; enriched fields already exist (address, phone, website, serviceTimes). |
| Server merge logic | Extend the pipeline that builds the response for `GET /churches/:state` to apply enrichment overlay (similar to `mergeCorrectionsIntoChurches`). |

## Risks and Mitigations

| Risk | Mitigation |
|------|-------------|
| **Wrong match** (e.g. different church with same name in same city) | Prefer matches where types include place_of_worship; optionally require lat/lng within ~1 km of our church; store confidence and support manual override or “ignore this enrichment.” |
| **No match** | Expected for many OSM-only or small churches. Log and skip; do not overwrite with empty. |
| **Rate limit / 429** | Throttle (e.g. 10–50 req/s), exponential backoff, and batch over days/weeks. |
| **Cost overrun** | Cap requests per month in the job; use dry-run mode to count; start with one state and monitor billing. |
| **Stale data** | Store `fetchedAt`; optional refresh job that re-runs Place Details for records older than N days (fewer calls than full re-match). |
| **Duplicate Place IDs** | Track which church ids received which Place ID; if same Place ID is assigned to multiple churches, flag for review or attach to only one church. |

## Phased Rollout

1. **Pilot:** One state (e.g. small state with few churches). Run in dry-run to count API calls; then run for real and verify merged output in UI.
2. **Priority states:** Run for states with most “needs review” or missing address/website.
3. **Full run:** All states, throttled to stay within monthly budget; persist progress so the job can resume.
4. **Ongoing:** Optional periodic refresh (e.g. re-fetch Place Details for last 10% of enriched churches per month) to keep phone/website/hours up to date.

## References

- [Places API (new) — Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [Find Place from Text](https://developers.google.com/maps/documentation/places/web-service/search-find-place-from-text)
- [Places API — Usage and Billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
- [Field masks](https://developers.google.com/maps/documentation/places/web-service/place-details#fields) to minimize cost
- Existing merge pattern: `getApprovedCorrectionsForState`, `mergeCorrectionsIntoChurches` in `supabase/functions/server/index.tsx`
