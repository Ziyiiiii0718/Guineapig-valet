# PiggieVault

PiggieVault is a portfolio-quality full-stack and AI project for private guinea pig photo albums and pet-care tracking. The current repository contains Phase 0 and Phase 1A: project foundation, documentation, a runnable Next.js application shell, Supabase Auth wiring, database planning, and honest placeholder UI.

## Current Development Status

Implemented:

- Next.js App Router application foundation.
- React and strict TypeScript configuration.
- Tailwind CSS setup.
- Landing page, login page, registration page, and protected dashboard structure.
- Supabase browser and server client helpers.
- Server-side authentication actions for login, registration, and logout.
- Environment-variable validation and missing-configuration messaging.
- Initial PostgreSQL schema and Row Level Security migration.
- Tests for environment validation and auth form validation.
- Architecture, security, database, roadmap, decision, and learning documentation.

Planned but not implemented yet:

- Pet profile CRUD.
- Photo upload and private storage.
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
- Supabase Storage, planned
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
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server-only:

- `SUPABASE_SERVICE_ROLE_KEY`, reserved for future server-only maintenance tasks.

Future AI service:

- `AI_SERVICE_URL`
- `AI_SERVICE_API_KEY`

Never commit real credentials.

## Supabase Setup

1. Create a Supabase project.
2. Copy the project URL and anon key into `.env.local`.
3. Keep the service-role key server-only.
4. Create a private storage bucket later when photo upload is implemented.
5. Run the initial migration in `supabase/migrations/0001_initial_schema.sql`.

## Database Migration

The initial schema lives at:

```text
supabase/migrations/0001_initial_schema.sql
```

It defines profiles, pets, photos, reference photos, predictions, albums, album-photo relationships, weight records, health records, indexes, foreign keys, check constraints, and Row Level Security policies.

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

Future tests should cover server actions, RLS behavior through integration tests, storage authorization, and route behavior with configured Supabase credentials.

## Known Limitations

- Real login and registration require Supabase credentials.
- Database migration has not been executed against a live Supabase project in this repository.
- Dashboard data sections are placeholders.
- Photo upload, storage, albums, weights, health records, and AI classification are not implemented yet.
- AI service does not exist yet.

## Security Notes

- Passwords are handled by Supabase Auth, not by application tables.
- The browser only receives public Supabase configuration.
- Service-role credentials must remain server-only because they can bypass normal Row Level Security.
- RLS policies are designed so users can only access rows where `auth.uid()` matches ownership.
- Frontend filtering is not considered sufficient authorization.

## Roadmap

1. Repository foundation and authentication.
2. Pet profile CRUD.
3. Photo upload and private storage.
4. Photo gallery and timeline.
5. Albums.
6. Weight tracking.
7. Health records.
8. AI reference-photo pipeline.
9. AI classification and review queue.
10. Portfolio polish and deployment.

## Documentation Links

- [Project plan](docs/PROJECT_PLAN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database design](docs/DATABASE_DESIGN.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Decision log](docs/DECISION_LOG.md)
- [Interview index](docs/INTERVIEW_INDEX.md)
- [Learning docs](docs/learning/README.md)
