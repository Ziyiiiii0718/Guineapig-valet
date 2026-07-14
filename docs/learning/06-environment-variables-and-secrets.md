# 06. Environment Variables and Secrets

## What This Feature Does

The app validates required Supabase public environment variables and documents server-only secrets.

## Why It Is Needed

Credentials must not be hard-coded. Different environments need different configuration.

## Complete Request and Data Flow

```text
App starts -> env helper checks required keys -> configured app creates Supabase client -> missing config shows setup notice
```

## Important Files

- `.env.example`
- `lib/env.ts`
- `components/config-notice.tsx`
- `README.md`

## Responsibilities

`.env.example` lists placeholder names. `lib/env.ts` validates values. UI notices explain missing config. Real values belong in `.env.local`, which is ignored by Git.

## Concepts

Intuitive: environment variables are settings kept outside code.

PiggieVault example: the Supabase URL and anon key point the app at the correct backend.

Technical: `NEXT_PUBLIC_` variables are bundled for browser use; server-only variables must never be exposed to client bundles.

Interview explanation: "I separate public config from secrets and validate required values before creating clients."

## Why This Implementation Was Chosen

It avoids fake credentials and makes setup failure understandable.

## Alternatives and Trade-offs

Throw on startup: strict, but annoying before setup. Silent missing values: confusing. Committing `.env`: dangerous.

## Security, Privacy, Performance, Failure

No real secrets are committed. Missing config does not leak details. Service-role key is documented as server-only because it can bypass RLS.

## Common Mistakes

- Committing `.env.local`.
- Putting service-role keys in `NEXT_PUBLIC_` variables.
- Logging secret values.
- Claiming auth works without credentials.
- Using different variable names than documentation.

## Interview Questions

1. Why use `.env.example`? To document required config without secrets.
2. What does `NEXT_PUBLIC_` mean? Browser-visible configuration.
3. Why is service role dangerous? It can bypass RLS.
4. What happens if config is missing? The app shows a setup notice.
5. Why validate environment variables? To fail clearly and early.

## How I would explain this feature in 60 seconds.

PiggieVault uses environment variables for external configuration like Supabase project URL and keys. The `.env.example` file shows the names but no real values. Public Supabase values are allowed in the browser, while service-role and future AI keys must stay server-only. The app validates required keys and shows a clear setup message instead of pretending authentication is configured.

## Glossary

- Environment variable: runtime configuration value.
- Secret: sensitive credential.
- Public key: safe-to-expose project value.
- Service role: privileged Supabase key.
- `.env.local`: local uncommitted environment file.
