# 05. Row Level Security

## What This Feature Does

The SQL migration enables RLS and creates policies so users can access only their own PiggieVault data.

## Why It Is Needed

Pet photos and health notes are private. Authorization must be enforced even if frontend code has a bug.

## Complete Request and Data Flow

```text
Request includes Supabase session -> PostgreSQL knows auth.uid() -> RLS policy checks row user_id -> allowed rows are returned
```

Remote RLS behavior must be verified against a real Supabase project after the migration is applied. Static SQL review is useful, but it is not the same as executing two-user isolation tests.

## Important Files

- `supabase/migrations/0001_initial_schema.sql`
- `docs/SECURITY_MODEL.md`
- `lib/supabase/server.ts`

## Responsibilities

Policies define who can select, insert, update, and delete each row. `USING` checks existing rows. `WITH CHECK` checks new or changed rows.

## Concepts

Intuitive: RLS is a locked filing cabinet where each user only gets their own drawer.

PiggieVault example: User A cannot read User B's photo rows because `auth.uid()` does not match `photos.user_id`.

Technical: RLS is PostgreSQL authorization evaluated per row.

Interview explanation: "I use RLS because frontend filtering is not security; the database itself refuses unauthorized rows."

## Why This Implementation Was Chosen

Supabase makes RLS a first-class way to enforce user isolation.

## Alternatives and Trade-offs

Application-only authorization: flexible but easier to bypass with bugs. Database views: useful but not a full replacement for policies. Service-only database access: can work, but reduces the benefit of Supabase client patterns.

## Security, Privacy, Performance, Failure

Policies must include both read and write checks. Service-role credentials bypass RLS, so they must remain server-only. Indexes on `user_id` help policy-filtered queries.

## Common Mistakes

- Enabling RLS but forgetting policies.
- Writing insert policies without `WITH CHECK`.
- Trusting user-submitted `user_id`.
- Using service-role keys from client code.
- Forgetting relationship checks for join tables.

## Interview Questions

1. What is RLS? Row-level database authorization.
2. What is `auth.uid()`? The authenticated user's ID inside Supabase SQL.
3. What is `USING`? It filters existing rows.
4. What is `WITH CHECK`? It validates inserted or updated rows.
5. Why still validate on the backend? For better errors and defense in depth.
6. How do you test RLS? Create two test users, insert data for User A, then confirm User B cannot read or modify it.

## How I would explain this feature in 60 seconds.

Row Level Security is the main privacy layer for PiggieVault. Each private table has a `user_id`, and policies compare it to `auth.uid()`, which comes from the Supabase session. `USING` controls what rows a user can read or change, and `WITH CHECK` prevents them from writing rows owned by someone else. This means even if the UI or a query is wrong, the database still protects user data.

## Glossary

- RLS: Row Level Security.
- Policy: SQL rule for row access.
- `USING`: condition for existing rows.
- `WITH CHECK`: condition for new row values.
- Defense in depth: multiple layers of protection.
