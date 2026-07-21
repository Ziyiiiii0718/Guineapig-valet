# PiggieVault

PiggieVault is a portfolio-quality full-stack and AI project for private guinea pig photo albums and pet-care tracking. The current repository contains Phase 0, Phase 1A, and Phase 1B: project foundation, documentation, a runnable Next.js application shell, Supabase Auth wiring, database planning, authenticated pet-profile CRUD, private pet-avatar storage, and honest placeholder UI for future features.

## Current Development Status

Implemented:

- Next.js App Router application foundation.
- React and strict TypeScript configuration.
- Tailwind CSS setup.
- Landing page, login page, registration page, and protected dashboard structure.
- Supabase browser and server client helpers.
- Server-side authentication actions for login, registration, and logout.
- Authenticated guinea pig profile CRUD at `/pets`.
- Private pet profile-avatar upload, replacement, removal, signed rendering, and fallback initials.
- Dashboard pet summary backed by real private pet data.
- Server-side pet validation, ownership checks, and age display helpers.
- Environment-variable validation and missing-configuration messaging.
- First-round visual foundation with centralized design tokens and small reusable UI components.
- Initial PostgreSQL schema and Row Level Security migration.
- Private `pet-avatars` Supabase Storage bucket and ownership-scoped Storage policies.
- Real Supabase project link and initial remote migration verification.
- Tests for environment validation, auth form validation, pet validation, pet age calculation, and pet avatar behavior.
- Architecture, security, database, roadmap, decision, and learning documentation.

Planned but not implemented yet:

- General photo upload and private gallery storage.
- Albums and timelines.
- Weight tracking.
- Health records.
- AI embeddings, classification, and review queue.
- Deployment and portfolio polish.

## Main Features

PiggieVault is intended to eventually support:

- User registration and login.
- Private guinea pig profiles.
- Private photo uploads.
- Photo albums and chronological timelines.
- Weight and health history.
- Reference photos for each pet.
- Future AI image embedding classification.
- Manual review and correction for uncertain AI predictions.

## Technology Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- pnpm
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage
- PostgreSQL Row Level Security
- Vitest
- Future Python/FastAPI AI service

## Architecture Summary

Current flow:

```text
Browser
-> Next.js App Router
-> Supabase Auth
-> PostgreSQL with Row Level Security
```

Future AI upload flow:

```text
Browser
-> Next.js
-> Private Storage
-> Job or AI Service
-> Embedding Comparison
-> Prediction
-> Review Queue
```

The web application owns authentication, user flows, and database access. The future AI service will be isolated behind a service boundary and should not be required for the first full-stack features to work.

## Repository Structure

```text
app/                         Next.js routes, layout, auth actions
components/                  Reusable UI components
lib/                         Environment, validation, Supabase, and AI boundary types
supabase/migrations/         SQL schema and RLS policies
docs/                        Architecture, database, security, roadmap, decisions
docs/learning/               Interview-focused learning documents
tests/                       Vitest tests
Project Requirement.docx     Original requirements document
```

## Prerequisites

- Node.js compatible with the installed Next.js version.
- pnpm.
- A Supabase project for real authentication and database testing.

## Local Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Then add real Supabase values to `.env.local`.

## Environment Variables

Browser-safe:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Never commit real credentials.
The code also accepts legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` as a fallback for existing local setups. New setup should use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Do not put Supabase secret keys or service-role keys in `NEXT_PUBLIC_` variables. This Phase 1A app does not require a service-role key.

## Supabase Setup

1. Create a Supabase project.
2. Copy the Project URL into `NEXT_PUBLIC_SUPABASE_URL`.
3. Copy the client-safe Publishable key into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Check that email/password authentication is enabled.
5. Configure the local redirect URL: `http://localhost:3000/auth/callback`.
6. Apply the migrations in `supabase/migrations/`.
7. Confirm the private `pet-avatars` bucket and Storage policies exist.

Detailed setup and verification steps are in [Supabase setup](docs/SUPABASE_SETUP.md).
Current remote verification notes are in [Supabase verification](docs/SUPABASE_VERIFICATION.md).

## First Vercel Deployment

Set these Vercel environment variables before the first deployment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Do not add a Supabase service-role key or database password to Vercel for the current app. The browser and server clients both use the client-safe Publishable key together with Supabase Auth cookies and RLS.

After Vercel creates the deployment URL, add the deployed callback URL to Supabase Authentication redirect URLs:

```text
https://your-vercel-domain.vercel.app/auth/callback
```

Before a public production launch, re-enable email confirmation and configure custom SMTP in Supabase Auth. The default shared Supabase email provider can hit rate limits during testing.

## Database Migration

The schema and private pet-avatar Storage setup live at:

```text
supabase/migrations/0001_initial_schema.sql
supabase/migrations/0002_pet_avatar_storage.sql
```

They define profiles, pets, photos, reference photos, predictions, albums, album-photo relationships, weight records, health records, indexes, foreign keys, check constraints, Row Level Security policies, and the private pet-avatar Storage bucket/policies.

## Development Commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format
```

## Testing

Current tests cover:

- Missing and complete environment-variable validation.
- Auth form validation for email and password rules.
- Pet profile validation, allowed sex values, optional fields, and future birth-date rejection.
- Date-only pet age calculation for completed years and months.
- Pet avatar file validation, fallback rendering, avatar storage-path ownership, and clickable pet-card route generation.

Future tests should cover deeper server-action behavior and route behavior with configured Supabase credentials.

## Known Limitations

- Confirmed-account login requires completing email confirmation for a non-personal test user.
- The initial database and pet-avatar Storage migrations have been applied to the linked Supabase project.
- Dashboard pet data is real; photo, AI, weight, and health sections remain placeholders.
- Pet profile avatars are implemented, but general photo upload, albums, weights, health records, and AI classification are not implemented yet.
- Temporary Supabase Auth test users created during remote verification are not deleted because the app does not use a service-role key.
- AI service does not exist yet.

## Security Notes

- Passwords are handled by Supabase Auth, not by application tables.
- The browser only receives the Supabase Project URL and client-safe Publishable key.
- Publishable keys do not bypass RLS.
- Secret or service-role credentials must remain server-only because they can bypass normal Row Level Security.
- RLS policies are designed so users can only access rows where `auth.uid()` matches ownership.
- Pet avatars are stored in a private Supabase Storage bucket under `<user-id>/<pet-id>/...` paths. Storage policies restrict authenticated users to their own top-level folder, and pages render temporary signed URLs.
- Frontend filtering is not considered sufficient authorization.

## Roadmap

1. Repository foundation and authentication.
2. Pet profile CRUD.
3. Pet avatar storage.
4. General photo upload and private storage.
5. Photo gallery and timeline.
6. Albums.
7. Weight tracking.
8. Health records.
9. AI reference-photo pipeline.
10. AI classification and review queue.
11. Portfolio polish and deployment.

## Documentation Links

- [Project plan](docs/PROJECT_PLAN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database design](docs/DATABASE_DESIGN.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Decision log](docs/DECISION_LOG.md)
- [Interview index](docs/INTERVIEW_INDEX.md)
- [Learning docs](docs/learning/README.md)
