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
- [x] Signup Error Sanitization — Catch Prisma unique constraint on phone number and return user-friendly message, preventing database traces exposure during registration.
- [x] Performance & Skeleton Optimization — Colocate Vercel server functions in dub1 next to Supabase, 30s query staleTime, 30s polling intervals, and instant skeleton layout loaders.
- [x] RLS Policy Recursion & Leases Storage Fix — Break mutual recursion using SECURITY DEFINER helpers, rewrite table and storage policies for bucket 'leases', fix file input state reset on error.
- [x] Settings Refactor & Password Security Flow — Consolidated account settings into a single Account card with Edit name modal (40-char limit with live counter) and Change password modal (with current password verification and live rule checklist), shared PasswordChecklist component across settings, signup, and reset-password, shared PageContainer layout component aligning settings and notifications, and sanitized user-friendly signup duplicate messages.
- [x] Landlord Navigation & Detail Page Polish — Clickable property cards with hover states, top-right tag alignment and ⋯ menus with ConfirmDialog delete; shared DetailActionRow with responsive ⋯ collapse for property and unit detail pages; All Units count pill, updated column order, unit action icons, responsive card view on mobile, and client-side search/filter toolbar; required tenant name/email validation on invite form.
- [x] Radix Action Menu & Page Header Polish — Replaced hand-built menus with shared portalled ActionMenu using @radix-ui/react-dropdown-menu and tooltip, eliminated clipping in table and card overflow containers, cleaned sticky PageHeader to only title, menu and bell, introduced PageTitleRow with aligned actions.
- [x] Tenant List Table Refactor — Replaced card layout with server-paginated, filterable, searchable table for landlord tenants (/landlord/tenants). Extended leases.getLandlordTenants to return one row per tenant with leases[] and derived billing/status. Desktop table shows Tenant, Phone, Unit(s) (+N more pill), Property, Lease status (most urgent: Expired > Renewal due > Active), Next rent due with unit page status colors, and pagination. Row click opens ~360px right-side panel with lease cards and unit links (closable via Esc/×). Mobile shows tenant cards and bottom sheet.
- [x] Tenant List Two-Line Rent Due & Overlay Side Panel — Title row "Your tenants" with count pill, toolbar directly below with 32px gap and no surrounding border. Table-layout fixed with set column widths preventing sideways scroll at >=1024px, hiding Phone column between 768px and 1279px, two-line next rent due format (upcoming with relative days, overdue with periods and since date, upcoming lease with lease start date, paid to end of lease, expired). Tenant details drawer built with @radix-ui/react-dialog sliding OVER the page as a 480px right-side panel without pushing the table, with scrollable leases body (min-h-0) and 2-column grid cards; mobile (<768px) cards with two-line rent due and sliding bottom sheet.
- [x] Announcements Table & In-App Only Redesign; Notifications Page Redesign — Announcements (/landlord/notices) redesigned with PageTitleRow "Sent messages" and "+ Create message", channels in-app only, search/property/category toolbar synced to URL query, table with audience, category pill, recipients count with "View recipients" modal, and 56px progress bar read tracking; fixed (undefined) unit audience bug; mobile cards with bottom progress row. Notifications (/landlord/notifications) redesigned in PageContainer with Today/Yesterday/Earlier grouping (Africa/Lagos time) in single bordered lists, 36px type-tinted rounded square icons, plain action sentences with muted unit/property lines, time with unread blue dots, and All/Unread filter.
- [x] Landlord Dashboard Metrics, Charts & Properties Table — Completely refactored /landlord dashboard: single-request tRPC procedure dashboard.landlordSummary aggregating properties, units, occupancy, active leases, and pending payments. Added 4 stat cards with "N% occupancy" subline under Occupied; responsive 2-column grid featuring Recharts donut chart (Properties by type with legend counts), horizontal bar chart (Units by unit type sorted largest first), horizontal stacked bar (Occupancy by property with green occupied & grey vacant), horizontal bar chart (Tenants by location, dynamically switching between city and state), Leases ending soon list (up for renewal or ending in 60 days), and Payments waiting for you list (linking to unit detail with ?paymentId= auto-opened); plus desktop All Properties table and mobile stacked property cards.

## Key decisions made
- **Recharts Library for Metrics & Data Visualization**: Integrated `recharts` for rich, responsive, accessible chart rendering across the landlord dashboard. Configured charts with dark-theme styled tooltips, consistent color-blind-safe palettes (green `#22c55e` for occupied, neutral grey `#525252` for vacant, blue `#3b82f6` for residential/units, purple `#a855f7` for commercial/tenants, cyan `#06b6d4` for mixed), and client-side mount guards (`isMounted`) to eliminate SSR hydration mismatches.
- **Announcements In-App Only**: Announcements are configured as in-app notifications only (`channels = [NotificationChannel.in_app]`) without email or WhatsApp dispatch. Email (Resend) only reaches the account owner's address until a custom sending domain is verified, and WhatsApp was never enabled. The email and WhatsApp dispatching code in `notificationDispatcher` is preserved, with clear comments in `notices.ts` on where to turn email back on upon domain verification.
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
- **Signup Error Sanitization**: Caught Prisma unique constraint validation errors (`P2002`) on the user profile creation / update `phone` field in `src/server/routers/auth.ts`. Strips raw DB traces, throwing instead a friendly validation string: `"This phone number is already registered. Please use a different number or leave it blank."`
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

## Performance & UX Optimization (2026-11-19)

- **Vercel Server Region (`dub1`)**: Configured `"regions": ["dub1"]` in `vercel.json` to colocated Vercel Serverless Functions in Dublin (Ireland) alongside Supabase (`eu-west-1`), eliminating multi-leg transatlantic database round-trip latencies on every tRPC invocation.
- **Client Query Caching (`staleTime: 30_000`)**: Set `defaultOptions.queries.staleTime: 30_000` on the TanStack `QueryClient` in `src/app/providers.tsx` while maintaining `refetchOnWindowFocus: false`. In-app navigation reuses cached query responses within 30 seconds instead of refetching on every tab/page switch, while mutation invalidations guarantee fresh data immediately after mutations.
- **Polling Harmonization (30s)**: Harmonized background polling intervals to 30s across `NotificationBell` (both system notifications and tenant notices), `landlord/notifications` (15s → 30s), and `tenant/payments` (10s → 30s), reducing idle request pressure.
- **Skeleton Loaders**: Implemented standard shadcn `<Skeleton />` primitive in `src/components/ui/skeleton.tsx` and replaced full-page loading spinners across all primary landlord and tenant screens (landlord: dashboard, properties list, property detail, unit detail, tenants, notices, notifications, profile; tenant: dashboard, payments, profile), instantly rendering page frames and layout placeholders.
- **Next.js Link Prefetching**: Confirmed sidebar navigation items in landlord and tenant layouts use `next/link` `<Link>` components for automatic prefetching on viewport entry / hover.

## RLS Policy Recursion & Storage Objects Fix (2026-11-19)

- **RLS Policy Recursion Root Cause**: Supabase Storage returned Postgres error `42P17` ("The database schema is invalid or incompatible" / "infinite recursion detected in policy") because `tenant_read_properties_policy` on `properties` queried `units`, while `landlord_units_policy` on `units` queried `properties`. When evaluating storage policies on `storage.objects` for bucket `leases`, this circular reference triggered Postgres's infinite recursion limit.
- **SECURITY DEFINER Helper Functions**: Created 6 stable `SECURITY DEFINER` functions in the `public` schema (`is_property_landlord`, `is_unit_landlord`, `is_unit_tenant`, `is_property_tenant`, `can_access_lease`, `is_lease_landlord`) owned by `postgres` and granted `EXECUTE` to `authenticated`. Because `SECURITY DEFINER` functions run with postgres privileges and bypass RLS on their internal reads, cross-table checks no longer invoke recursive policy chains.
- **Rewritten Table Policies**: Updated `tenant_read_properties_policy`, `landlord_units_policy`, `tenant_read_units_policy`, and `landlord_leases_policy` to call these helpers rather than performing table JOINs directly in policy expressions, keeping access boundaries strict.
- **Storage Policies for 'leases' Bucket**: Standardized file paths to `<leaseId>/<timestamp>.<ext>` across lease agreements and tenant payment proofs. Defined 4 scoped policies on `storage.objects`:
  - `SELECT`: `bucket_id = 'leases' AND can_access_lease((storage.foldername(name))[1]::uuid)`
  - `INSERT`: `bucket_id = 'leases' AND can_access_lease((storage.foldername(name))[1]::uuid)`
  - `UPDATE`: `bucket_id = 'leases' AND is_lease_landlord((storage.foldername(name))[1]::uuid)`
  - `DELETE`: `bucket_id = 'leases' AND is_lease_landlord((storage.foldername(name))[1]::uuid)`
- **File Input UX Hardening**: Fixed the UI issue on the landlord unit detail page where failed file uploads left the file name and error message persistent. Both the file input value and error state are now cleared when the user selects a new file.

## Legacy Payments Storage Paths & Safe Extraction (2026-11-19)

- **Legacy Path Support**: Added `public.lease_id_from_path(p_name text)` `SECURITY DEFINER` helper function to handle both modern (`<leaseId>/<file>`) and legacy (`payments/<leaseId>/<file>`) storage paths. Validates target folder segment with UUID regex before casting, returning `NULL` without throwing errors on malformed or non-UUID paths.
- **Rewritten Storage Policies**: Updated `leases_select_policy`, `leases_insert_policy`, `leases_update_policy`, and `leases_delete_policy` to use `lease_id_from_path(name)`.

## Running Balance Per Lease & Dynamic Billing (2026-11-19)

- **Running Balance Model (`src/lib/billing.ts`)**:
  - Replaced rigid, single-period matching (where payments were ignored if their dates did not match calculated period boundaries) with an approved running balance per lease model in `Africa/Lagos` time (UTC+1).
  - **Period Starts & Clamping**: Computes period start dates from `lease.startDate + n months` (step 1 for monthly, 3 for quarterly, 12 for annually), clamping to the last day of the month when the calendar day does not exist (e.g. 31 Jan → 28/29 Feb → 31 Mar), preserving the original day where possible.
  - **Period Bounds Fix**: A period starting on or after `lease.endDate` is not a rent period (`pStr >= endStr` breaks the loop). A 1-year annual lease (e.g. 20/07/2026–20/07/2027) generates exactly 1 period, and a 1-year monthly lease generates 12 periods.
  - **Calculations**:
    - `totalPeriods`: Total number of rent period starts within the lease duration.
    - `totalLeaseRent`: `rentAmount × totalPeriods`.
    - `remainingLeaseRent`: `Math.max(0, totalLeaseRent - paidToDate - pendingAmount)`.
    - `rentDueToDate`: `rentAmount × periodsDue` (period starts on or before today and before `endDate`).
    - `paidToDate`: Sum of `confirmed` payments on the lease (pending and rejected payments never count; disputed ignored as today).
    - `outstanding`: `rentDueToDate − paidToDate`. Shown as `Credit ₦X` when negative (paid in advance).
    - `nextDueDate`: Walk periods from start, subtracting `rentAmount` from `paidToDate`. The start of the first period not fully covered is `nextDueDate`. If every period up to lease end is fully covered, `nextDueDate` is `null` ("Paid to end of lease").
    - `unpaidPeriods`: Count of period starts on or before today that are not fully covered by `paidToDate`.
    - If `rentAmount` is 0 (or not set), indicates "Rent not set" instead of numbers.
- **Unit Testing with Vitest**:
  - Added `vitest` (`^5.1.1`) and `vite` as dev dependencies, added `"test": "vitest run"` script to `package.json`, and configured `vitest.config.mjs` scoped to `src/**/*.test.ts`.
  - Comprehensive unit test suite in `src/lib/billing.test.ts` (11 tests passing) covering:
    - Annual 1-year lease = 1 period (20/07/2026–20/07/2027).
    - Monthly 1-year lease = 12 periods (29/07/2026–29/07/2027).
    - Flat2 example: 20/07/2026–20/07/2027, ₦1.5m annually, ₦1.5m paid → `nextDueDate: null`, "Paid to end of lease (20/07/2027)".
    - Flat3 example: starts 29/07/2026, ₦800k monthly, ₦600k paid, checked on 19/11/2026 (4 periods due, ₦2,600,000 outstanding, 3 unpaid periods).
    - Due date line wording states: overdue (`Overdue since DD/MM/YYYY · N unpaid periods`), today (`Rent due today`), upcoming (`Next rent due DD/MM/YYYY`), paid to end of lease (`Paid to end of lease (DD/MM/YYYY)`).
    - Payment limit and remaining lease rent with pending payments.
    - Partial payment: ₦800k monthly, ₦400k paid in month 1 (₦400k outstanding, next due date is current period).
    - Payment in advance: ₦100k rent, ₦300k paid on month 1 (₦0 outstanding, credit ₦200k, next due date month 4).
    - 31st-of-month start date clamping (Jan 31 → Feb 28 → Mar 31 → Apr 30).
    - Rent not set (rentAmount 0): `isRentSet: false`, numbers are 0.
    - `getRentPeriodForDate` containing period resolution.
- **Server Routers & Payment Cap Enforcement**:
  - `payments.getBillingSummary`: Returns full lease balance including `totalLeaseRent`, `remainingLeaseRent`, `pendingAmount`, and `unpaidPeriods`.
  - `payments.create`: Rejects payment amounts exceeding `balance.remainingLeaseRent` with `"This is more than the ₦X left on this lease."`.
  - `payments.updatePending`: Rejects payment amounts exceeding `balance.remainingLeaseRent` (excluding the current payment's pending amount) with `"This is more than the ₦X left on this lease."`.
  - `payments.confirm`: Rejects confirmation if `confirmedAmount + Number(payment.amount) > totalLeaseRent` with `"Confirming this payment would exceed the total lease rent of ₦X."`. Partial payments remain allowed.
  - `internal.ts` (Rent Reminder Cron): Uses `getLeaseBalance(lease, confirmedPayments, now).nextDueDate`. Preserves reminder thresholds (7 days / 1 day), idempotency key `reminder-${threshold}-${dueDateStr}`, and the rule that pending payments never suppress reminders.
  - Automatically populates `period_start` and `period_end` columns using `getRentPeriodForDate(lease, paymentDate)` for historical reporting.
  - Enforces `paymentDate <= today` in `Africa/Lagos` (no future dates).
- **UI Harmonization & Wording Under Summary Tiles**:
  - **Summary Box & Tiles**: Standardized across Landlord Unit Detail, Tenant Payments, and Tenant Dashboard:
    - 3 Tiles: "Rent due so far", "Paid (confirmed)", "Outstanding" (red if > 0, green `Credit ₦X` if negative, green `₦0` if zero).
    - Underneath: 1 line using `getDueDateStatus`:
      - Overdue before today → red `"Overdue since DD/MM/YYYY · N unpaid periods"`
      - Due today → amber `"Rent due today"`
      - Upcoming after today → `"Next rent due DD/MM/YYYY"`
      - Null next due date → green `"Paid to end of lease (DD/MM/YYYY)"`
      - Pending alert appended: `" • ₦X pending your confirmation"` (landlord) / `" • ₦X waiting for landlord confirmation"` (tenant).
  - **Payment Cap Controls**:
    - "Add Payment" / "Log Payment" / "Log My Payment" buttons are disabled when `remainingLeaseRent <= 0` (reduced opacity, no hover) with a hover tooltip: `"This lease is fully paid."` Redundant beside-button text removed per UI Standard.
    - Payment modals display `"₦X left on this lease"` directly under the Amount input and reject amounts above it on client submit.
- **UI Standard (CLAUDE.md Section 16)**:
  - Added strict UI standards covering Linear/Stripe/Vercel level polish, no redundant text, hover tooltips for disabled actions, standard 8px/12px radius, and responsive checks.
- **UI Standard Polish & App-Wide Overhaul (Prompt 9)**:
  - **Sticky Page Header**: Added shared `<PageHeader title />` across all landlord and tenant dashboard pages (`h-16`, matching sidebar logo area height, with bottom border forming one continuous horizontal line at `top: 64px`). Integrated `SidebarProvider` and `useSidebar()` for mobile hamburger toggle. Per app-wide standard, the sticky header holds ONLY page title, mobile menu button, and notification bell (no buttons or filters).
  - **Page Title Row (`<PageTitleRow />`)**: Shared `<PageTitleRow title description? actions? />` on top-level pages (Properties, Announcements, Notifications). Row 1 displays `h1` heading on the left and actions vertically centered on the right; Row 2 displays description full-width. On mobile (<640px), action buttons collapse into icon-only with `aria-label` and tooltip.
  - **Detail Action Row Alignment**: Removed `mb-6` from `BackButton` and set `h-9 inline-flex items-center` to align exactly with the 36px action buttons and their vertical text centers.
  - **Portalled Action Menu (`<ActionMenu />`)**: Replaced all hand-built `⋯` menus (unit page payments, tenant payments, property cards, `DetailActionRow` mobile menu) with a shared `<ActionMenu />` component powered by `@radix-ui/react-dropdown-menu` and `@radix-ui/react-tooltip`. Menus are rendered in a `DropdownMenu.Portal` on `document.body` so they can never be clipped by `overflow-hidden` containers, and flip automatically above triggers when near the bottom of the viewport. Disabled items display Radix tooltips with explanations ("Already confirmed", "Already rejected"). Old inline `openMenuId` states and fixed overlay backdrops removed.
  - **Mobile Payment History Cards (<640px)**: Landlord unit and tenant payment history display stacked cards instead of wide horizontal tables on mobile (<640px). Each card features amount (semibold) and `<ActionMenu>` on the top row, muted date and method on the second row, and status / flagged pills on the bottom row. Tapping the card opens the payment details modal, which features 16px side margins on mobile, inner scrolling, and full-width stacked footer buttons.
  - **Dropdown Arrows (`<Select />`)**: Created shared `<Select />` with `appearance-none`, vertically centered `ChevronDown` at `right-3`, and `pr-9` padding across all forms, filters, and modals.
  - **Button Styling**: Primary buttons are consistently filled (`bg-white text-neutral-950 font-semibold hover:bg-neutral-200`). Creation buttons incorporate a `+` icon (`Plus` from lucide): "Add Property", "Add Unit", "Add Payment", "Compose Notice". Destructive buttons use red filled (`bg-red-600 hover:bg-red-500 text-white`).
  - **Confirm Dialogs (`<ConfirmDialog />`)**: Replaced all `window.confirm()` and `confirm()` calls with shared modal `<ConfirmDialog />` (`rounded-xl`, Cancel outline, Delete red filled). Grep confirms 0 `confirm(` calls remaining in codebase.
  - **Avatar Removal**: Removed all avatar images, placeholder user icons, circle wrappers, and upload controls from UI across sidebar footers, cards, tables, chat, and notification bell, displaying clean text (name and email).
  - **Consistent Renames**:
    - Sidebar "Profile" → "Settings" on both landlord and tenant sides (`/landlord/settings` and `/tenant/settings`, with permanent redirects from old `/profile` routes).
    - Sidebar "All Tenants" → "Tenant List".
    - Sidebar "Send Announcements" → "Announcements".
    - "Payment Ledger" → "Payment history" (landlord unit page & tenant payments page).
    - "Log Payment" / "Log My Payment" → "+ Add Payment", modal title & submit button → "Add Payment".
    - Notifications page: Bell icon beside page title removed.
  - **Payment Notes**: Removed note text under date in payment history tables. Notes are displayed inside payment detail modals under "Notes" label (hidden when no note).
  - **Invite Box**: On landlord unit page, "Tenant Invitation Pending" card is conditionally rendered only for unredeemed, non-expired invites. Displays clean "Invite expired" notice if expired and unclaimed.





