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
- [x] UI/Navigation Changes — Hiding ChatWidget, removing tenant-side Notices, renaming landlord notices to Send Announcements
- [x] Multi-Lease Support & Invite Labels Fix — Render all tenant leases and fix landlord invite code status label on auto-linked accounts
- [x] Multi-Lease Payments Fix (Prompt B companion) — Tenant payments page now shows a lease selector when tenant has >1 lease; single-lease flow unchanged
- [x] Notification Deep-Links, Payment Modal Actions & Toast System — Clicking notifications routes to the correct page; landlord payment modal shows Confirm/Reject; toast appears on all key success actions
- [x] Lease Renewal Restrictions & All Tenants View — Restrict lease renewal to `renewal_due` and `expired` statuses; add comprehensive landlord "All Tenants" view listing all current and past occupants.
- [x] Functional Hardening & Specific UI Fixes (Epic I / Prompt 9) — Enabled strict app-wide dark mode styling, refactored outline button layout, consolidated property add unit buttons into an Add Unit dropdown, aligned Edit/Delete buttons, and made Sign Out text bolder.

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
- **Rent Reminder Cron Job & Notification Dispatching**: Implemented a daily cron job configuration (`vercel.json` with schedule `0 0 * * *` UTC) targeting the protected `/api/cron/rent-reminder` route handler. Email notifications are dispatched via **Resend REST API**. **WhatsApp notifications are currently stubbed as `pending`** because Meta template approval/credentials are pending. Idempotency is enforced using a `reminder-${threshold}-${dueDateStr}` format stored in `NotificationLog`. Reminders are bypassed if a `confirmed` payment covers the period, whereas a `pending` payment does not suppress the reminder.
- **Notices Dispatch Wiring**: Integrated the manual notice creation (`notices.send`) to trigger live Resend email dispatch and WhatsApp logs, dynamically updating `NoticeRecipient` status columns.
- **Lease Renewal Visibility Guard**: The "Renew Lease" button is conditionally rendered in `src/app/(dashboard)/landlord/properties/[id]/units/[unitId]/page.tsx` only if `timeline.status === "renewal_due" || timeline.status === "expired"`.
- **All Tenants Landlord View**: Added a new navigation endpoint `/landlord/tenants` to list every tenant ever hosted under the landlord's properties. Leases are fetched from `leases.getLandlordTenants`, grouped by tenant email, and rendered in cards with tabs filtering by Active/Past status.
- **Strict Theme Variable Constraints (Epic I / Hardening)**: Enabled strict `"dark"` mode on the root `<html>` element to align Tailwind variables (e.g. background and border tokens) with the application's dark design. Changed the outline button class in `src/components/ui/button.tsx` to default to `bg-transparent` rather than `bg-background` to guarantee secondary buttons have no background fill.
- **Combined Dropdown Navigation (Property Detail Page)**: Merged separate add unit buttons on `src/app/(dashboard)/landlord/properties/[id]/page.tsx` into a single, clean state-based "Add Unit" dropdown positioned directly above the units table. Repositioned the page-level "Edit Property" and "Delete Property" buttons to the right-hand side of the page header.
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
- **UI & Chat Widget Visibility Updates (2026-07-31)**:
  - **ChatWidget Visibility**: Commented out `<ChatWidget />` in both `TenantLayout` (`src/app/(dashboard)/tenant/layout.tsx`) and `LandlordLayout` (`src/app/(dashboard)/landlord/layout.tsx`) to prevent rendering or mounting. To re-enable the widget, simply uncomment these tags in both layouts.
  - **Tenant Notices Route**: Deleted the `src/app/(dashboard)/tenant/notices/page.tsx` file and removed the "Notices" link from `TenantLayoutContent` navigation items. Confirmed that there are no remaining tenant-side UI links pointing to `/tenant/notices`.
  - **Landlord notices renaming**: Renamed the landlord sidebar item and main page header on the notices board to "Send Announcements" to avoid collision/redundancy without modifying the underlying database/procedure schema.
- **Same-Tenant Multi-Unit Leases Support (2026-07-31)**:
  - **getForUnit**: Modified `getForUnit` inside `src/server/routers/leases.ts` to return all invite codes (by removing filters on `redeemedAt` and `expiresAt`), selecting `code`, `redeemedAt`, and `expiresAt` fields.
  - **Invite Status Labels**: Updated `src/app/(dashboard)/landlord/properties/[id]/units/[unitId]/page.tsx` to display `"Linked to existing tenant account"` if no invite code is associated with the lease (as a result of auto-linking an existing tenant email), and handle expired/claimed codes dynamically.
  - **Tenant dashboard multi-lease looping**: Refactored `src/app/(dashboard)/tenant/page.tsx` to render all tenant leases by looping over the returned array from `leases.getMine` and rendering a clean nested sub-component `TenantLeaseSection` per lease to query and display individual billing summaries without violating React Rules of Hooks.
- **Tenant Payments Multi-Lease Selector (2026-07-31)** (companion to Same-Tenant Multi-Unit Leases Support):
  - Refactored `src/app/(dashboard)/tenant/payments/page.tsx` into three parts: a `LeaseSelector` component (shown only when the tenant has >1 lease), a `LeasePaymentLedger` component (the existing single-lease payment UI, fully parameterized by `lease` prop), and a root `TenantPaymentsPage` orchestrator that auto-selects the only lease (no extra click) when the tenant has exactly one, or shows the selector first when there are multiple.
  - All mutations (`payments.create`, `payments.updatePending`, `payments.acknowledge`, `payments.flag`) and all queries (`payments.list`, `payments.getBillingSummary`, `payments.getUploadUrl`) are now scoped to the `lease.id` of the **selected** lease, not defaulted to the first non-terminated lease in the array.
  - A `← Back` chevron is injected into the ledger header when `showBackButton` is true (i.e. the tenant has multiple leases), allowing the tenant to return to the lease selector without a page reload.
- **Notification Deep-Links, Payment Modal Actions & Toast System (2026-07-31)**:
  - **Toast System**: Built a lightweight custom `ToastProvider` + `useToast` hook at `src/components/ui/toast.tsx` (no external library). Supports `success`, `error`, `warning`, `info` variants. Auto-dismisses after 3.5s, renders as a bottom-right portal. Added to both `LandlordLayout` and `TenantLayout`.
  - **Toast-wired success moments**: Confirm payment → "Payment confirmed" (success). Reject payment → "Payment rejected" (info). Resolve/void dispute → "Dispute resolved" (success). Send announcement → "Announcement sent successfully" (success). Errors from all mutations now show a toast (error variant) instead of `alert()`.
  - **Notification deep-link routing** (NotificationBell already handled these, now documented):
    - `relatedType: "payment"` → landlord: `/landlord/properties/:propertyId/units/:unitId?paymentId=…` via `payments.getRedirectInfo`. Tenant: `/tenant?paymentId=…`.
    - `relatedType: "lease"` → landlord: `/landlord/properties/:propertyId/units/:unitId?leaseId=…` via `leases.getRedirectInfo`. Tenant: `/tenant?leaseId=…`.
    - `relatedType: "conversation"` → opens floating ChatWidget (landlord resolves unitId via `conversations.getRedirectInfo`).
    - `relatedType: "unit"` → landlord: `/landlord/properties/all/units/:unitId`.
    - `relatedType: "notice"` → opens inline notice-body modal inside the bell dropdown (no navigation).
    - **⚠️ No destination (flagged)**: `relatedType: "reminder"` — cron-generated rent reminders carry `relatedType: "reminder"` but do **not** store a `relatedId` pointing to the lease or unit. Clicking a reminder notification in the bell currently does nothing (falls through without navigation). To fix this properly, the `internal.ts` cron router would need to store the `leaseId` as `relatedId` when dispatching reminder notifications.
  - **Landlord payment table**: Removed the redundant standalone "Details" text/underline link from each row (row click already opens the modal). Confirm/Reject action buttons are now available in **two places**: directly in the table row (for `pending` payments) AND inside the detail modal footer when a pending payment is opened.
  - **Detail modal closes on action**: Confirming or rejecting a payment from inside the modal now automatically closes the modal and clears `selectedLandlordPayment` state before firing the toast.

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

