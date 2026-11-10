# 06. Environment Variables and Secrets

## What This Feature Does

The app validates required Supabase public environment variables and avoids requiring server-only secrets in Phase 1A.

## Why It Is Needed

Credentials must not be hard-coded. Different environments need different configuration.

## Complete Request and Data Flow

```text
App starts -> env helper checks Project URL and Publishable key -> configured app creates Supabase client -> missing config shows setup notice
```

## Important Files

- `.env.example`
- `lib/env.ts`
- `components/config-notice.tsx`
- `README.md`

## Responsibilities

`.env.example` lists placeholder names. `lib/env.ts` validates values. UI notices explain missing config. Real values belong in `.env.local`, which is ignored by Git.

New setup should use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The code still accepts `NEXT_PUBLIC_SUPABASE_ANON_KEY` as a fallback for older local environments.

## Concepts

Intuitive: environment variables are settings kept outside code.

PiggieVault example: the Supabase Project URL and Publishable key point the app at the correct backend.

Technical: `NEXT_PUBLIC_` variables are bundled for browser use; server-only variables must never be exposed to client bundles. A Publishable key is client-safe, but a secret or service-role key can bypass normal protections and must stay server-only.

Interview explanation: "I separate public config from secrets and validate required values before creating clients."

## Why This Implementation Was Chosen

It avoids fake credentials and makes setup failure understandable.

## Alternatives and Trade-offs

Throw on startup: strict, but annoying before setup. Silent missing values: confusing. Committing `.env`: dangerous.

## Security, Privacy, Performance, Failure

No real secrets are committed. Missing config does not leak details. Service-role keys are deliberately not required for Phase 1A because they can bypass RLS.

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

PiggieVault uses environment variables for external configuration like the Supabase Project URL and Publishable key. The `.env.example` file shows the names but no real values. Public Supabase values are allowed in the browser, while secret and service-role keys must stay server-only. The app validates required keys and shows a clear setup message instead of pretending authentication is configured.

## Glossary

- Environment variable: runtime configuration value.
- Secret: sensitive credential.
- Public key: safe-to-expose project value.
- Publishable key: current Supabase name for a client-safe key.
- Service role: privileged Supabase key.
- `.env.local`: local uncommitted environment file.

## CI uses generated local configuration

The [release verification workflow](../CI.md) does not receive staging or production secrets. Its first guard rejects inherited Supabase/database/AI/Vercel settings instead of guessing whether a supplied URL or key is safe. The existing browser launcher then creates a disposable local Supabase project and supplies its generated public key to an isolated production build. A public local key does not grant the application's browser administrative privileges; the generated service key stays in the test fixture process.

A fresh runner is a temporary test computer. Normal teardown removes only resources with generated test names; an always-run fallback handles test failures, and runner disposal bounds cleanup after an abrupt shutdown. The fallback deliberately refuses ordinary developer machines. No browser trace or raw log is uploaded: a small artifact reports only which checks passed or failed. This sacrifices some remote debugging detail to keep credentials and synthetic session material out of downloadable artifacts.

CI permission settings control the workflow's GitHub token. They cannot switch off a separate Vercel Git integration; both deployment projects need an independently verified pre-push safeguard.
