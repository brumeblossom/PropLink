# CLAUDE.md — PropLink

This file is the standing context for any Claude Code session working in this repository. Read it before starting work. It is not a substitute for `PropLink_PRD.md` or `PropLink_Prompt_Pack.md` — both live at the repo root and are the source of truth for scope and acceptance criteria. This file tells you *how* to work in this codebase; the PRD tells you *what* to build.

---

## 1. Project Identity

**PropLink** is a multi-tenant SaaS platform for landlords and property managers overseeing multiple properties — residential, commercial, or mixed — across multiple locations. It centralizes lease tracking, manual payment logging, tenant communication, and automated rent reminders.

**MVP scope, locked:**
- Two roles only: `landlord`, `tenant`. No staff/manager sub-role.
- Payments are **manually logged by either party**, with a confirmation workflow — never processed. No payment gateway in this phase.
- Reminders and notices deliver via in-app, email, and WhatsApp. No SMS.

**Explicitly out of scope — do not build these unless the PRD is revised:**
- Online rent payment/collection (Paystack, Flutterwave, etc.)
- Staff or property-manager accounts with scoped permissions
- A structured maintenance ticket workflow (chat covers this for MVP)
- Multi-currency support
- Native mobile apps (responsive web only)

If a request during a session seems to imply any of the above, stop and flag it rather than build it — scope changes go back through the PRD, not through an ad hoc prompt.

---

## 2. Instructions for the Agent

- **Read `CONTEXT.md` at the start of every session, update it before ending.** This is how continuity survives across sessions — see PropLink_Prompt_Pack.md's convention. If `CONTEXT.md` doesn't exist yet, you're on Prompt 0; create it per that prompt's instructions.
- **Work from `PropLink_Prompt_Pack.md`, one prompt at a time, in order.** Don't skip ahead, don't batch multiple prompts into one session. Each prompt has an explicit verification step — complete it and show the result before moving on.
- **Every acceptance criterion in the PRD is a requirement, not a suggestion.** If you can't satisfy one, say so explicitly rather than shipping a partial implementation silently.
- **Don't invent scope.** If something feels missing from the PRD, log it in `CONTEXT.md` under "Known issues / TODO" rather than adding it unprompted.
- **Never guess at business logic that has real money or legal implications** (lease overlap rules, payment confirmation authority, RLS policies). If the PRD is ambiguous on one of these, stop and ask rather than pick a default.
- **Use gstack skills at the right stage** — see Section 12. `/autoplan` before starting a prompt, `/review` after building, `/qa` on major features, `/cso` before any deploy.
- Use `/browse` (gstack) for all web browsing tasks. Never use `mcp__claude-in-chrome__*` tools.

---

## 3. Repository Structure

```
proplink/
├── AGENTS.md / CLAUDE.md          # this file (and its Antigravity counterpart)
├── CONTEXT.md                     # living build-state doc, updated every session
├── PropLink_PRD.md                # source of truth for scope + acceptance criteria
├── PropLink_Prompt_Pack.md        # sequential build prompts
├── .agent/skills/gstack/          # gstack skill definitions
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── supabase/
│   └── policies/                  # RLS policy SQL, version-controlled, not console-edited
├── src/
│   ├── app/
│   │   ├── (marketing)/           # public/unauthenticated routes
│   │   ├── (landlord)/            # landlord route group
│   │   ├── (tenant)/              # tenant route group
│   │   └── api/                   # route handlers, including internal cron endpoints
│   ├── server/
│   │   ├── trpc/
│   │   │   ├── routers/           # one file per router: properties, units, leases, payments, notices, conversations, internal
│   │   │   └── context.ts
│   │   └── services/               # notification dispatch, reminder logic, etc.
│   ├── lib/                       # shared utilities (date/timezone helpers, derived-status calculators)
│   ├── components/
│   │   ├── ui/                    # shadcn/ui primitives
│   │   └── shared/
│   └── stores/                    # Zustand stores
└── tests/
```

Derived-status logic (lease status, unit status, outstanding balance) belongs in `src/lib/`, called from tRPC routers — never duplicated between frontend and backend, and never stored as a column. See Section 5.

---

## 4. Tech Stack

| Layer | Choice |
|---|---|
| Frontend framework | Next.js 14+, App Router, TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Client state | Zustand (UI state) + TanStack Query (server state) |
| Backend | Next.js Route Handlers + tRPC |
| Database | PostgreSQL via Supabase |
| ORM | Prisma |
| Auth | Supabase Auth |
| Realtime | Supabase Realtime (chat, live updates) |
| File storage | Supabase Storage (lease documents, payment proofs) |
| Email | Resend |
| WhatsApp | WhatsApp Cloud API (Meta) or Termii — confirm which has credentials configured before building Prompt 8 |
| Scheduled jobs | Vercel Cron |
| Deployment | Vercel (app) + Supabase (managed backend) |

Do not introduce a new library or service outside this table without flagging it in `CONTEXT.md` under "Key decisions made" and explaining why the table's existing choice didn't fit.

---

## 5. Architecture Rules

These are non-negotiable patterns, not preferences:

1. **Derived values are never stored.** Unit status (`vacant`/`occupied`), lease status (`active`/`renewal_due`/`expired`), and outstanding balance are computed at query time from underlying rows — never cached columns. This avoids an entire class of stale-data bugs. See PRD Section 8.
2. **Row-Level Security is the actual boundary, not the UI.** Every table with landlord/tenant-scoped data has RLS policies in `supabase/policies/`. Application-layer checks are a UX nicety on top, never the sole enforcement.
3. **Payment authority is asymmetric by design.** A landlord-logged payment is `confirmed` immediately (they received the money). A tenant-logged payment is `pending` until the landlord confirms. The non-recording party can acknowledge or flag any payment, but only a landlord action changes `status`. Do not "simplify" this to full symmetry — see PRD Epic C for why that breaks the reminder system.
4. **One conversation per (unit, tenant) pair, persisting across lease renewals** for the same tenant, but not visible to a new tenant if the unit changes hands.
5. **Monetary values are `numeric`, never `float`.** No exceptions.
6. **Dates stored in UTC, displayed in WAT (UTC+1)** on the frontend. Every date-display component should go through a shared timezone helper, not ad hoc `Date` formatting.
7. **Mutations are atomic.** Don't split a payment log and a balance-cache update into two writes — since balance is computed on read (rule 1), this failure mode shouldn't exist, but stay alert for other multi-step writes that need a transaction.

---

## 6. Environment & Deployment Pipeline

- **Two Supabase projects: staging and production.** Never point a staging Vercel deployment at the production Supabase project.
- **Vercel deploys from GitHub**, auto-preview on PRs, production on merge to `main`.
- **Secrets** (Resend API key, WhatsApp Cloud API token, Supabase service role key) live in Vercel environment variables, scoped per environment. Never commit them, never hardcode them even temporarily for testing.
- **Migrations are files, not console clicks.** Every schema change and every RLS policy change goes through a migration file in `prisma/migrations/` or `supabase/policies/`, so staging and production stay reproducible from git history alone.
- **Vercel Cron** triggers `internal.runRentReminderCheck` daily — confirm the schedule is documented in `CONTEXT.md` once set (Prompt 8).

---

## 7. Database Schema (quick reference)

Full schema with all constraints lives in `PropLink_PRD.md` Section 4 — this is a navigation aid, not the source of truth.

| Table | Purpose |
|---|---|
| `users` | Both roles; `role` enum distinguishes landlord/tenant |
| `properties` | Landlord-owned, grouped locations |
| `units` | Individual leasable spaces within a property; status is derived, never stored |
| `leases` | Time-bound tenancy record; status derived from dates |
| `payments` | Dual-party logged, `status` (`confirmed`/`pending`/`disputed`), mutual acknowledge/flag fields, `proof_url` |
| `notices` | Landlord broadcasts, scoped to unit/property/all |
| `notice_recipients` | Per-tenant delivery + read tracking for a notice |
| `conversations` / `messages` | Realtime chat, one thread per unit+tenant |
| `invite_codes` | Tenant onboarding, one-time, expiring |
| `notification_log` | Delivery record per channel, used for reminder idempotency |

Before writing a Prisma migration, check whether the field you're adding already exists under a different name in this table — schema drift between the PRD and the actual database is the fastest way to break the prompt pack's later steps.

---

## 8. Reminder Lifecycle

1. Daily cron (`internal.runRentReminderCheck`) scans leases for due dates falling within **7 days** or **1 day** of the threshold.
2. Before dispatching, check `notification_log` for an existing entry matching this lease + threshold + due date — skip if found (idempotency).
3. Check for a **confirmed** payment covering the period — skip if found. A `pending` (tenant-logged, unconfirmed) payment does **not** suppress the reminder.
4. Dispatch via in-app + email (Resend) + WhatsApp (Cloud API/Termii), write results to `notification_log` per channel.
5. WhatsApp requires pre-approved message templates from Meta — this is a real external dependency with lead time, not something that "just works" on first deploy. If templates aren't approved yet, stub the WhatsApp send as `pending` in `notification_log` rather than failing the whole dispatch.

---

## 9. Tenant Portal

Minimum surface for MVP, in build order per the prompt pack:

- **Onboarding**: invite-code redemption → account creation → routed directly to lease summary, no extra setup step.
- **Lease summary**: current lease details, document access (view/download only, no upload).
- **Payment history**: every payment regardless of status, clearly labeled `confirmed`/`pending`/`disputed`, proof attachments viewable inline. Ability to log a new payment (goes in pending) with optional proof upload.
- **Outstanding balance / next due date**: computed from confirmed payments only, visually flagged within 7 days or overdue, with a clear explanation when a pending or flagged payment isn't yet reflected.
- **Notices inbox**: read-only, mark-as-read.
- **Chat**: one thread with their landlord, scoped to their unit.

Everything here is read-scoped to the tenant's own data — no tenant-facing screen should ever query without a `tenant_id` filter matching the session.

---

## 10. API / tRPC Contract Patterns

- One router per domain: `auth`, `properties`, `units`, `leases`, `payments`, `notices`, `conversations`, `internal`. Full procedure list is in PRD Section 5 — don't rename procedures without updating both the PRD and this file.
- Every procedure that touches landlord- or tenant-scoped data pulls the authenticated user's ID and role from tRPC context and filters accordingly — never trust a client-supplied ID for authorization, only for lookup.
- `internal.*` procedures (used by cron) are not client-callable — protect them the same way you'd protect a webhook: verify a shared secret or Vercel Cron's signature, not just "not in the frontend router list."
- Mutations that change financial state (`payments.confirm`, `payments.reject`, `payments.resolveFlag`) should return the recalculated outstanding balance in the response, so the frontend never has to guess whether to refetch.
- Realtime subscriptions (chat) go through Supabase Realtime channels keyed by `conversation_id` — not a tRPC subscription or polling endpoint.

---

## 11. Design Quick Reference

- shadcn/ui components as the base primitives; customize via Tailwind, don't fight the defaults into looking like a different library.
- Mobile-first for both portals — landlords and tenants will primarily be on phones. Design and test at a narrow viewport first, then scale up.
- Avoid a templated, generic SaaS-dashboard look. Property data is inherently visual (locations, unit grids, timelines) — lean into that rather than defaulting to plain data tables everywhere.
- Status is always a first-class visual element, not just text: lease status, payment status, and delivery status all need consistent, at-a-glance treatment (badges/colors) used the same way everywhere they appear.
- Run `/plan-design-review` (gstack) before building any new screen, not just at the end — see Section 12.

---

## 12. gstack Skills

gstack is installed at `.agent/skills/gstack`. Confirm this path matches your actual clone before relying on any skill below — run `ls .agent/skills/gstack` if unsure. If you're running this file specifically through Claude Code (rather than Antigravity), also confirm Claude Code is discovering skills at this path — its default lookup is `.claude/skills`, so you may need a symlink: `ln -s .agent/skills .claude/skills`.

Use the slash commands below at the appropriate stage of the build. Always check the `SKILL.md` files inside `.agent/skills/gstack/` if you need a reminder of how a skill works.

### Browsing Rule
Use `/browse` from gstack for all web browsing tasks. Never use `mcp__claude-in-chrome__*` tools.

### Available Skills & When to Use Them
- **`/autoplan`** — Run at the start of every prompt from `PropLink_Prompt_Pack.md`, before writing code. Breaks the prompt's acceptance criteria into a concrete task list so nothing gets quietly skipped to finish faster.
- **`/plan-eng-review`** — Run before implementing any prompt that touches the database schema (Prompts 1, 4, 6). Validates schema changes, data flow, and RLS policy correctness against `PropLink_PRD.md` Section 4.
- **`/plan-design-review`** — Run before implementing any prompt that builds UI (Prompts 3, 4, 6, 7, 9). Validates the screen against the pixel-perfect UI/UX bar, not just functional correctness.
- **`/review`** — Run after every feature is built. Acts as a staff engineer reviewing the code for bugs, edge cases, and completeness gaps before any commit.
- **`/investigate`** — Run when something is broken and the root cause is unclear. Do not attempt fixes without investigation first.
- **`/qa`** — Run after a major feature is complete. Opens a real browser and tests the app end-to-end against the acceptance criteria in the relevant PRD epic.
- **`/cso`** — Run before any production deployment (Prompt 9). Audits the codebase for security issues specific to PropLink: landlord/tenant data isolation via RLS, payment status tampering (a tenant writing `status='confirmed'` directly), invite code brute-forcing or reuse, and lease/payment-proof document access control. Use OWASP Top 10 + STRIDE as the framework, scoped to these specific risks — not generic client-measurement/analytics concerns.
- **`/ship`** — Run when code is reviewed, QA-passed, and ready to commit. Runs tests, pushes to git, and opens a PR.
- **`/land-and-deploy`** — Run after a PR is approved. Merges, waits for CI, and verifies production health.
- **`/design-review`** — Reserved for the post-MVP UI revamp phase, once the full prompt pack is complete.

### Pre-build only (not part of the sprint loop)
- **`/office-hours`** — Use only before Prompt 0, for challenging or refining product scope. Do not invoke mid-sprint — scope is locked in `PropLink_PRD.md` once building starts; re-litigating it mid-prompt derails progress rather than improving it.

### Skill Invocation Order (Standard Sprint, per prompt)
```
/autoplan → (schema change? /plan-eng-review) → (UI involved? /plan-design-review)
→ Build → /review → /qa (on major features) → /cso (pre-deploy only)
→ /ship → /land-and-deploy
```

---

## 13. Standard Prompt Order

Full prompts live in `PropLink_Prompt_Pack.md`. This is the sequence, for quick reference:

| # | Prompt | Depends on |
|---|---|---|
| 0 | Scaffolding + `CONTEXT.md` | — |
| 1 | Database schema + Supabase RLS | 0 |
| 2 | Landlord auth + role-based routing | 1 |
| 3 | Properties & units CRUD | 2 |
| 4 | Leases: creation, timeline, document upload | 3 |
| 5 | Tenant onboarding via invite code | 4 |
| 6 | Payments: dual-party logging, mutual accountability, proof attachments | 5 |
| 7 | Notices, chat, realtime messaging | 6 |
| 8 | Automated rent reminders (email + WhatsApp) via cron | 7 |
| 9 | Polish, responsive hardening, deployment | 8 |

Do not start a prompt out of order — later prompts assume earlier ones' schema and routing decisions exist.

---

## 14. Definition of Done (per prompt)

A prompt isn't complete until:
- Every acceptance criterion listed for its epic in `PropLink_PRD.md` is satisfied.
- The prompt's own verification steps have been run and shown, not just claimed.
- `CONTEXT.md` is updated: current state, completed-steps checklist, any new key decisions, any known issues.
- `/review` has been run on the resulting code.
- No RLS policy was weakened or bypassed to make a test pass.

## 15. Glossary

- **Unit** — a single leasable space (flat, shop, office) within a property.
- **Lease** — a time-bound tenancy record linking one tenant to one unit.
- **Confirmed payment** — a payment whose `status` reflects the receiving party's (landlord's) authority; the only kind that reduces outstanding balance or suppresses reminders.
- **Pending payment** — a tenant-logged payment awaiting landlord confirmation.
- **Flagged payment** — a landlord-logged payment the tenant has disputed; requires landlord resolution but doesn't auto-change status.
- **Notice** — a landlord broadcast (reminder, maintenance, general, increment) to one unit, one property, or all properties.
- **Renewal window** — the configurable period (default 60 days) before a lease's end date during which its status shows as `renewal_due`.