# PiggieVault

PiggieVault is a portfolio-quality full-stack and AI project for private guinea pig photo albums and pet-care tracking. The current repository contains the foundation through the private photo-gallery phase: documentation, a runnable Next.js application shell, Supabase Auth wiring, database planning, authenticated pet-profile CRUD, private pet-avatar storage, private general-photo upload, private gallery browsing, chronological timeline grouping, photo detail, deletion, and honest placeholder UI for future features.

## Live Demo

[PiggieVault - Live Website](https://guineapig-valet.vercel.app/)

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
- Private general-photo upload at `/photos/upload` with direct browser uploads to Supabase Storage and PostgreSQL metadata inserts, including browser-side HEIC/HEIF-to-JPEG import conversion.
- Private photo gallery at `/photos` with chronological month grouping, newest/oldest sorting, and pagination.
- Private photo detail pages with editable user-facing names, signed image display, original-file metadata, honest AI status, and safe deletion.
- Dashboard pet summary backed by real private pet data.
- Dashboard recent-photo previews and entry points for gallery browsing and upload.
- Server-side pet validation, ownership checks, and age display helpers.
- Server-side photo upload request validation, owner-scoped Storage paths, MIME/type/size/batch limits, EXIF date fallback, HEIC/HEIF original filename preservation, and best-effort Storage cleanup.
- Environment-variable validation and missing-configuration messaging.
- First-round visual foundation with centralized design tokens and small reusable UI components.
- Initial PostgreSQL schema and Row Level Security migration.
- Private `pet-avatars` Supabase Storage bucket and ownership-scoped Storage policies.
- Private `user-photos` Supabase Storage bucket and ownership-scoped Storage policies.
- Real Supabase project link and initial remote migration verification.
- Vercel production deployment.
- Tests for environment validation, auth form validation, pet validation, pet age calculation, pet avatar behavior, photo upload validation/metadata helpers, and photo gallery date/sort/pagination helpers.
- Architecture, security, database, roadmap, decision, and learning documentation.

Planned but not implemented yet:

- Albums.
- Pet-photo classification.
- AI review queue.
- Weight tracking.
- Health records.
- AI embeddings and classification infrastructure.
- Final portfolio polish.

## Main Features

PiggieVault is intended to eventually support:

- User registration and login.
- Private guinea pig profiles.
- Private photo uploads.
- Private chronological photo timelines.
- Future custom photo albums.
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
7. Confirm the private `pet-avatars` and `user-photos` buckets and Storage policies exist.

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
supabase/migrations/0003_user_photo_upload_storage.sql
supabase/migrations/0004_photo_display_names.sql
```

They define profiles, pets, photos, reference photos, predictions, albums, album-photo relationships, weight records, health records, indexes, foreign keys, check constraints, Row Level Security policies, and private Storage bucket/policies for pet avatars and general user photos.

## Photo Upload Limits

The current private photo upload supports JPEG, PNG, WEBP, HEIC, and HEIF imports. Each file must be 10 MB or smaller, and each upload batch may contain up to 10 files. Uploaded photo objects are stored in the private `user-photos` bucket under an owner-scoped path like `<user-id>/<year>/<month>/<unique-file-name>`.

HEIF is the container format; HEIC is the common HEIF image flavor produced by iPhones. Browsers do not reliably display raw HEIC/HEIF images, so PiggieVault dynamically loads a browser HEIC decoder only when needed, reads the original capture date before conversion when possible, converts the image to JPEG at about 0.9 quality in the browser, and uploads only that JPEG to the private `user-photos` bucket. The database preserves the original filename, while `mime_type`, `file_size`, dimensions, and Storage path describe the stored JPEG. Live Photo `.mov` video components are intentionally deferred and are not uploaded in this phase.

Photo names are editable metadata. `display_name` stores an optional friendly name, `file_name` preserves the original upload name, and `storage_path` remains the stable private UUID object path. Gallery and Dashboard show the custom name when present, otherwise the original filename without its extension, otherwise `Untitled photo`.

The private gallery renders signed image URLs for the current result set only. Gallery signed URLs are short-lived and are not stored in PostgreSQL. Timeline grouping uses a UTC display date: `taken_at` when present, otherwise `uploaded_at`, otherwise `created_at`.

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
- Photo upload file validation, HEIC/HEIF detection and mocked conversion, EXIF date parsing, Storage path ownership, and upload metadata validation.
- Photo gallery display-date fallback, editable-name fallback and validation, sorting, month grouping, pagination, detail ID validation, path ownership, and metadata formatting.

Future tests should cover deeper server-action behavior and route behavior with configured Supabase credentials.

## Known Limitations

- Confirmed-account login requires completing email confirmation for a non-personal test user.
- The initial database, pet-avatar Storage, and user-photo Storage migrations have been applied to the linked Supabase project.
- Dashboard pet data and recent private photo previews are real; AI, weight, and health sections remain placeholders or planned actions.
- Pet profile avatars, general private photo upload, private gallery, timeline grouping, detail view, and deletion are implemented, but albums, weights, health records, and AI classification are not implemented yet.
- Temporary Supabase Auth test users created during remote verification are not deleted because the app does not use a service-role key.
- AI service does not exist yet.

## Security Notes

- Passwords are handled by Supabase Auth, not by application tables.
- The browser only receives the Supabase Project URL and client-safe Publishable key.
- Publishable keys do not bypass RLS.
- Secret or service-role credentials must remain server-only because they can bypass normal Row Level Security.
- RLS policies are designed so users can only access rows where `auth.uid()` matches ownership.
- Pet avatars are stored in a private Supabase Storage bucket under `<user-id>/<pet-id>/...` paths. Storage policies restrict authenticated users to their own top-level folder, and pages render temporary signed URLs.
- General photos are stored in a separate private `user-photos` bucket under `<user-id>/<year>/<month>/...` paths. The database stores object paths and metadata, not permanent public URLs. Gallery and detail pages create temporary signed URLs only after querying the authenticated user's own rows.
- Frontend filtering is not considered sufficient authorization.

## Roadmap

1. Repository foundation and authentication.
2. Pet profile CRUD.
3. Pet avatar storage.
4. General photo upload and private storage.
5. Photo gallery and timeline.
6. Custom albums.
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
