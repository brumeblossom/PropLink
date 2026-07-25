# PropLink — Product Requirements Document (MVP)

**Purpose of this document:** This PRD is written to be ingested by an AI coding agent (e.g. Claude Code, Antigravity) as the source of truth for implementation. It is structured for machine parsing first, human review second. Every feature has explicit, testable acceptance criteria. Do not infer scope beyond what is written here — flag ambiguity rather than assume.

---

## 1. Product Overview

PropLink is a multi-tenant SaaS platform for landlords and property managers overseeing multiple properties (residential, commercial, or mixed) across multiple locations. It replaces spreadsheets, WhatsApp groups, and manual follow-ups with a structured system for tracking leases, logging payments, and communicating with tenants.

**MVP scope locked in:**
- Payment tracking is **manual** (landlord logs payments as received). No payment gateway integration in this phase. Schema must accommodate a future gateway (e.g. Paystack) without a breaking migration.
- Rent reminders and notices deliver via **in-app, email, and WhatsApp**. No SMS in MVP.
- Two roles only: **landlord** and **tenant**. No staff/property-manager sub-role in MVP.

**Explicitly out of scope for MVP:** online rent payment/collection, staff accounts with scoped permissions, maintenance ticket workflow (beyond free-text chat), multi-currency support, mobile native apps (responsive web only).

---

## 2. User Roles & Permissions

| Capability | Landlord | Tenant |
|---|---|---|
| Create/edit properties and units | ✅ | ❌ |
| Create/edit leases | ✅ | ❌ |
| View own lease(s) | N/A (views all) | ✅ (own only) |
| Log a payment | ✅ (auto-confirmed) | ✅ (goes in as `pending` until landlord confirms) |
| Attach proof of payment | ✅ | ✅ |
| Confirm/reject a pending payment | ✅ | ❌ |
| Acknowledge / flag a payment logged by the other party | ✅ (on tenant-logged entries) | ✅ (on landlord-logged entries) |
| View payment history | ✅ (all units) | ✅ (own unit only) |
| Upload lease documents | ✅ | ❌ (view/download only) |
| Send notices/broadcasts | ✅ | ❌ (receive only) |
| Chat | ✅ (with any of their tenants) | ✅ (with their landlord only, scoped to their unit) |
| Onboard a new tenant to a unit | ✅ (generates invite code) | ✅ (redeems code to link account) |

Row-level isolation: a landlord can only ever see data belonging to units/properties they own. A tenant can only ever see data belonging to their own active/historical lease(s). This must be enforced at the database layer (Postgres RLS), not only in application logic.

---

## 3. User Stories & Acceptance Criteria

### Epic A — Landlord: Property & Unit Management

**A1. As a landlord, I can create a property so that I can group units under a physical location.**
- AC1: Form requires: property name, address, city/state, property type (`residential` | `commercial` | `mixed`).
- AC2: Property appears immediately in the landlord's property list after creation, no page reload required.
- AC3: A landlord cannot see another landlord's properties under any circumstance, including via direct URL manipulation of a property ID.

**A2. As a landlord, I can add units to a property so that I can track individual leasable spaces.**
- AC1: Form requires: unit number/name, unit type (`flat` | `shop` | `office`), and optional size.
- AC2: A unit's status is automatically derived (`vacant` | `occupied`) based on whether it has an active lease — this is not a manually set field.
- AC3: Deleting a property with active leases is blocked; the UI must show why and list the blocking leases.

**A3. As a landlord, I want a multi-unit dashboard segmented by property so that I can see everything at a glance.**
- AC1: Dashboard groups units visually by property (e.g. "Alaba Plaza — Block B" as a section header).
- AC2: Each unit card shows: tenant name (or "vacant"), lease status, next rent due date (if applicable).
- AC3: Dashboard supports filtering by property type and by lease status (active / expiring within 30 days / expired / vacant).

### Epic B — Lease Lifecycle

**B1. As a landlord, I can create a lease for a unit so that I can formally record a tenancy.**
- AC1: Required fields: tenant (existing or invite-new), start date, end date, rent amount, rent frequency (`monthly` | `quarterly` | `annually`), deposit amount.
- AC2: A unit cannot have two overlapping active leases — the system must reject this with a clear error identifying the conflicting lease.
- AC3: Creating a lease for a unit that has no linked tenant yet generates a one-time invite code the landlord can share.

**B2. As a landlord, I want a visual timeline of each lease so I can see where it stands in its lifecycle.**
- AC1: Timeline shows: start date, current date marker, end date, and a highlighted "renewal window" (default: last 60 days before end date, configurable per lease).
- AC2: Lease status is computed, not manually set: `active` (today between start/end, outside renewal window) → `renewal_due` (today inside renewal window) → `expired` (today past end date and not renewed/terminated).
- AC3: An expired lease automatically flips its unit's status to `vacant` unless a renewal lease already exists.

**B3. As a landlord, I can upload signed lease documents so tenants have access to their agreement.**
- AC1: Accepts PDF and image formats, max 10MB.
- AC2: Uploaded document is immediately visible to the linked tenant in their Digital Lease Wallet.
- AC3: Documents are stored with access control — a signed URL expires and is scoped to the requesting user's permission.

### Epic C — Payments (Manual Tracking, Dual-Party, Mutual Accountability)

Design principle: **both parties can log a payment and attach proof, and both parties can react to a payment logged by the other — but the party actually receiving the money is the authoritative source for whether it counts toward outstanding balance and reminders.** A landlord logging a payment is confirmed immediately (they received it — no permission needed). A tenant logging a payment is a claim that needs landlord confirmation before it's authoritative. This avoids two symmetric failure modes: a tenant falsely logging a payment to dodge reminders, and — if we required tenant sign-off on landlord entries — a landlord's real, received payment sitting "unconfirmed" and triggering false reminders just because the tenant hasn't tapped a button.

**C1. As a landlord, I can log a payment against a lease so I can track what's been paid.**
- AC1: Required fields: amount, payment date, period covered (start/end), payment method (`cash` | `bank_transfer` | `cheque` | `other`), optional notes, optional proof-of-payment attachment.
- AC2: A payment logged by a landlord is created with status `confirmed` immediately — no separate confirmation step, since the landlord is the party receiving the money.
- AC3: Logged payment immediately appears in both the landlord's ledger view and the tenant's payment history, regardless of status.
- AC4: The system computes and displays "amount outstanding" for the current rent period based on rent amount vs. sum of **confirmed** payments for that period only — this is a derived value, never manually entered, and pending payments do not reduce it.

**C2. As a tenant, I can log a payment I've made, with proof, so my landlord is notified and it's on record.**
- AC1: Same required fields as C1, plus a proof-of-payment attachment (screenshot, receipt, PDF) which is strongly encouraged but not blocking — a tenant can submit without proof if needed.
- AC2: A payment logged by a tenant is created with status `pending` — visible to both parties immediately, clearly labeled as awaiting confirmation, but does not reduce outstanding balance or suppress rent reminders until confirmed.
- AC3: The landlord receives an in-app notification when a tenant logs a pending payment, including a direct link to the attached proof if one was provided.

**C3. As a landlord, I can confirm or reject a tenant-logged payment so the record reflects reality.**
- AC1: Confirming sets status to `confirmed`, timestamps who confirmed it, and immediately recalculates the tenant's outstanding balance.
- AC2: Rejecting sets status to `disputed`, requires a short reason, notifies the tenant — the payment remains visible in history (never deleted) but is permanently excluded from outstanding-balance calculations.
- AC3: A pending payment never blocks or delays a scheduled rent reminder from firing (per D2) — only a confirmed payment does.

**C4. As a tenant, I can acknowledge or flag a payment my landlord logged, so there's a record if something's wrong.**
- AC1: Every landlord-logged payment shows an "Acknowledge" and a "Flag as incorrect" action to the linked tenant.
- AC2: Acknowledging stamps `counter_verified_by`/`counter_verified_at` — purely a trust-building record, has no effect on the payment's `confirmed` status or the outstanding balance calculation.
- AC3: Flagging requires a short reason (e.g. wrong amount, wrong date, never received), sets a `disputed_by_tenant` flag and notifies the landlord — it does NOT change the payment's authoritative status automatically (the landlord received the money and remains the source of truth), but it's visibly surfaced on the landlord's ledger as needing resolution.

**C5. As a landlord, I can resolve a tenant-flagged dispute on my own logged payment.**
- AC1: A flagged payment shows a resolve action to the landlord: edit the payment's details (amount/date/method) or void it entirely.
- AC2: Voiding a payment does not delete the row — it sets status to `disputed` and excludes it from outstanding-balance calculations, same as a rejected tenant-logged payment.
- AC3: Editing a flagged payment clears the `disputed_by_tenant` flag and notifies the tenant of the correction.

**C6. As a tenant, I can see my payment history and upcoming due date so I know where I stand.**
- AC1: Payment history shows every payment regardless of who logged it, each clearly labeled `confirmed` / `pending` / `disputed`, with proof attachments viewable inline where present.
- AC2: Next due date and outstanding balance are calculated from **confirmed** payments only, and are visually flagged if within 7 days or overdue.

### Epic D — Notices & Reminders

**D1. As a landlord, I can send a notice to one unit, one property, or all my properties.**
- AC1: Notice has: title, body, type (`rent_reminder` | `maintenance` | `general` | `rent_increment`), and delivery channels (any combination of in-app, email, WhatsApp).
- AC2: Sending a notice to "all units in property X" fans out to every tenant currently linked to an active lease in that property — vacant units are excluded.
- AC3: Delivery status per channel per recipient is tracked and viewable by the landlord (sent / delivered / failed) — not just "sent" as a single flag.

**D2. As the system, I automatically remind tenants before rent is due, without landlord action.**
- AC1: A scheduled job runs daily and identifies leases where the next due date falls within a configurable reminder window (default: 7 days and 1 day before due date).
- AC2: Reminder is sent via in-app notification, email, and WhatsApp for each identified lease, exactly once per reminder threshold (no duplicate sends if the job runs more than once a day).
- AC3: If a **confirmed** payment covering the due period exists before the reminder threshold, that reminder is skipped. A `pending` (tenant-logged, unconfirmed) payment does NOT skip the reminder — per Epic C, only a landlord-confirmed payment is authoritative.

### Epic E — Communication

**E1. As a landlord, I can chat with a specific tenant about their specific unit.**
- AC1: Each unit with an active lease has exactly one conversation thread between the landlord and the current tenant.
- AC2: Chat history persists across lease renewals for the same tenant/unit but is not visible to a new tenant if the unit changes hands.
- AC3: New messages appear in real time without a page refresh for both parties.

**E2. As a tenant, I can message my landlord to report an issue or ask a question.**
- AC1: Tenant can only initiate/view the conversation tied to their own active lease.
- AC2: Unread message count is visible to both parties in their respective dashboards/portals.

### Epic F — Tenant Onboarding

**F1. As a tenant, I can create an account and link myself to my landlord and unit using an invite code.**
- AC1: Signup requires: name, email or phone, password, and a valid invite code.
- AC2: An invalid or already-redeemed invite code shows a clear error and does not create a dangling account.
- AC3: On successful redemption, the tenant is immediately taken to their unit's dashboard showing lease summary, no additional setup step required.

---

## 4. Database Schema

Target: PostgreSQL. Notes on design intent are inline; exact Prisma schema to be generated in the implementation phase.

```
users
  id              uuid PK
  email           text unique
  phone           text unique nullable
  password_hash   text            -- managed via Supabase Auth; may be redundant depending on auth provider config
  role            enum('landlord','tenant')
  full_name       text
  created_at      timestamptz
  updated_at      timestamptz

properties
  id              uuid PK
  landlord_id     uuid FK -> users.id
  name            text
  address         text
  city            text
  state           text
  property_type   enum('residential','commercial','mixed')
  created_at      timestamptz

units
  id              uuid PK
  property_id     uuid FK -> properties.id
  unit_number     text
  unit_type       enum('flat','shop','office')
  size_sqm        numeric nullable
  created_at      timestamptz
  -- status is NOT stored; derived from leases at query time

leases
  id                    uuid PK
  unit_id               uuid FK -> units.id
  tenant_id             uuid FK -> users.id (role='tenant')
  start_date            date
  end_date              date
  rent_amount           numeric
  rent_frequency        enum('monthly','quarterly','annually')
  deposit_amount        numeric nullable
  renewal_window_days   int default 60
  document_url          text nullable   -- Supabase Storage signed reference
  terminated_at         timestamptz nullable
  created_at            timestamptz
  updated_at            timestamptz
  -- CONSTRAINT: no two leases for the same unit_id may have overlapping [start_date, end_date] ranges
  --             unless one is terminated

payments
  id                    uuid PK
  lease_id              uuid FK -> leases.id
  amount                numeric
  payment_date          date
  period_start          date
  period_end            date
  method                enum('cash','bank_transfer','cheque','other')
  recorded_by           uuid FK -> users.id      -- either the landlord or the tenant on the lease
  recorded_by_role      enum('landlord','tenant') -- denormalized for fast filtering/display, must match recorded_by's role
  status                enum('confirmed','pending','disputed')
  -- landlord-logged rows are created with status='confirmed' immediately (C1/AC2)
  -- tenant-logged rows are created with status='pending' (C2/AC2) and require landlord action (C3)
  confirmed_by          uuid FK -> users.id nullable  -- landlord who confirmed/rejected a tenant-logged payment
  confirmed_at          timestamptz nullable
  dispute_reason        text nullable              -- set when landlord rejects a tenant-logged payment (C3/AC2) or voids their own (C5/AC2)
  proof_url             text nullable              -- Supabase Storage signed reference; either party may attach (C1/AC1, C2/AC1)
  -- mutual accountability fields for the non-recording party's reaction (C4):
  counter_verified_by   uuid FK -> users.id nullable  -- tenant who acknowledged a landlord-logged payment
  counter_verified_at   timestamptz nullable
  disputed_by_tenant    boolean default false          -- tenant flagged a landlord-logged payment as incorrect (C4/AC3)
  disputed_by_reason    text nullable                  -- required when disputed_by_tenant is set
  disputed_by_resolved_at timestamptz nullable          -- set when landlord edits/voids in response (C5/AC3)
  notes                 text nullable
  created_at            timestamptz
  -- future-proofing for gateway integration (not used in MVP, nullable):
  gateway_provider      text nullable
  gateway_reference      text nullable
  -- CONSTRAINT: outstanding-balance and reminder-skip logic must filter on status='confirmed' only — see Section 6
  -- NOTE: counter_verified_* and disputed_by_tenant are informational/accountability signals only —
  --       they never change `status` directly. Only a landlord action (C3, C5) changes `status`.

notices
  id              uuid PK
  landlord_id     uuid FK -> users.id
  property_id     uuid FK -> properties.id nullable   -- null + unit_id null = all properties
  unit_id         uuid FK -> units.id nullable         -- set = single unit only
  title           text
  body            text
  type            enum('rent_reminder','maintenance','general','rent_increment')
  channels        text[]   -- subset of {'in_app','email','whatsapp'}
  created_at      timestamptz

notice_recipients
  id                  uuid PK
  notice_id           uuid FK -> notices.id
  tenant_id           uuid FK -> users.id
  in_app_delivered_at timestamptz nullable
  email_status        enum('pending','sent','failed') nullable
  whatsapp_status     enum('pending','sent','failed') nullable
  read_at             timestamptz nullable

conversations
  id              uuid PK
  unit_id         uuid FK -> units.id
  landlord_id     uuid FK -> users.id
  tenant_id       uuid FK -> users.id
  created_at      timestamptz
  -- one conversation per (unit_id, tenant_id) pair; persists across lease renewals for same tenant

messages
  id                  uuid PK
  conversation_id     uuid FK -> conversations.id
  sender_id           uuid FK -> users.id
  body                text
  attachment_url      text nullable
  read_at             timestamptz nullable
  created_at          timestamptz

invite_codes
  id              uuid PK
  lease_id        uuid FK -> leases.id
  code            text unique
  redeemed_at     timestamptz nullable
  expires_at      timestamptz
  created_at      timestamptz

notification_log
  id                  uuid PK
  recipient_id        uuid FK -> users.id
  channel             enum('in_app','email','whatsapp')
  related_type        enum('notice','reminder')
  related_id          uuid              -- notice.id or a synthetic reminder identifier
  status               enum('sent','delivered','failed')
  provider_message_id  text nullable
  sent_at              timestamptz
```

**Row-Level Security intent (to be implemented as Postgres RLS policies):**
- `properties`, `units`, `leases`, `notices`: readable/writable only where `landlord_id` (directly or via join) matches the authenticated user's ID.
- `leases`, `conversations`, `messages`: readable by the linked `tenant_id` for their own rows only, and never writable by tenants for `leases`.
- `payments`: readable by both the landlord (via lease → unit → property join) and the linked `tenant_id`. Writable by both for `INSERT` (either party can log a payment) and for their own reaction fields — a tenant may set `counter_verified_by`/`counter_verified_at` or `disputed_by_tenant`/`disputed_by_reason` on a landlord-logged row, but neither party may write `status`, `confirmed_by`, or `confirmed_at` except a landlord. This must be enforced at the RLS/policy level, not just hidden in the UI.

---

## 5. API Endpoints (tRPC procedure map)

Grouped by router. Each procedure includes required auth context.

**`auth`**
- `auth.signupLandlord` — creates landlord account
- `auth.signupTenant` — requires valid `invite_code`, creates tenant account, links to lease
- `auth.login`
- `auth.me` — returns current session's user + role

**`properties`** (landlord-only)
- `properties.list`
- `properties.create`
- `properties.update`
- `properties.delete` — blocked if any unit has an active lease

**`units`** (landlord-only for mutations, landlord+linked tenant for read)
- `units.listByProperty`
- `units.create`
- `units.update`
- `units.getStatus` — derived, returns `vacant`/`occupied` + current lease summary

**`leases`**
- `leases.create` (landlord) — generates `invite_code` if tenant not yet linked
- `leases.getForUnit` (landlord)
- `leases.getMine` (tenant) — returns tenant's own lease(s), active + historical
- `leases.uploadDocument` (landlord) — returns signed upload URL
- `leases.terminate` (landlord)
- `leases.getTimeline` (landlord+tenant, scoped) — returns computed status + renewal window

**`payments`**
- `payments.log` (landlord+tenant, scoped) — landlord-initiated calls create status `confirmed`; tenant-initiated calls create status `pending` and notify the landlord. Accepts an optional proof-of-payment upload for either role.
- `payments.uploadProof` — returns a signed Supabase Storage upload URL, scoped to the requesting user's own payment row
- `payments.confirm` (landlord only) — sets status `confirmed`, stamps `confirmed_by`/`confirmed_at`, notifies tenant, triggers outstanding-balance recalculation
- `payments.reject` (landlord only) — requires `dispute_reason`, sets status `disputed`, notifies tenant
- `payments.acknowledge` (tenant only, on a landlord-logged payment) — stamps `counter_verified_by`/`counter_verified_at`; informational only, does not change `status`
- `payments.flag` (tenant only, on a landlord-logged payment) — requires `disputed_by_reason`, sets `disputed_by_tenant=true`, notifies landlord; does not change `status`
- `payments.resolveFlag` (landlord only) — edits the flagged payment's details or voids it (sets `status='disputed'`), clears `disputed_by_tenant`, notifies tenant
- `payments.listForLease` (landlord+tenant, scoped) — returns all payments regardless of status, each labeled with its status and any flag state
- `payments.getOutstanding` (landlord+tenant, scoped) — derived outstanding balance for current period, computed from `status='confirmed'` rows only

**`notices`**
- `notices.send` (landlord) — fans out to `notice_recipients`, triggers delivery jobs
- `notices.listSent` (landlord)
- `notices.listReceived` (tenant)
- `notices.markRead` (tenant)

**`conversations`**
- `conversations.getForUnit` (landlord+tenant, scoped)
- `conversations.sendMessage` (landlord+tenant, scoped)
- `conversations.markRead` (landlord+tenant, scoped)
- Real-time subscription via Supabase Realtime channel keyed by `conversation_id`, not a polling endpoint.

**Internal (not client-facing, triggered by Vercel Cron)**
- `internal.runRentReminderCheck` — scans leases for due-date thresholds, creates `notice`-equivalent reminder records, triggers `internal.dispatchNotification`
- `internal.dispatchNotification` — sends via Resend (email) and WhatsApp Cloud API, writes to `notification_log`

---

## 6. Notification & Reminder Logic (detail)

- Reminder thresholds are computed relative to each lease's next due date, which is derived from `start_date`, `rent_frequency`, and the latest fully-covered `payments` period.
- Default thresholds: **7 days before due**, **1 day before due**. Configurable at the landlord level in a future phase; hardcoded as a constant for MVP.
- Idempotency: before dispatching a reminder for a given lease + threshold, check `notification_log` for an existing `related_type='reminder'` entry for that lease + threshold + due-date combination. Skip if found.
- Skip condition: if a `payments` row with `status='confirmed'` exists covering the relevant period before the threshold fires, skip the reminder entirely. A `pending` (tenant-logged, unconfirmed) payment must NOT skip the reminder — otherwise a tenant could log a false payment to stop reminders before the landlord ever sees it.
- WhatsApp delivery: via WhatsApp Cloud API (Meta) or a provider such as Termii's WhatsApp channel — requires pre-approved message templates for reminders/notices since these are business-initiated, not user-initiated, conversations. This template approval step should be flagged as a setup dependency, not assumed to be instant.

---

## 7. Deployment Strategy

- **Frontend + API:** Next.js app deployed on Vercel, connected to GitHub for CI/CD (matches your existing FoodShuffle deployment pattern).
- **Database/Auth/Storage/Realtime:** Supabase project (managed Postgres, Row-Level Security policies applied via migration files, not console clicks — for reproducibility).
- **Scheduled jobs:** Vercel Cron triggering `internal.runRentReminderCheck` daily.
- **Environment separation:** separate Supabase projects for staging and production; never point staging Vercel deployment at production Supabase.
- **Secrets:** Resend API key, WhatsApp Cloud API token, Supabase service role key — stored as Vercel environment variables, never committed.
- **Domain:** production on a custom domain; staging on Vercel's preview/staging subdomain.

---

## 8. Non-Functional Requirements

- All monetary values stored as `numeric`, never `float`, to avoid rounding errors in rent/payment calculations.
- All dates/timestamps stored in UTC; displayed in the user's local timezone (Nigeria: WAT, UTC+1) on the frontend.
- Lease and payment mutations must be atomic — a partial write (e.g. payment logged but outstanding-balance cache not updated) is not acceptable; prefer computing outstanding balance on read rather than caching it, to avoid this class of bug entirely.
- Mobile-responsive web is required for both portals — landlords and tenants will access primarily from phones.

---

## 9. Next Step

This PRD is ready to be broken into the Phase 3 Prompt Pack — a sequential set of copy-paste-ready prompts for the coding agent, each scoped to a verifiable unit of work.
