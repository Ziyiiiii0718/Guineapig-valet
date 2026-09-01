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

## General Photo Uploads

General photos use a separate private Supabase Storage bucket named `user-photos`. Object paths follow `<authenticated-user-id>/<year>/<month>/<unique-file-name>`.

The upload page asks the server for signed upload requests. The server reads the current Supabase user, generates the owner-scoped path, and never trusts a browser-submitted `user_id`. The browser uploads directly to Storage with the signed upload token, then the server validates metadata and inserts a `photos` row for the authenticated user.

PostgreSQL RLS protects `photos` rows by `user_id`. A database check also requires `storage_path` to begin with the row owner's ID. Storage policies separately protect file reads, writes, updates, and deletes by checking that the first folder in the object path matches `auth.uid()`.

The app stores object paths, not permanent public URLs. If Storage succeeds but metadata insertion fails, the server performs best-effort cleanup of the uploaded object.

## Private Photo Browsing

Gallery and detail pages are Server Components. They derive the current user from Supabase Auth cookies, query `photos` with the authenticated `user_id`, and rely on RLS as defense in depth. A guessed photo ID for another account returns the same safe not-found behavior as a missing photo.

The `user-photos` bucket remains private. The server creates short-lived signed URLs only for rows already authorized for the current user and only after confirming that the object path starts with that user's ID. Signed URLs are sent to the browser for rendering but are not logged, stored in PostgreSQL, or made permanent.

## Private Photo Deletion

Photo deletion never trusts a browser-submitted Storage path. The Server Action receives only a photo ID, verifies the current user, reads the row by `id` and `user_id`, checks the owner-prefixed path, deletes the private Storage object, then deletes the PostgreSQL row.

The app deletes Storage first because an orphaned private object is harder for a user to notice than a failed metadata deletion. If Storage deletion fails, the row is kept. If row deletion fails after Storage succeeds, the app reports a partial failure and leaves a metadata record that can be retried or cleaned up later.

## Private Photo Name Updates

Editable photo names are PostgreSQL metadata only. The Server Action validates the photo UUID and name, derives the current user from Supabase Auth, reads and updates with both photo ID and authenticated `user_id`, and never accepts a browser-supplied owner or Storage path. Existing photo update RLS remains the database-level backstop. The update changes only `display_name` and `updated_at`; original filenames and private Storage objects remain unchanged.

## Private Album Authorization

Album Server Actions derive the current user from the server-side Supabase session and scope every album/photo read and mutation by that user. Browser forms submit only resource IDs and editable metadata, never a trusted `user_id`. RLS protects both `albums` and `album_photos`. For defense in depth, composite foreign keys require `album_photos.user_id` to match both the album owner and photo owner, preventing a User A album from referencing a User B photo. Signed URLs are generated only after owner-scoped photo queries and are never persisted or logged.

Deleting an album issues no Storage operation and no photo-table delete. PostgreSQL cascades from the album only to its membership rows. Removing a membership similarly deletes only one `album_photos` row.

Reference-photo uploads and AI classification remain separate future phases.

## Private Weight Records

Weight actions authenticate on the server, verify the referenced pet under the current `user_id`, and scope record reads and mutations by record, pet, and owner. RLS is the database backstop. A composite foreign key requires the record owner to match the pet owner. No service role or Storage access is used.

## Phase 5 health-record security

Health Server Actions never accept ownership as authoritative browser input. They authenticate the current user, confirm the pet is owned, and scope record reads and writes by user, pet, and record ID. RLS policies and the composite pet-owner foreign key provide database enforcement. Titles and notes render as text, raw database errors are not returned, and no service-role credential is used.
