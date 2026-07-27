# Paid partner API — Polar billing (future)

Turn Here’s My Church’s partner surface (`/v1/*`) into a **paid API product**, billed through [Polar](https://polar.sh) as merchant of record — same stack pattern as Harvous Plus (`harvouscom/harvous`), but a **separate Polar organization** for HMC.

> Companion: [public-api.md](./public-api.md) (current `/v1` contract).  
> Harvous reference: `harvouscom/harvous` → `docs/BILLING_ARCHITECTURE.md`.

---

## Why Polar (and not Stripe)

- **Merchant of record** — Polar handles VAT/GST/sales tax so Testament Made doesn’t register in every jurisdiction for B2C digital API access.
- Already proven for Harvous Plus (checkout, portal, webhooks, sandbox vs live).
- License-key / custom benefits map cleanly onto **per-customer API keys**.

---

## Polar org setup (do this first, no code required)

You do **not** need a second LLC. Create a **second Polar organization** under the same Polar account / Testament Made, LLC legal details.

| | Harvous (existing) | Here’s My Church (new) |
|---|---|---|
| Polar organization | Harvous | Here’s My Church (or `heresmychurch`) |
| Legal seller | Testament Made, LLC | Same |
| Products | Harvous Plus, etc. | HMC API plans |
| OAT / webhooks | Harvous env | HMC env (separate secrets) |
| Sandbox | Separate sandbox org/products | Separate sandbox org/products |

**Why a separate org**

- Customers, invoices, and analytics stay product-scoped.
- Webhooks and OATs never collide with Harvous.
- Checkout / portal branding can say Here’s My Church.
- API key provisioning webhooks only hit the HMC backend.

Same Polar *account*; different *organization*. Reuse Testament Made company info when Polar asks for business identity.

---

## Current state (what exists today)

| Surface | Auth | Who can call |
|---------|------|----------------|
| **Site API** (map UI) | Supabase anon key (public in the client) | Anyone (crowdsourcing by design) |
| **Partner `/v1/*`** | Anon/apikey **plus** `x-partner-key: PARTNER_API_KEY` | Only holders of the shared secret |

Today `/v1` is **one shared key** (`PARTNER_API_KEY` / `HARVOUS_API_KEY`), rate-limited to **120 req/min** per key fingerprint. That is fine for Harvous server-to-server; it is **not** multi-tenant billing.

Paid API work = replace the single shared secret with **per-customer keys** backed by Polar subscriptions, without opening the site API to anonymous bulk scrape.

---

## Pricing recommendation (simple: one plan + overage)

### Product shape

- **No public free plan.** The map stays free; the partner API does not.
- **One paid product:** “HMC API” (monthly + optional annual).
- **Admin-granted access** for chosen partners (Harvous, maybe missions/nonprofit later) — same idea as Harvous Plus admin grants: entitlement without Polar checkout.
- **Included monthly allowance** on the paid plan, then **usage overage** for extra calls (industry-common: base sub + metered overage).

Keep the site map free. Charge only for the stable keyed `/v1` contract.

### Suggested numbers (launch)

| | Recommendation | Notes |
|---|----------------|--------|
| **Base price** | **$19/mo** (or **$190/yr** ≈ 2 months free) | Simple “one SKU” story |
| **Included calls** | **100,000 / month** | Generous for autocomplete-style search; enough for a real product |
| **Overage** | **$0.30 / 1,000 calls** after the included bucket | = $0.0003/call |
| **Rate limit** | **120 req/min** | Matches today’s partner middleware |
| **Keys** | **3 live keys** per customer | Rotate without drama |
| **Admin grant** | Full same limits as paid (or uncapped rate-limit only) | Harvous first-party; not a Polar SKU |

Example bills:

- 40k calls → **$19**
- 100k calls → **$19**
- 250k calls → $19 + (150 × $0.30) = **$64**
- 1M calls → $19 + (900 × $0.30) = **$289**

Still far under Google Places search SKUs; overage only kicks in when they actually load your Edge/KV.

**Cost coverage:** A couple of paying API customers (~$38/mo before Polar fees ≈ mid‑$30s net) already covers a Supabase **Pro** org (~$25/mo) with room left. You do **not** need many subscribers to make the infra math work — the risk is Free-tier caps (below), not underpricing at $19.

### Why overage (and how to keep it fair)

Common pattern: **subscription floor + metered overage** (Twilio, many Maps/Places tiers, OpenAI-style “included then pay”).

Practical rules so it doesn’t feel punitive:

1. **Bill overage in arrears** on the subscription anniversary (or calendar month) from measured usage — not per-request charges that surprise mid-day.
2. **Unit = 1,000 calls**, rounded up at month end (easy invoices).
3. **Soft warning emails** at 80% and 100% of included allowance; don’t silent-charge without a dashboard/email trail.
4. **Optional spend cap** (customer-set): when hit, return `429` instead of running unlimited overage — industry-friendly for indies.
5. **Don’t average “trend” into the price** for v1 — just meter the month. “Average of last 3 months” is for *your* capacity planning, not for what you charge (confusing invoices). If you later want smoothing, offer **committed volume** (Enterprise) instead.

Polar support for metered/usage billing varies by product setup — confirm current Polar “usage” / meter APIs when implementing. Fallback if Polar metered is awkward at build time: **hard cap at included** + “email us to raise limit” until metered lands; or invoice overage manually for the first few customers.

### Admin grants (Harvous-style)

| Recipient | Mechanism | Quota |
|-----------|-----------|--------|
| **Harvous** | `source: admin_grant` entitlement (no Polar checkout) | Same as paid included + overage waived, or higher internal cap |
| Future friends / nonprofit | Same admin grant or Polar 100% coupon | Case by case |

Never list a $0 public Hobby plan — that invites anonymous key farming. Generosity is **intentional grants**, not an open free tier.

### Cost sanity

You’re covering Edge/KV + Polar (~5% + $0.50) + a little margin:

- Base $19 → ~$17–18 net after Polar — comfortable for ≤100k light search calls.
- Overage $0.30/1k → if infra ever costs more than ~$0.05–0.10/1k at scale, raise overage before raising base.
- **2× $19 customers ≈ cover Supabase Pro** for the org (see infra note below).

### Supabase plan (infra prerequisite)

Billing is at the **organization** level. Today’s projects in the same org:

| Project | Ref | Role |
|---------|-----|------|
| Here’s My Church | `epufchwxofsyuictfufy` | Map + Edge Function `make-server-283d8046` + KV |
| Harvous | `mhriprqpyvhjgdssjlfl` | Separate app (shares org Free/Pro limits) |

**Current posture:** Free plan, Micro-class compute. Fine for the public map at modest traffic; **tight** once you sell API access.

| Quota | Free (today) | Pro (~$25/mo org) — do this before/with paid API |
|-------|--------------|--------------------------------------------------|
| Edge Function invocations | **500k / mo**, then throttle | **2M / mo**, then ~**$2 per extra 1M** |
| Egress | **5 GB** | **250 GB** included, then ~$0.09/GB |
| DB / disk | **500 MB** / project | **8 GB** included / project |
| File storage | 1 GB | 100 GB included |
| Active projects | **2** (already at ceiling: HMC + Harvous) | More headroom |
| Idle pause | Can pause after ~1 week inactivity | No pause |
| Backups | Limited | Daily automated (7-day) |
| Support | Community | Email |

**Why this matters for the $19 plan**

- Almost all HMC traffic (map **and** partner `/v1`) is **Edge Function invocations**, not Auth MAUs. Site loads + search + `/v1` share one invocation budget.
- One API customer at the full **100k** included allowance is already **~20%** of Free’s 500k — before the live map and Harvous’s own Edge usage on the same org.
- **2 × $19 customers ≈ cover Pro (~$25/mo)** after Polar fees; upgrade is a prerequisite for reliability, not a reason to raise list price.
- Supabase Edge overage (~$2 / 1M) is cheap next to HMC API overage (**$0.30 / 1k** = $300 / 1M). Heavy API users fund themselves.

**Action before public signup**

1. Upgrade org to **Pro** in the Supabase dashboard (covers both HMC and Harvous projects).
2. Watch **Edge Function invocations** + **egress** in usage — set a reminder when approaching Free/Pro included caps.
3. Keep compute on **Micro** until latency/CPU metrics say otherwise; scale compute separately from plan tier.

Optional later: bump compute above Micro under sustained load; Team plan only if you need finer org/RBAC, not for API v1.

### What not to do

- Multiple public tiers (Starter/Pro/Enterprise SKUs) at launch — add Enterprise only when someone asks.
- Unlimited “fair use” with no meter (abuse magnet).
- Public free API keys.
- Charging for heresmychurch.com map usage.

### Polar catalog (minimal)

Each cadence is its own Polar product (Harvous pattern):

- `HMC API` — monthly — $19  
- `HMC API` — annual — $190  

Meter / overage attached to that subscription (or phase-2 if Polar setup needs it). Admin grants bypass Polar entirely in your entitlement store.

Optional later: **Enterprise** custom quote (SLA, bulk export, committed volume discount) — not a self-serve SKU until needed.

---

## Architecture

```
Polar org "Here's My Church"
  products / checkout / portal / webhooks
        │
        ▼
HMC entitlement store (KV or Postgres)
  customer ↔ polar_customer_id
  subscription ↔ plan / status / quota
  api_keys[] (hashed secrets, prefixes for display)
        │
        ▼
Edge Function `/v1/*` middleware
  validate x-partner-key → resolve customer → check status + rate/quota → next()
```

### Principles (borrow from Harvous)

1. **Gates check entitlements, not Polar product ids inline.**  
   Map `productId → plan/features` in a small registry; runtime checks `status === active` + quota.
2. **Never put Polar OATs or raw API keys in the browser.**  
   Partner keys are server-to-server only (same rule as today’s Harvous integration).
3. **Sandbox ≠ live.** Separate Polar products, OATs, and webhook secrets.
4. **Site API stays public/anon.** Paid gate is only `/v1/*` (and any future public docs site that issues keys).

### Auth evolution for `/v1`

| Phase | Behavior |
|-------|----------|
| **Today** | Single `PARTNER_API_KEY` equality check |
| **Paid v1** | Lookup key hash in store; require active subscription (or admin grant); per-key rate + monthly quota |
| **Migration** | Keep accepting the legacy Harvous env key as a privileged “first-party” key until Harvous moves to a provisioned key |

### Key format

- Generate opaque secrets (e.g. `hmc_live_…` / `hmc_test_…`).
- Store **only hashes** (SHA-256); show full secret once at creation.
- Store a public prefix for dashboard display (`hmc_live_abcd…`).
- Optional: Polar **license key** benefit that we exchange/webhook into our store, *or* we mint keys ourselves on `subscription.active` and show them in an HMC developer portal.

Prefer **HMC-minted keys** + Polar subscription as entitlement source of truth — simpler than teaching Polar license keys to be the bearer credential.

---

## Implementation slices

### 0. Supabase (ops — before charging)

- [ ] Confirm org is on **Free/Micro** today; note baseline Edge invocation + egress usage.
- [ ] Upgrade org to **Pro (~$25/mo)** before opening paid API signup.
- [ ] Verify HMC project `epufchwxofsyuictfufy` no longer subject to idle pause; check Edge quota headroom with map + Harvous sharing the org.

### 1. Polar org + catalog (ops)

- [ ] Create Polar org “Here’s My Church” (live + sandbox).
- [ ] Create HMC API products (monthly + annual) and wire overage/meter if using Polar usage billing.
- [ ] Create Organization Access Tokens (checkout, products, customers, subscriptions, webhooks).
- [ ] Note product ids in env templates (`POLAR_HMC_API_MONTHLY`, `POLAR_HMC_API_ANNUAL`).

### 2. Entitlement + API key store

Pick storage (recommend **Postgres via Supabase** if we want admin SQL; KV is OK for v1):

```
partners / api_customers
  id, email, polar_customer_id, created_at

subscriptions / entitlements
  customer_id, polar_subscription_id, product_id, plan_key,
  status (active|canceled|past_due|…), current_period_end, updated_at

api_keys
  id, customer_id, key_prefix, key_hash, name, created_at, revoked_at,
  last_used_at

usage (optional v1.1)
  customer_id or key_id, window_bucket, request_count
```

### 3. Edge Function changes (`make-server-283d8046`)

- [ ] Replace/extend `/v1/*` middleware: resolve key → customer → entitlement.
- [ ] Keep rate limit; add monthly quota from plan registry.
- [ ] Return `401` invalid key, `402`/`403` inactive subscription, `429` rate/quota.
- [ ] Preserve legacy `PARTNER_API_KEY` as first-party override during migration.
- [ ] Deploy via existing `supabase functions deploy make-server-283d8046`.

### 4. Webhooks

- Endpoint e.g. `POST /…/webhooks/polar` (or Netlify function) verifying Polar signatures (Standard Webhooks, same as Harvous).
- Handle at least: `subscription.created` / `updated` / `active` / `canceled` / `revoked`, and checkout success if needed.
- On activate → ensure customer row + allow key creation (or auto-mint first key).
- On cancel/revoke → mark entitlement inactive (grace period optional).

### 5. Developer-facing UX (minimal)

Thin surface is enough for v1:

- Marketing blurb + pricing on heresmychurch.com (or docs subdomain).
- “Get API access” → Polar checkout (embedded or hosted).
- After pay: page or email with **one** API key + link to [public-api.md](./public-api.md) / future OpenAPI.
- “Manage billing” → Polar customer portal (same idea as Harvous).

No need for a full console on day one; key rotation + second keys can follow.

### 6. Harvous cutover

- [ ] Provision a first-party HMC key for Harvous (or keep env legacy key).
- [ ] Point Harvous `HMC_PARTNER_API_KEY` at the provisioned key when ready.
- [ ] Document that Harvous must never expose the key in the browser (already true).

---

## Env / secrets checklist

| Secret | Where | Notes |
|--------|--------|------|
| `POLAR_ACCESS_TOKEN` (OAT) | HMC server / edge | HMC org only — not Harvous OAT |
| `POLAR_WEBHOOK_SECRET` | Webhook handler | HMC org endpoint |
| `POLAR_*_PRODUCT_*` | Registry | Sandbox vs live ids |
| Per-customer API keys | Generated; hashes in DB | Bearer via `x-partner-key` |
| Legacy `PARTNER_API_KEY` | Edge | Temporary first-party escape hatch |

---

## What not to do

- Don’t put HMC API products inside the **Harvous** Polar org (mixed customers/webhooks).
- Don’t gate the **public map** behind Polar — only `/v1`.
- Don’t use one global shared key forever once third parties pay.
- Don’t ship OATs or partner keys to client bundles.
- Don’t block Harvous on day one of migration — keep legacy key working.

---

## Acceptance checklist (when building)

- [ ] Supabase org on **Pro**; Edge/egress headroom verified with map + sample `/v1` load.
- [ ] New Polar org exists (live + sandbox) under Testament Made.
- [ ] Checkout for HMC API ($19/mo or $190/yr) succeeds; webhook marks entitlement active.
- [ ] Usage past included allowance bills overage (or hard-caps if meter not ready yet).
- [ ] Admin grant for Harvous works without Polar checkout.
- [ ] Customer receives a key; `GET /v1/churches/search` with that key works.
- [ ] Wrong key → `401`; canceled sub → denied; over quota/spend cap → `429`.
- [ ] Legacy Harvous `PARTNER_API_KEY` still works until cutover.
- [ ] Site map (anon API) unchanged for normal visitors.
- [ ] Customer portal lets them update payment method / cancel.

---

## References

- [public-api.md](./public-api.md) — `/v1` routes and Harvous integration notes  
- `supabase/functions/make-server-283d8046/index.ts` — `app.use(\`${P}/v1/*\`, …)` partner middleware  
- Harvous: `docs/BILLING_ARCHITECTURE.md`, `server/utils/polar-*.ts`, `src/lib/billing-plans.ts`  
- Polar: https://polar.sh/docs — orgs, products, checkout, webhooks, OATs  
