# 03. Supabase Authentication

## What This Feature Does

Supabase Auth is wired for email/password registration, login, logout, session handling, and protected dashboard access.

## Why It Is Needed

PiggieVault stores private pet photos and care notes. Users must prove who they are before accessing private data.

## Complete Request and Data Flow

```text
User submits email/password -> server action validates form -> Supabase Auth validates credentials -> session cookie is set -> proxy and dashboard check the session -> user reaches dashboard
```

## Important Files

- `app/actions/auth.ts`
- `components/auth-form.tsx`
- `lib/validation/auth.ts`
- `lib/supabase/server.ts`
- `proxy.ts`
- `.env.example`

## Responsibilities

The form collects inputs. Zod validates shape. Server actions call Supabase. The proxy protects routes. Supabase stores credentials and manages sessions.

Registration uses the request origin to build an absolute `/auth/callback` URL, so Supabase email confirmation can return to the local or deployed site correctly.

## Concepts

Intuitive: authentication is checking identity.

PiggieVault example: only the signed-in owner should see their dashboard.

Technical: Supabase Auth creates a user in `auth.users` and exposes the identity through session cookies and `auth.uid()` in PostgreSQL policies.

Interview explanation: "I do not store passwords myself; Supabase Auth handles credential security and the app uses the resulting user ID for authorization."

## Why This Implementation Was Chosen

Supabase Auth reduces security risk and integrates naturally with PostgreSQL RLS.

## Alternatives and Trade-offs

NextAuth/Auth.js: flexible, but separate from Supabase RLS identity. Custom auth: educational but risky and time-consuming. Magic links only: simpler password handling, but requirements request email/password.

## Security, Privacy, Performance, Failure

Passwords never enter application tables. Missing config is handled clearly. Invalid credentials return an error. The service-role key is not used in browser code.

## Common Mistakes

- Storing plaintext passwords.
- Trusting a browser-submitted `user_id`.
- Leaking service-role keys.
- Forgetting email confirmation behavior.
- Treating login as authorization for every row.

## Interview Questions

1. Where are passwords stored? In Supabase Auth, not app tables.
2. What is `auth.users`? Supabase's internal user table.
3. What does logout do? Clears the Supabase session.
4. Why validate forms before Supabase? To provide predictable errors and avoid bad requests.
5. What still needs real credentials? End-to-end registration, email confirmation, login, logout, and session persistence testing.

## How I would explain this feature in 60 seconds.

PiggieVault uses Supabase Auth so I do not build password storage myself. The login and registration forms submit to server actions, which validate email and password input and call Supabase. If authentication succeeds, Supabase creates or updates the session cookie. The proxy and dashboard check that session server-side, and database policies use the same authenticated user ID to protect rows.

## Glossary

- Authentication: verifying identity.
- Session: proof that a user is logged in.
- Cookie: browser storage sent with requests.
- Credential: login secret such as a password.
- `auth.uid()`: Supabase SQL helper for current user ID.
