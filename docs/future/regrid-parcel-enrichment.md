# Regrid Parcel Data Enrichment

## Status: Blocked (Trial Token Limitation)

The Regrid integration code is in place but non-functional because the **trial API token does not include parcel data coverage** for any tested locations. The address API explicitly returns `403: "This area is not included in API trials"` and the point API returns empty results.

## What It Does

Uses Regrid's parcel API to look up building square footage (`ll_bldg_footprint_sqft`) for each church, then estimates attendance from sqft using the formula: `attendance = sqft / 55` (clamped 10-25,000).

## Files

| File | Purpose |
|------|---------|
| `supabase/functions/server/regrid.ts` | Regrid API client (batch + real-time + address fallback) |
| `supabase/functions/make-server-283d8046/regrid.ts` | Identical copy deployed to edge |
| `supabase/functions/server/index.tsx` | `POST /admin/enrich-regrid/:state` endpoint |
| `supabase/functions/make-server-283d8046/index.ts` | Same endpoint (deployed copy) + debug endpoint |

## Endpoint

```
POST /admin/enrich-regrid/:state
```

Enriches all churches in a state with Regrid building sqft data. Returns before/after attendance stats.

## Implementation Details

### Lookup Strategy (3-tier)

1. **Batch API** (`/batch/points`) - Submit all church coordinates at once. Currently returns `401 "No Batch Processing access"` on the trial tier.
2. **Point API with radius** (`/parcels/point?radius=50`) - Fallback. Looks up each church individually with a 50m buffer around the coordinate. Picks the parcel with the largest building footprint from up to 5 results.
3. **Address API** (`/parcels/address`) - Second fallback when point+radius returns nothing and the church has address data. Searches by street address scoped to the state.

### Key Parameters

- `radius=50` on point API (50m buffer to handle geocoding offset from roads/sidewalks)
- `limit=5` to get multiple nearby parcels, then pick largest building sqft
- `return_geometry=false` for performance
- 150ms delay between real-time API calls for rate limiting

### Debug Endpoint

```
GET /admin/regrid-debug?lat=...&lng=...&radius=...&address=...
```

Tests point, address, and typeahead APIs with raw responses. Useful for diagnosing issues with specific coordinates.

## What's Needed to Activate

1. **Upgrade Regrid token** to a paid plan with nationwide parcel coverage
2. Set the new token via `npx supabase secrets set REGRID_TOKEN=<new-token>`
3. Re-run `POST /admin/enrich-regrid/DE` (or any state)
4. Check the `[regrid]` console logs for the first 3 lookups + summary stats

## Test Results (March 2026)

- Delaware (310 churches): 0 enriched, 310 no match
- Root cause: Trial token has no geographic coverage
- Point API returns 200 with empty features (even at 5km radius)
- Address API returns 403: "This area is not included in API trials"
- Batch API returns 401: "No Batch Processing access"

## Pricing Notes

Check https://regrid.com/api for current pricing. Key considerations:
- Need at minimum the point API with nationwide coverage
- Batch API access would speed up bulk enrichment significantly
- Address API provides a useful fallback for imprecise coordinates
