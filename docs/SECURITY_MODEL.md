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

Missing and unauthorized pet IDs intentionally return the same safe not-found style behavior on reads. Pet deletion uses migration 0011's `delete_pet_transaction` SECURITY INVOKER RPC: it authenticates with `auth.uid()`, locks only an owned pet, checks the current name, and deletes atomically with label updates and relationship cascades. Missing, already deleted and unauthorized IDs all return `absent`, without a name or avatar path, for safe idempotent retries. Existing RLS is unchanged.

Invoker triggers also clean labels for direct deletes and lock referenced owned pets during prediction writes. Trigger functions have an empty search path and are not publicly executable. A stale write that names a deleted or unowned pet is rejected. The action retains avatar bytes and never deletes shared `user-photos` objects. Coordinated future maintenance is required to reclaim orphan avatars safely. Apply migration 0011 after 0010; neither is automatically applied by the application.

## Manual Photo Labeling

Migration 0012's `set_photo_labels` RPC uses SECURITY INVOKER, the session's `auth.uid()`, an owned photo lock and owned pet locks. It preserves existing RLS and 0011's reference guards, so a deleted or cross-account pet cannot be assigned. The action validates IDs, mutually exclusive pets/Unknown input and the revision before calling the RPC. The caller never supplies a trusted user ID or Storage path. Unknown and label removal require no AI service or Storage access.

Human-label revisions guard against concurrent corrections. AI processing updates separate machine columns; a database summary trigger prevents stale AI status writes from hiding current human labels. Changing labels and the photo summary commits together or rolls back together. No service-role key, model change, threshold change or production migration is needed for local implementation; migration 0012 must be applied separately after 0010 and 0011 before deployment.

## Service Role

The Supabase service-role key can bypass normal RLS behavior. This Phase 1A application does not require it. If a future maintenance script needs it, the key must be used only in trusted server contexts for carefully scoped operations. It must never be imported into client components or exposed in public environment variables.

## Publishable Key

The Publishable key is safe to expose to browser code because it identifies the Supabase project but does not grant unrestricted database access. Database authorization still depends on authenticated sessions and RLS policies.

The app also accepts the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` environment variable as a fallback, but new local setup should use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Private Storage

Pet profile avatars use a private Supabase Storage bucket named `pet-avatars`. Object paths follow `<authenticated-user-id>/<pet-id>/<unique-file-name>`.

Storage policies on `storage.objects` allow authenticated users to select, insert, update, and delete only objects whose first path folder matches `auth.uid()`. The application also checks the current Supabase user and pet ownership before preparing uploads, replacing, or removing an avatar.

The `pets.profile_photo_path` column stores only the object path, not a permanent URL. Server Components create short-lived signed URLs for rendering avatars on the dashboard, pet list, pet detail, and pet edit pages.

Avatar bytes upload directly with a scoped non-overwrite signed token. Finalization verifies Storage metadata and uses migration 0013’s owned-row, revision-checked `set_pet_avatar` RPC. Replacement/removal never delete Storage objects, avoiding cleanup races; private orphan bytes remain for coordinated maintenance. See [avatar storage](learning/10-pet-avatar-storage.md).

## General Photo Uploads

General photos use a separate private Supabase Storage bucket named `user-photos`. Object paths follow `<authenticated-user-id>/<year>/<month>/<unique-file-name>`.

The upload page asks the server for signed upload requests. The server reads the current Supabase user, generates the owner-scoped path, and never trusts a browser-submitted `user_id`. The browser uploads directly to Storage with the signed upload token, then the server validates metadata and inserts a `photos` row for the authenticated user.

PostgreSQL RLS protects `photos` rows by `user_id`. A database check also requires `storage_path` to begin with the row owner's ID. Storage policies separately protect file reads, writes, updates, and deletes by checking that the first folder in the object path matches `auth.uid()`.

The app stores object paths, not permanent public URLs. Finalization never deletes uploaded objects on validation or database failure: concurrent requests may already reference them. Duplicate or uncertain inserts are reconciled using the authenticated owner and exact Storage path under RLS. Unconfirmed failures retain private objects for safe retry; automatic orphan reclamation requires a coordinated upload lifecycle.

## Private Photo Browsing

Gallery and detail pages are Server Components. They derive the current user from Supabase Auth cookies, query `photos` with the authenticated `user_id`, and rely on RLS as defense in depth. A guessed photo ID for another account returns the same safe not-found behavior as a missing photo.

The `user-photos` bucket remains private. The server creates short-lived signed URLs only for rows already authorized for the current user and only after confirming that the object path starts with that user's ID. Signed URLs are sent to the browser for rendering but are not logged, stored in PostgreSQL, or made permanent.

## Private Photo Deletion

Photo deletion accepts only a photo UUID and verifies the current session. The `begin_photo_deletion` RPC is SECURITY INVOKER and filters by `auth.uid()`; existing photo RLS remains enforced. A narrowly scoped SECURITY DEFINER trigger atomically records the retired path when the photo is deleted. Trigger functions use an empty search path and are not publicly executable. Users may read only their own cleanup records and update only the completion timestamp; they cannot insert, change the target path, or delete tombstones.

Storage is removed only after the RPC confirms the owned deletion record. A restrictive Storage DELETE policy adds a committed-tombstone and no-live-reference requirement to the existing owner policy. This protects against stale authenticated clients as well as action retries. Permanent tombstones and serialized lifecycle triggers prevent delayed upload finalization from recreating metadata at a retired path. Legacy reference-path mismatches block cleanup rather than risking shared bytes. Service-role/database-owner operations can bypass RLS and must follow the same protocol operationally.

Storage errors leave durable pending cleanup rather than broken photo rows. No background cleanup service is installed. Migration 0010 must be reviewed and applied separately before deployment; the action fails safely if it is absent. See learning/12-private-photo-gallery.md for retry and maintenance requirements.

## Private Photo Name Updates

Editable photo names are PostgreSQL metadata only. The Server Action validates the photo UUID and name, derives the current user from Supabase Auth, reads and updates with both photo ID and authenticated `user_id`, and never accepts a browser-supplied owner or Storage path. Existing photo update RLS remains the database-level backstop. The update changes only `display_name` and `updated_at`; original filenames and private Storage objects remain unchanged.

## Private Album Authorization

Album Server Actions derive the current user from the server-side Supabase session and scope every album/photo read and mutation by that user. Browser forms submit only resource IDs and editable metadata, never a trusted `user_id`. RLS protects both `albums` and `album_photos`. For defense in depth, composite foreign keys require `album_photos.user_id` to match both the album owner and photo owner, preventing a User A album from referencing a User B photo. Signed URLs are generated only after owner-scoped photo queries and are never persisted or logged.

Deleting an album issues no Storage operation and no photo-table delete. PostgreSQL cascades from the album only to its membership rows. Removing a membership similarly deletes only one `album_photos` row.

## AI reference-photo authorization

Reference-photo Server Actions authenticate with the existing Supabase cookie session, verify the requested pet under the current owner, and load every selected photo through the same owner. Forms never submit a trusted `user_id` or Storage path. PostgreSQL RLS repeats the `auth.uid()` rule, while composite pet-owner and photo-owner foreign keys make a cross-user relationship invalid even if application validation regresses. A unique pet/photo key prevents duplicates.

Next.js obtains the Storage path only from the authorized `photos` row, checks its owner prefix, and downloads through the private bucket using the user's session. It sends only in-memory image bytes and MIME type to the AI service. Signed URLs, image bytes, and embedding values are not logged. Removing a reference issues no Storage or `photos` deletion.

The FastAPI `/embed` endpoint requires a server-only bearer token shared through `AI_SERVICE_TOKEN`; it is never named `NEXT_PUBLIC_*` or sent to browser code. The service has no Supabase key and cannot bypass RLS. It accepts only raw JPEG/PNG/WEBP bodies, never a remote URL, which avoids an SSRF fetch surface. Images are decoded and processed in memory without local persistence. User-visible failures are sanitized categories rather than Python or PyTorch traces.

## AI classification and review authorization

Analyze and Retry accept only a photo UUID. The Server Action authenticates the session, reads the photo with both `id` and current `user_id`, verifies the owner-prefixed Storage path, and uses that owned path for a private bucket download. The browser never supplies a trusted owner, path, vector, candidate, model result, or AI token.

Ready reference embeddings are selected only under the same `user_id` and must match the configured model, version, and dimension. Similarity runs in server-only Next.js code. FastAPI receives only authorized image bytes, MIME type, and its server bearer credential; it receives no user/pet IDs, Supabase key, signed URL, reference vector, or final label.

Review actions load the existing prediction under the current owner. Confirm uses the server-stored suggestion. Correction validates every submitted pet UUID and queries all of them under the owner. Database RLS independently verifies the photo and every candidate, suggestion, and confirmed pet ID. A rollback-only authenticated two-user test verified cross-user prediction reads/updates, cross-user photo prediction insertion, and attaching another user's pet label are rejected.

Prediction rows and candidate metadata are private. Logs expose only sanitized error categories and never cookies, access tokens, credentials, signed URLs, image bodies, or embedding vectors. `.env.local`, local evaluation data, virtual environments, and model caches are ignored. The AI service still has no Supabase service-role credential.

## Private Weight Records

Weight actions authenticate on the server, verify the referenced pet under the current `user_id`, and scope record reads and mutations by record, pet, and owner. RLS is the database backstop. A composite foreign key requires the record owner to match the pet owner. No service role or Storage access is used.

## Phase 5 health-record security

Health Server Actions never accept ownership as authoritative browser input. They authenticate the current user, confirm the pet is owned, and scope record reads and writes by user, pet, and record ID. RLS policies and the composite pet-owner foreign key provide database enforcement. Titles and notes render as text, raw database errors are not returned, and no service-role credential is used.

## Atomic AI classification

Migration 0014 adds SECURITY INVOKER start/finish classification RPCs. They require `auth.uid()`, lock only the owned photo and prediction, retain RLS, and commit prediction and photo status together. Completion rejects superseded tokens and uses current manual labels when deriving the photo summary. Machine-result fields are explicitly allowlisted; payloads cannot replace human labels or identity fields. No Storage, model or threshold changes are included. Apply after 0013 and drain old application requests during rollout; see [classification learning notes](learning/18-ai-photo-classification-and-review.md#24-atomic-classification-attempts-migration-0014).
