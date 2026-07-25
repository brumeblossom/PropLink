# Project State — PropLink Scaffolding

This document logs the current status of the PropLink project scaffolding, details the architectural components, and documents the libraries installed.

## Scaffolding Status

The project is successfully initialized with a Next.js 14 App Router skeleton. All core components of the tech stack are installed and configured:

| Tech Stack Component | Status | Details |
|---|---|---|
| **Next.js 14** (App Router, TypeScript) | ✅ Configured | App Router structure with `src/` directory. |
| **Tailwind CSS + shadcn/ui** | ✅ Configured | Theme initialized with default/base-nova style, neutral base color, and CSS variables. |
| **Zustand** | ✅ Configured | Client state store setup with initial sidebar and user role settings. |
| **TanStack Query** | ✅ Configured | Configured alongside tRPC client to manage query caching and server mutations. |
| **tRPC (v11)** | ✅ Configured | App Router fetch adapter route created, client React Query hooks configured, and layout providers wrapped. |
| **Prisma ORM** | ✅ Migrated & Configured | Schema applied cleanly to Supabase. Triggers (lease overlap, payment edits lock) and Row-Level Security (RLS) policies implemented. |
| **Supabase JS & Auth** | ✅ Implemented | Supabase Auth integrated with cookie-based SSR. Signup/Login pages, callback route handler, and procedures (`auth.signupLandlord`, `auth.login`, `auth.logout`, `auth.me`) fully operational. |

## Installed Packages

### Core Dependencies
- `next`: `14.2.35`
- `react`, `react-dom`: `^18`
- `@prisma/client`: `^6.19.3`
- `@supabase/supabase-js`: `^2.110.8`
- `@tanstack/react-query`: `^5.101.4`
- `@trpc/client`, `@trpc/server`, `@trpc/react-query`: `^11.18.0`
- `zustand`: `^5.0.14`
- `class-variance-authority`: `^0.7.1`
- `clsx`, `tailwind-merge`: for styling utilities
- `lucide-react`: icons library

### Dev Dependencies
- `prisma`: `^6.19.3`
- `tailwindcss`: `^3.4.1`
- `typescript`: `^5`
- `eslint`, `eslint-config-next`: `14.2.35`

## Scaffolding Architecture

```
/
├── prisma/
│   └── schema.prisma         # Prisma database schema definition (mapped to Postgres)
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx # Landlord Login Page
│   │   │   └── signup/page.tsx # Landlord Signup Page
│   │   ├── (dashboard)/
│   │   │   ├── landlord/page.tsx # Landlord Dashboard Page
│   │   │   └── tenant/page.tsx # Tenant Portal Dashboard Placeholder
│   │   ├── api/
│   │   │   ├── auth/callback/route.ts # Supabase Auth callback redirect handler
│   │   │   └── trpc/[trpc]/route.ts  # tRPC API adapter
│   │   ├── fonts/            # Local fonts
│   │   ├── globals.css       # Tailwind variables and overrides
│   │   ├── layout.tsx        # Layout wrapped with Providers
│   │   ├── page.tsx          # Redirects immediately to login page
│   │   └── providers.tsx     # TanStack + tRPC provider
│   ├── middleware.ts         # Edge middleware for route protection & role redirection
│   ├── utils/
│   │   ├── supabase/
│   │   │   ├── client.ts     # Supabase Browser Client factory
│   │   │   └── server.ts     # Supabase Server/SSR Client factory
│   │   └── trpc.ts           # tRPC client hook helpers
│   ├── components/
│   │   └── ui/
│   │       └── button.tsx    # default shadcn/ui button component
│   ├── lib/
│   │   ├── prisma.ts         # Singleton export of PrismaClient
│   │   ├── supabase.ts       # Supabase client instantiation
│   │   └── utils.ts          # shadcn classes merging helper
│   ├── store/
│   │   └── useStore.ts       # Zustand client state store
│   └── utils/
│       └── trpc.ts           # Client-side tRPC hooks creator
├── .env                      # environment variables template
└── components.json           # shadcn compiler preferences
```
