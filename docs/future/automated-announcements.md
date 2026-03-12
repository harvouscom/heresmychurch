# Future: Automated Announcements & Alerts

Announcements and static alerts are currently hardcoded TypeScript arrays (`src/app/config/announcements.ts`, `src/app/config/pendingAlerts.ts`). Every change requires a code edit and redeploy. This doc covers moving them to the existing KV store with an admin UI in the moderator dashboard, date-based auto-expiry, and eventually event-driven announcements.

## Problem

- **Announcements** — fully static `Announcement[]` in config. Two entries today (multi-campus support, reactions). Adding or removing one means editing code and redeploying.
- **Static alerts** — same pattern in `pendingAlerts.ts`. Community alerts are already dynamic via API + KV store, but the seed/admin alerts are hardcoded.
- **No expiry** — old announcements stay forever unless manually deleted from the array.
- **No preview** — can't draft an announcement and schedule it for later without a deploy.

## Data Model

Reuse the existing `kv_store_283d8046` table (same as alerts, sponsors, etc.). No schema migration needed.

**`announcements:active`** — Array of currently live announcements:

```json
[
  {
    "id": "multi-campus",
    "title": "Multi-campus support",
    "body": "You can now link churches to a main campus...",
    "startDate": "2025-03-12T00:00:00Z",
    "endDate": "2025-04-12T00:00:00Z",
    "createdAt": "2025-03-12T08:00:00Z",
    "createdBy": "moderator"
  }
]
```

**`announcements:drafts`** — Scheduled announcements not yet visible (optional, Phase 2):

```json
[
  {
    "id": "summer-data-refresh",
    "title": "Summer data refresh",
    "body": "We're updating attendance numbers for all 50 states...",
    "startDate": "2025-06-01T00:00:00Z",
    "endDate": "2025-06-15T00:00:00Z",
    "createdAt": "2025-05-20T10:00:00Z",
    "createdBy": "moderator"
  }
]
```

**`alerts:static`** — Admin-managed alerts (replacing the hardcoded `pendingAlerts` array):

```json
[
  {
    "id": "ia-tx-nw-quadrant",
    "shortLabel": "Data gap: IA & TX NW quadrants",
    "description": "After improving church attendance data accuracy...",
    "estimatedResolution": "1-2 days",
    "resolved": false,
    "createdAt": "2025-03-08T00:00:00Z"
  }
]
```

Fields added vs. current interface:
- `startDate` / `endDate` — for auto-expiry and scheduling
- `createdAt` / `createdBy` — audit trail
- `endDate` is optional — omit it for announcements that stay until manually removed

## API Routes

New Hono routes in `supabase/functions/make-server-283d8046/index.ts`, protected by the existing `checkModKey()` middleware:

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `GET` | `/announcements/active` | Public | Fetch currently active announcements (filtered by date server-side) |
| `GET` | `/announcements/all` | Mod key | List all announcements including drafts, expired, and active |
| `POST` | `/announcements/create` | Mod key | Create a new announcement (active or scheduled) |
| `PUT` | `/announcements/:id` | Mod key | Edit title, body, or dates |
| `DELETE` | `/announcements/:id` | Mod key | Remove an announcement |
| `GET` | `/alerts/static` | Public | Fetch admin-managed alerts (replacing hardcoded array) |
| `POST` | `/alerts/static` | Mod key | Create a new static alert |
| `PUT` | `/alerts/static/:id` | Mod key | Edit or resolve a static alert |
| `DELETE` | `/alerts/static/:id` | Mod key | Remove a static alert |

The public `GET /announcements/active` endpoint filters server-side:

```
return announcements.filter(a =>
  new Date(a.startDate) <= now &&
  (!a.endDate || new Date(a.endDate) > now)
);
```

This means the frontend just fetches and renders — no client-side date logic needed.

## Frontend Changes

### `AnnouncementsPill.tsx`

Replace the static import:

```diff
- import { announcements } from "../config/announcements";
+ const [announcements, setAnnouncements] = useState<Announcement[]>([]);
+ useEffect(() => { fetchActiveAnnouncements().then(setAnnouncements); }, []);
```

Same for `PendingAlertsPill.tsx` — replace the hardcoded `pendingAlerts` import with a fetch from `/alerts/static`, merged with the existing community alerts.

### `ModeratorDashboard.tsx` — New "Announcements" Tab

Add a tab/section to the existing moderator dashboard alongside "Field Corrections" and "New Churches". This keeps all admin actions in one bookmarkable URL (`/moderate?key=SECRET`).

```
+------------------------------------------+
|  Moderation Queue          [Refresh]     |
|  [Corrections] [Churches] [Announcements]|
|------------------------------------------|
|  ACTIVE ANNOUNCEMENTS (2)                |
|  ┌──────────────────────────────────────┐|
|  │ Multi-campus support                 │|
|  │ Mar 12 – Apr 12, 2025               │|
|  │                          [Edit] [Del]│|
|  └──────────────────────────────────────┘|
|                                          |
|  SCHEDULED (1)                           |
|  ┌──────────────────────────────────────┐|
|  │ Summer data refresh                  │|
|  │ Starts Jun 1, 2025 (in 81 days)     │|
|  │                          [Edit] [Del]│|
|  └──────────────────────────────────────┘|
|                                          |
|  [+ New Announcement]                    |
|                                          |
|  STATIC ALERTS (1)                       |
|  ┌──────────────────────────────────────┐|
|  │ ⚠ Data gap: IA & TX NW quadrants    │|
|  │ Est: 1-2 days                        │|
|  │                   [Resolve] [Edit]   │|
|  └──────────────────────────────────────┘|
|                                          |
|  [+ New Alert]                           |
+------------------------------------------+
```

The create/edit form is simple: title, body (textarea), start date, end date (optional), and a preview showing how it'll look in the `AnnouncementsPill`.

## Auto-Expiry

The `/announcements/active` endpoint handles expiry by filtering on dates. No cron job needed for the MVP — expired announcements simply stop appearing in API responses.

For cleanup (optional, Phase 3): a `pg_cron` job or periodic admin endpoint that moves expired announcements to an `announcements:archived` key to keep the active list lean.

## Alert Automation (Phase 3)

Extend the existing community alerts system:

- **Auto-resolve stale alerts:** If a community alert has had a resolve proposal with enough votes for 7+ days, auto-resolve it.
- **Auto-promote proposals:** If a create proposal hits 2x the normal vote threshold, auto-promote to active without moderator intervention.
- **Configurable thresholds:** Store in a `alerts:config` KV key so they can be tuned from the admin UI.

## Event-Driven Announcements (Phase 4)

Auto-generate announcements from data events. These would be created as drafts requiring moderator approval before going live:

- **New state added** — "We just added [State]! Explore [X] churches."
- **Milestone crossed** — "We've mapped 100,000 churches across America."
- **Feature launches** — triggered by a deploy hook or manual flag
- **Data quality alerts** — auto-create an alert when a data pipeline detects gaps

Implementation: add a `POST /announcements/auto-draft` internal endpoint that other server functions call. Drafts show up in the mod dashboard for review before publishing.

## Phased Rollout

### Phase 1 — KV + API + Mod Dashboard Tab (MVP)
- Add announcement CRUD endpoints to the Hono server
- Add static alert CRUD endpoints
- Add "Announcements" tab to `ModeratorDashboard.tsx` with create/edit/delete
- Update `AnnouncementsPill.tsx` and `PendingAlertsPill.tsx` to fetch from API
- Migrate existing hardcoded announcements and alerts to KV store
- Delete `src/app/config/announcements.ts` and simplify `src/app/config/pendingAlerts.ts`

### Phase 2 — Scheduling + Drafts
- Add `startDate` scheduling (announcement visible only after start date)
- Drafts list in mod dashboard with "Publish Now" action
- Preview rendering in the create/edit form

### Phase 3 — Auto-Expiry Cleanup + Alert Automation
- `pg_cron` or admin endpoint to archive expired announcements
- Auto-resolve and auto-promote community alerts based on vote thresholds
- Configurable thresholds in mod dashboard

### Phase 4 — Event-Driven
- Internal auto-draft endpoint
- Hooks from data pipeline and deploy process
- Mod dashboard shows auto-drafted announcements for approval

## Files to Modify/Create

**Phase 1:**
- `supabase/functions/make-server-283d8046/index.ts` — Add announcement + static alert CRUD routes
- `src/app/components/ModeratorDashboard.tsx` — Add announcements/alerts tab with CRUD UI
- `src/app/components/api.ts` — Add API client functions for announcement + static alert endpoints
- `src/app/components/AnnouncementsPill.tsx` — Fetch from API instead of static import
- `src/app/components/PendingAlertsPill.tsx` — Fetch static alerts from API, merge with community alerts
- `src/app/config/announcements.ts` — Delete after migration
- `src/app/config/pendingAlerts.ts` — Simplify (keep `reportIssueEnabled` config, remove hardcoded array)

## Open Questions

- **Notification for new announcements?** Currently `AnnouncementsPill` shows a count badge. Should the mod dashboard trigger a "new" indicator so returning users notice fresh announcements?
- **Rich text?** Current announcements are plain text with no formatting. Worth supporting basic markdown or keeping it simple?
- **Alert-to-announcement?** When a major community alert is resolved, auto-draft an announcement like "Resolved: [alert description]"?
