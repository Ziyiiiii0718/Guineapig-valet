# Supabase Setup and Verification

This project is prepared for a real Supabase project, but remote authentication, migration, and RLS verification require local credentials and dashboard access. Do not paste private keys into Codex or commit them to Git.

## Dashboard Setup

1. Create a Supabase project.
2. Open the project settings and find the Project URL.
3. Find the client-safe Publishable key.
4. Create `.env.local` locally with:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-client-safe-publishable-key
```

5. Confirm `.env.local` remains ignored by Git.
6. In Authentication settings, enable email/password sign-in.
7. Configure redirect URLs:
   - `http://localhost:3000/auth/callback`
   - your deployed callback URL later, for example `https://your-domain.example/auth/callback`

## Auth Email Settings

Email confirmation may be disabled temporarily for local-only auth testing when the default Supabase email provider is rate limited.

Before production:

1. Re-enable email confirmation.
2. Configure custom SMTP for confirmation, recovery, and other auth emails.
3. Re-test registration, confirmed login, logout, session persistence, and protected dashboard access.

## Migration Options

Safest dashboard path for the initial database schema:

1. Open the Supabase SQL Editor.
2. Copy the SQL from `supabase/migrations/0001_initial_schema.sql`.
3. Review that it creates extensions, tables, indexes, RLS, and policies.
4. Run it once against the intended project.
5. Do not run destructive reset commands.

The project also includes `supabase/migrations/0002_pet_avatar_storage.sql`, which creates the private `pet-avatars` bucket and ownership-scoped Storage policies. Prefer applying this through the linked CLI migration workflow so local and remote migration history stay aligned.

CLI path, only if the Supabase CLI is installed and authenticated:

```bash
supabase link --project-ref your-project-ref
supabase migration list
supabase db push
supabase migration list
```

Verify the project reference before `db push`. Do not run remote reset commands.

## Manual RLS Verification Checklist

After applying the migration:

1. Confirm these tables exist: `profiles`, `pets`, `photos`, `pet_reference_photos`, `photo_pet_predictions`, `albums`, `album_photos`, `weight_records`, `health_records`.
2. Confirm RLS is enabled for every user-owned table.
3. Confirm policies compare ownership columns to `auth.uid()`.
4. Use two non-personal test accounts.
5. Create a pet row as User A.
6. Confirm User B cannot select, update, or delete User A's row.
7. Confirm User A cannot insert a row with User B's `user_id`.
8. Confirm the `pet-avatars` bucket is private, limited to JPEG/PNG/WEBP, and has a 5 MB size limit.
9. Confirm Storage policies allow users to access only their own top-level object folder.
10. Remove temporary test data only when safe.

The application must not rely on browser-submitted ownership IDs alone.
