# PropLink — Build Context

## Current state
A Next.js 14 application with fully operational user authentication (Supabase Auth), complete property and unit management (Epic A), lease lifecycle management (Epic B), and tenant invite/redemption onboarding flow (Epic F). Tenants can sign up using a valid, unredeemed invite code, which links their new account directly to their pre-existing lease in a PostgreSQL transaction using foreign key CASCADE ON UPDATE. A high-fidelity, minimal tenant dashboard renders the active lease summary, unit details, rent terms, and document downloads. Complete row-level security and data isolation are enforced across all tRPC operations.

## Completed steps
- [x] Prompt 0 — Scaffolding
- [x] Prompt 1 — Database Schema, Triggers, & RLS Policies
- [x] Prompt 2 — Authentication & Dashboard Redirections
- [x] Prompt 3 — Property & Unit Management (Epic A)
- [x] Prompt 4 — Lease Lifecycle (Epic B)
- [x] Prompt 5 — Tenant Onboarding & Redemption (Epic F)

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
- **Library Versions**:
  - Next.js: `14.2.35`
  - React: `^18`
  - Tailwind CSS: `^3.4.1`
  - shadcn/ui: `^4.14.1` (defaults to oklch-neutral css custom variables)
  - Zustand: `^5.0.14`
  - TanStack Query: `^5.101.4`
  - tRPC client & server: `^11.18.0`
  - Prisma: `^6.19.3`
  - Supabase client: `^2.110.8`
  - Supabase SSR helper: `^0.4.0`

## Known issues / TODO
- **Overlap UI Guard**: The "Create Lease" button is intentionally hidden on the unit detail page when an active lease exists (the form is only shown when the unit is vacant). Attempting to create a second overlapping lease via a direct API call will be rejected by the tRPC `leases.create` procedure with a descriptive error. The UI guard and API guard together satisfy B1/AC2.


