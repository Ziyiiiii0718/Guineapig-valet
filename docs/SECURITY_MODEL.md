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

## Pet Profile Mutations

Phase 1B pet-profile create, update, and delete actions check authentication inside each Server Action. The browser never submits a trusted `user_id`; create actions assign ownership from the authenticated Supabase user. Update and delete actions query and mutate with both pet ID and authenticated owner ID, while RLS remains enabled as defense in depth.

Missing and unauthorized pet IDs intentionally return the same safe not-found style behavior so the app does not reveal whether another user's private pet exists.

## Service Role

The Supabase service-role key can bypass normal RLS behavior. This Phase 1A application does not require it. If a future maintenance script needs it, the key must be used only in trusted server contexts for carefully scoped operations. It must never be imported into client components or exposed in public environment variables.

## Publishable Key

The Publishable key is safe to expose to browser code because it identifies the Supabase project but does not grant unrestricted database access. Database authorization still depends on authenticated sessions and RLS policies.

The app also accepts the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` environment variable as a fallback, but new local setup should use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Private Storage

Pet profile avatars use a private Supabase Storage bucket named `pet-avatars`. Object paths follow `<authenticated-user-id>/<pet-id>/<unique-file-name>`.

Storage policies on `storage.objects` allow authenticated users to select, insert, update, and delete only objects whose first path folder matches `auth.uid()`. The application also checks the current Supabase user and pet ownership before uploading, replacing, removing, or cleaning up an avatar.

The `pets.profile_photo_path` column stores only the object path, not a permanent URL. Server Components create short-lived signed URLs for rendering avatars on the dashboard, pet list, pet detail, and pet edit pages.

Replacing an avatar is not a single database transaction because PostgreSQL and Storage are separate systems. The app uploads the new object first, updates the pet row only after upload succeeds, then best-effort removes the old object. If the database update fails, the newly uploaded object is removed best-effort. If old-object cleanup fails, the user-facing profile still points to the new valid object and an orphan can be cleaned later.

General photo uploads, reference-photo uploads, albums, weight records, health records, and AI classification are still separate future phases.
