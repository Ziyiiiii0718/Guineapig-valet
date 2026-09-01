# Supabase Verification

Last verified: 2026-07-21

Project ref: `urhwguxmvpxhlmgudrkm`

## Connection Status

The repository was linked to the real Supabase project with the normal Supabase CLI linked-project workflow.

Local environment detection confirmed:

- `.env.local` exists.
- `NEXT_PUBLIC_SUPABASE_URL` is present.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is present.
- `.env.local` is ignored by Git.

No `.env.local` values, publishable key values, secret keys, or service-role keys were printed or committed.

## Migration Status

Applied migrations:

- `supabase/migrations/0001_initial_schema.sql`
- `supabase/migrations/0002_pet_avatar_storage.sql`
- `supabase/migrations/0003_user_photo_upload_storage.sql`

The `0003` migration creates the private `user-photos` bucket, general-photo Storage policies, `photos.mime_type`, the `uploaded` photo AI status value, and a storage-path ownership check.

Remote migration status after `db push`:

- local `0001`
- remote `0001`
- local `0002`
- remote `0002`
- local `0003`
- remote `0003`

No remote database reset command was run.

## Phase 2C Migration Status

Migration `supabase/migrations/0004_photo_display_names.sql` was applied to the linked project on 2026-08-25 after a dry run confirmed it was the only pending migration. Migration history now reports local and remote versions `0001` through `0004` as synchronized. No database reset was run, and no previously applied migration was modified.

Read-only catalog verification confirmed that `photos.display_name` is nullable `text` with no default. The `photos_display_name_check` constraint permits `NULL` or a trimmed value between 1 and 80 characters. Both existing photo rows remained present with `display_name = NULL`, `photos` still has RLS enabled, and the existing SELECT, INSERT, UPDATE, and DELETE ownership policies remain installed.

## Phase 3 Album Migration Status

Migration `supabase/migrations/0005_private_photo_albums.sql` was applied on 2026-08-25 after a linked dry run confirmed it was the only pending migration. Local and remote migration histories synchronize through `0005`; no reset or earlier-migration edit occurred.

Remote catalog verification confirmed RLS remains enabled on `albums` and `album_photos`, with four album policies and three membership policies. Both composite ownership foreign keys are installed. Existing data remained intact: one pet and four photos were present after migration; the dormant album tables began empty.

A rollback-only two-user database test passed. User A created an album and attached User A's photo. User A could not attach User B's photo. User B could not view, edit, delete, add to, or remove membership from User A's album. All temporary photo, album, and membership rows were rolled back.

## Phase 4 Weight Migration Status

Migration `0006_pet_weight_tracking.sql` was applied on 2026-08-25 after a dry run confirmed it was the only pending migration. It adds a 100–5000 g constraint, composite pet-owner foreign key, and stable history index without resetting data or editing earlier migrations. Local and remote histories synchronize through 0006.

Remote verification confirmed four weight RLS policies, RLS enabled, an empty initial weight table, and preservation of two pets, four photos, and three albums. A rollback-only two-user test confirmed User A could add a record to User A's pet but not User B's pet, while User B could not read, edit, or delete User A's record.

## Remote Schema Verified

Extensions verified:

- `pgcrypto`
- `vector`

Tables verified:

- `profiles`
- `pets`
- `photos`
- `pet_reference_photos`
- `photo_pet_predictions`
- `albums`
- `album_photos`
- `weight_records`
- `health_records`

Constraints verified through PostgreSQL catalog queries:

- primary keys
- foreign keys
- check constraints
- unique constraints

Indexes verified:

- `profiles_created_at_idx`
- `pets_user_id_idx`
- `photos_user_taken_at_idx`
- `pet_reference_photos_user_pet_idx`
- `photo_pet_predictions_user_photo_idx`
- `albums_user_id_idx`
- `album_photos_user_album_idx`
- `weight_records_user_pet_recorded_idx`
- `health_records_user_pet_date_idx`

RLS verified:

- RLS is enabled on all nine user-owned tables.
- 34 policies exist.
- Policies reference `auth.uid()`.
- Anonymous insert into `pets` while claiming a `user_id` was rejected.
- Simulated authenticated own-row insert into `pets` succeeded inside a transaction and was rolled back.
- Two-user runtime RLS checks confirmed User A could create, read, update, and delete User A's pet while User B could not read, update, delete, or spoof ownership for that pet.

## Storage Verified

Private pet avatar Storage verified:

- Bucket `pet-avatars` exists.
- Bucket is private.
- Bucket file size limit is 5 MB.
- Allowed MIME types are `image/jpeg`, `image/png`, and `image/webp`.
- Storage policies exist for select, insert, update, and delete on own pet-avatar objects.

Runtime Storage checks with two non-personal authenticated users confirmed:

- User A could upload an avatar under User A's top-level folder.
- User A could store the object path in `pets.profile_photo_path`.
- User A could create a signed URL for the avatar.
- User B could not download User A's avatar.
- User B could not upload into User A's top-level folder.
- The bucket rejected `text/plain`.
- User B could upload into User B's own top-level folder.
- User B could not delete User A's avatar.
- User A could remove User A's avatar.
- Temporary avatar objects and the temporary pet row were cleaned up where permitted.

Private general photo Storage verified:

- Bucket `user-photos` exists.
- Bucket is private.
- Bucket file size limit is 10 MB.
- Allowed MIME types are `image/jpeg`, `image/png`, and `image/webp`.
- Storage policies exist for select, insert, update, and delete on own general-photo objects.
- Policy checks require the first object path folder to match `auth.uid()`.

Photo metadata migration verified:

- `photos.mime_type` exists.
- `photos.ai_status` allows `uploaded`.
- `photos.storage_path` must begin with the row's `user_id`.

## Authentication Verified

Verified with the real Supabase Auth endpoint:

- Registration endpoint is reachable.
- Non-personal test registration succeeds.
- Email confirmation is enabled; signup returns a user but no session.
- Immediate login before email confirmation returns `Email not confirmed`.
- Invalid credentials return `Invalid login credentials`.
- Unauthenticated `/dashboard` requests redirect to `/login?message=Please+log+in+to+view+your+dashboard.`

Local follow-up testing temporarily disabled email confirmation after the built-in Supabase email provider reached its rate limit. This is acceptable for local verification only.

Verified locally while email confirmation was temporarily disabled:

- Registration creates a session and reaches `/dashboard`.
- Reloading `/dashboard` preserves the authenticated session.
- Direct authenticated access to `/dashboard` works.
- Logout clears the session and redirects to `/`.
- After logout, direct `/dashboard` access redirects to `/login?message=Please+log+in+to+view+your+dashboard.`
- Logging in again with the same non-personal test account reaches `/dashboard`.

Production requirement:

- Re-enable email confirmation before production.
- Configure custom SMTP before production so confirmation, recovery, and other auth emails are reliable and not dependent on the default shared Supabase email provider limits.

Not fully verified yet:

- Production-style email confirmation with custom SMTP.

The remaining blocker is custom SMTP plus production-style confirmed-email registration.

## Remaining Manual Verification

To finish the production auth and two-user checks:

1. Configure custom SMTP.
2. Re-enable email confirmation.
3. Create or confirm two non-personal test users in Supabase Auth.
4. Confirm registration email delivery and `/auth/callback`.
5. Log in locally as User A.
6. Confirm `/dashboard` renders the authenticated dashboard.
7. Log out and confirm the session clears.
8. Log in as User B.
9. Re-run two-user row and Storage checks with confirmed-email users.
10. Clean up temporary test data where safe.

To finish Phase 2A two-user runtime photo-upload checks:

1. With two non-personal confirmed users, confirm User A can upload/read/delete User A's object.
2. Confirm User B cannot read, overwrite, or delete User A's object.
3. Confirm User B cannot read User A's `photos` row.
4. Confirm User B cannot create a `photos` row whose `storage_path` starts with User A's ID.
5. Clean up temporary test rows and objects where safe.

## Phase 5 health records — 2026-08-25

- Linked migration history initially showed `0001`–`0006` synchronized and only `0007_private_pet_health_records.sql` pending.
- `supabase db push --linked --dry-run` confirmed only migration 0007 would run.
- Migration 0007 applied successfully without a reset; a follow-up migration list showed local and remote `0001`–`0007` synchronized.
- The migration added the controlled `record_type`, unified bounded `notes`, composite pet-owner foreign key, and deterministic history index while preserving the legacy columns and rows.
- A generated two-user test confirmed owner create succeeds; cross-user pet insertion is rejected; another user reads, updates, and deletes zero rows; and the owner's row remains unchanged.
- Generated pets and health rows were removed through owner-scoped deletes. No service-role key was used. Generated Auth users remain because client-safe credentials cannot administer Auth users.
- RLS stayed enabled with the existing four owner policies. Migration success plus the two-user test verified the category/relationship constraints and owner isolation.
