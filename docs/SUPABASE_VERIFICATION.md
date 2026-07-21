# Supabase Verification

Last verified: 2026-07-20

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

Remote migration status after `db push`:

- local `0001`
- remote `0001`
- local `0002`
- remote `0002`

No remote database reset command was run.

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
