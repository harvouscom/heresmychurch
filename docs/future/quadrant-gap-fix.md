# Fixing Quadrant Data Gaps

## Background

Large states (TX, CA, NY, FL, PA, OH, IL, GA, NC, MI, TN) use a quad-split Overpass query to stay under response limits. If one quadrant's query fails (timeout, 429, 504), that quadrant's churches are silently missing from the final data.

## Symptoms

- A state has noticeably fewer churches than expected
- A geographic region (typically NW, NE, SW, or SE) has no churches on the map
- The populate endpoint returns a lower count than a previous run

## How to fix

Re-populate the affected state with `force=true`. The deploy includes retry logic with longer timeouts (90s query + 500ms pause between quadrants):

```bash
AUTH="Authorization: Bearer <anon-key>"
BASE="https://epufchwxofsyuictfufy.supabase.co/functions/v1/make-server-283d8046/churches/populate"

curl -s -m 300 -X POST "$BASE/<STATE>?force=true" -H "$AUTH" -H "Content-Type: application/json"
```

## States already fixed

| State | Date | Before | After | Notes |
|-------|------|--------|-------|-------|
| IA | 2026-03-11 | 3,964 | 5,174 | NW quadrant recovered ~1,210 churches |
| TX | 2026-03-11 | 14,765 | 16,596 | NW quadrant recovered ~1,831 churches |
| WA | 2026-03-11 | — | 3,492 | NW quadrant recovered |
| TN | 2026-03-11 | — | 11,056 | NW quadrant recovered, 1 community church preserved |

## States to watch

If you notice gaps, check these big states first — they're most likely to have quadrant failures:
- TX, CA, NY, FL, PA, OH, IL, GA, NC, MI, TN

Community-submitted churches are preserved during repopulation (the populate endpoint merges them back from the pending store).
