# Security Model

## Core Principles

- Passwords are managed by Supabase Auth.
- Application tables store user-owned data, not password credentials.
- Browser code only receives the Supabase Project URL and a client-safe Publishable key.
- Secret and service-role credentials must remain server-only because they can bypass Row Level Security.
- Server code validates user identity before sensitive operations.
- PostgreSQL Row Level Security enforces user isolation at the database layer.

## Authentication vs Authorization

Authentication answers: who is this user?

Authorization answers: what is this user allowed to access?

Supabase Auth authenticates the user and exposes their identity through the session. RLS policies authorize row access by comparing ownership columns to `auth.uid()`.

## RLS Basics

`USING` controls which existing rows a user may read, update, or delete.

`WITH CHECK` controls which new or changed rows a user may insert or update.

Both matter. A user should not be able to insert a pet row for another `user_id`, even if the frontend never shows that option.

## Why Frontend Filtering Is Not Enough

Frontend filtering can be bypassed by direct HTTP requests or browser tooling. RLS keeps the database from returning another user's private data even if application code has a bug.

## Service Role

The Supabase service-role key can bypass normal RLS behavior. This Phase 1A application does not require it. If a future maintenance script needs it, the key must be used only in trusted server contexts for carefully scoped operations. It must never be imported into client components or exposed in public environment variables.

## Publishable Key

The Publishable key is safe to expose to browser code because it identifies the Supabase project but does not grant unrestricted database access. Database authorization still depends on authenticated sessions and RLS policies.

The app also accepts the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` environment variable as a fallback, but new local setup should use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Private Storage

Photo storage will use private buckets and signed access or server-mediated reads in a later phase. Storage paths should include ownership-aware structure, and database rows should still be protected by RLS.
