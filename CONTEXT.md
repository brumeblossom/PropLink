# PropLink — Build Context

## Current state
A Next.js 14 multi-tenant SaaS application with fully operational user authentication (Supabase Auth), complete property and unit management (Epic A), lease lifecycle management (Epic B), tenant invite/redemption onboarding flow (Epic F), dual-party payment logging and confirmation workflow (Epic C), in-app and email notice broadcasting, unit-level tenant/landlord realtime chat (Epic G), automated rent reminders via daily cron jobs (Epic H), and full unit metadata edit/delete and global currency formatting controls. All data boundaries are locked via Supabase Row-Level Security (RLS) policies.

## Completed steps
- [x] Prompt 0 — Scaffolding
- [x] Prompt 1 — Database Schema, Triggers, & RLS Policies
- [x] Prompt 2 — Authentication & Dashboard Redirections
- [x] Prompt 3 — Property & Unit Management (Epic A)
- [x] Prompt 4 — Lease Lifecycle (Epic B)
- [x] Prompt 5 — Tenant Onboarding & Redemption (Epic F)
- [x] Prompt 6 — Payments Logging & Proof Attachments (Epic C)
- [x] Prompt 7 — Notices & Realtime Chat Communication (Epic G)
- [x] Prompt 8 — Automated Reminders & Cron Setup (Epic H)
- [x] Prompt 9 — Polish & Deployment Hardening (Epic I)

## Key decisions made
- **Node.js Environment**: Configured commands to run with Node `v22.11.0` (using Node/npm path from the workspace's Meal Planner `.node-env`).
- **Scaffolding Subdir Workaround**: Created the initial `create-next-app` under a lowercase folder `proplink` and then moved it to the root path to bypass npm package name casing restrictions (since the root directory is capitalized `PropLink`).
- **tRPC App Router Setup**: Selected the fetch-based request handler at `/api/trpc/[trpc]` to serve tRPC procedures over Next.js App Router API Routes.
- **Supabase Project Reference**: Initialized the PostgreSQL database against Supabase Project `qmwjnmeylvbuqtltdjmf` in `eu-west-1`.
- **Custom Triggers for RLS and Constraints**:
  - **Lease Overlap Trigger**: Set up a Postgres trigger `check_lease_overlap_trigger` on the `leases` table to enforce that active leases for the same unit cannot have overlapping date ranges.
  - **Payment Lock Trigger**: Implemented `enforce_payment_write_rules_trigger` to block tenants from updating core billing details on updates, restricting their access to reaction variables.
- **Shadow Database Compatibility**: Wrapped the auth schema stub in a `DO $$` exception block to bypass Supabase schema permission locks while supporting standard shadow database validations.
- **Cookie-Based Supabase SSR Session Storage**: Implemented client/server factories using `@supabase/ssr` to store access and refresh tokens inside HTTP-only cookies.
- **User Metadata Edge Routing**: Saved `role: "landlord"` directly in Supabase auth user metadata during sign-up to permit instant, edge-based role evaluations and redirects inside the Next.js middleware without DB queries.
- **Auth Callback Handler**: Integrated a Route Handler at `/api/auth/callback` to process verification codes, allowing email confirmations in the MVP.
- **Derived Unit Status Query Logic**: The status of a unit (`vacant`/`occupied`) is derived at query time in tRPC procedures. A unit is marked `occupied` if there is an un-terminated lease (`terminatedAt` is `null`) where the current date falls between `startDate` and `endDate`; otherwise, it is `vacant`. This is done inside `units.listByProperty` and `units.getStatus` procedures.
- **Property Deletion Active Lease Check**: Implemented logic in `properties.delete` that prevents property deletion and returns a `BAD_REQUEST` error if any unit in the property is linked to an active lease.
- **Lease Status — Computed-on-Read (not cron)**: Per PRD Section 8 NFR, lease status (`upcoming`, `active`, `renewal_due`, `expired`, `terminated`) is computed fresh on every read inside `leases.getTimeline`. No background job or cron is used. The computation is: today < startDate → `upcoming`; today > endDate → `expired`; today within last `renewalWindowDays` before endDate → `renewal_due`; otherwise → `active`. Terminated leases are flagged by a non-null `terminatedAt` field.
- **Supabase Storage — Lease Documents Bucket**: Created a private storage bucket named `leases` (id: `leases`, public: false) inside Supabase Storage. The bucket is provisioned lazily on first tRPC context initialization via a `INSERT ... ON CONFLICT DO NOTHING` SQL statement. Signed upload URLs (via `createSignedUploadUrl`) are returned to the client for direct browser → Supabase upload. Signed download URLs (60-second expiry) are generated server-side via `createSignedUrl` and opened in a new tab. Only PDF and image files ≤10MB are accepted (validated client-side before requesting the signed URL).
- **Invite Code Generation**: When a landlord creates a lease for an email address not yet in the `users` table, a placeholder `User` row is created with `role: "tenant"` and a 6-character alphanumeric `InviteCode` (prefixed `PL-`) is issued, valid for 7 days. The invite code is displayed in the lease timeline card until redeemed.
- **Tenant Invite Code Redemption and Primary Key Cascade**: Validated invite codes at database query level (existence, expiry, matching email check). Upon successful signup, the placeholder profile ID in the `users` table is updated to the newly generated Supabase Auth UUID inside a Prisma transaction. The database `ON UPDATE CASCADE` trigger automatically propagates this change to all related tables (e.g. `leases.tenantId`), preventing orphan records.
- **Tenant Dashboard (Minimal)**: Set up a dedicated visual panel at `/tenant` that queries `leases.getMine` to display an active lease summary card, rent rate, security deposit details, and a short-lived download link wrapper for documents stored in the private `leases` bucket.
- **Nigerian Unit Types**: Supported residential (`apartment/flat`, `self-contained`, `mini flat`, `duplex`, `bungalow`, `terrace`, `room and parlour`, `storey building`) and commercial (`shop`, `office`, `warehouse`, `showroom`) categories, stored as validation strings in `src/lib/unit-types.ts`.
- **Redesigned Tenant Invitation**: Landlords can invite tenants directly from vacant units using a quick-start form (start date, end date, optional rent). Submitting auto-generates the invite code and lease.
- **Unit Metadata Edit & Soft-Delete**: Built Edit Unit forms and Delete Unit workflows on both the property page and unit details page. vacancy status checks prevent hard-deletions when active leases exist. Vacant units are soft-deleted by setting the `deletedAt` field.
- **Unified Currency Formatter**: Integrated `formatCurrency` in `src/lib/utils.ts` to format values using standard English-US formatting with thousands separators (commas), replacing raw `.toLocaleString()` rendering.
- **Tenant Portal Multi-page Layout Refactor**: Refactored the tenant portal into a structured layout with a persistent left sidebar containing Dashboard, Payments, Notices, and Profile sub-routes, matching the landlord layout pattern.
- **Persistent Floating Chat Widget**: Replaced the full-page and inline chat interfaces with a role-aware floating FAB and expandable chat panel at the bottom-right of the viewport. Integrated with `NotificationBell` deep-linking to open the conversation target in-place without page routing.
- **Hook Placement Hardening**: Restructured hooks in `UnitDetailPage` (specifically `availableYears` and `filteredPayments` `useMemo`) to live strictly at the top of the component to resolve the Rules of Hooks violation that caused runtime crashes after conditional loading/not-found returns.
- **Vercel Build Alignment**: Cleaned up ESLint build errors in `ChatWidget.tsx` by removing unused imports/destructures and escaping literal quote characters.
- **Library Versions**:
  - Next.js: `14.2.35`
  - React: `^18`
  - Tailwind CSS: `^3.4.1`
  - shadcn/ui: `^4.14.1`
  - Zustand: `^5.0.14`
  - TanStack Query: `^5.101.4`
  - tRPC client & server: `^11.18.0`
  - Prisma: `^6.19.3`
  - Supabase client: `^2.110.8`
  - Supabase SSR helper: `^0.4.0`

## Known issues / TODO
- **Overlap UI Guard**: The "Create Lease" button is intentionally hidden on the unit detail page when an active lease exists (the form is only shown when the unit is vacant). Attempting to create a second overlapping lease via a direct API call will be rejected by the tRPC `leases.create` procedure with a descriptive error. The UI guard and API guard together satisfy B1/AC2.
- **Document upload**: Lease document upload flow has a known issue (parked — not yet re-investigated).

## Performance Audit (2026-07-29)

Full audit written to `performance_audit.md` (in brain artifacts). Summary of what was found and fixed:

### Fixed
- **Duplicate `notifications.listReceived` polling** in `landlord/layout.tsx`: Removed the independent 15s `refetchInterval`. Layout now reads from the same TanStack Query cache entry the NotificationBell owns at 10s — one HTTP call, two subscribers.
- **Property detail page over-fetch**: `properties/[id]/page.tsx` was calling `properties.list` (loads every property + all units + leases) just to show one property. Added `properties.getById` procedure and switched the detail page to use it. Mutation cache invalidations updated to also invalidate `getById`.
- **Four missing database indexes** added to `schema.prisma` and migration `20260729_add_performance_indexes`:
  - `leases(start_date, end_date)` — the active-lease date range filter used in every property list, unit list, notice send, and cron job.
  - `notices(landlord_id, created_at DESC)` — covers the ORDER BY in `notices.listSent` without an in-memory sort.
  - `notifications(recipient_id, created_at DESC)` — covers the ORDER BY in `notifications.listReceived`, polled every 10s.
  - `payments(lease_id, period_start, period_end)` — covers the period filter in `payments.getBillingSummary`.

### Not fixable with code (documented)
- **RLS 3-table chains** on `payments` and `invite_codes`: `leases → units → properties` JOIN on every row. All three legs already have supporting indexes; this is the minimum cost for the current schema shape. Not worth denormalizing.
- **Vercel free-tier cold-start** (first-request ~300ms–2s delay after idle): Expected behavior on the free plan. Subsequent requests in the same session are fast. Not a code issue.

## Storage Upload Fix (2026-07-29)

- **Issue**: Next.js `cookies()` returns an empty cookie store inside App Router Route Handler POST requests (like tRPC mutations). As a result, calling `createClient()` inside tRPC mutations created an anonymous/unauthenticated client instance. When requesting a signed upload URL via `createSignedUploadUrl`, the request was treated as anonymous, causing Supabase Storage RLS policies (which check `auth.uid()`) to fail with "new row violates row-level security policy".
- **Fix**: Exposed the request-header-authenticated Supabase client (`ctx.supabase` built via `buildSupabaseFromRequest`) in the tRPC Context, and updated all storage operations in `leases.ts`, `payments.ts`, and `auth.ts` to use `ctx.supabase`.
- **Avatars Bucket RLS**: Discovered that no RLS policies existed for the `avatars` bucket. Added policies to allow authenticated inserts/updates/deletes for user-owned paths, and public selects.

