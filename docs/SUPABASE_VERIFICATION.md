# Supabase Verification

Last verified: 2026-07-19

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

Applied migration:

- `supabase/migrations/0001_initial_schema.sql`

Remote migration status after `db push`:

- local `0001`
- remote `0001`

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
- Full two-user RLS isolation.

The remaining blocker is custom SMTP plus two confirmed non-personal test users.

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
9. Confirm User B cannot select, update, or delete User A's rows.
10. Clean up temporary test data where safe.
