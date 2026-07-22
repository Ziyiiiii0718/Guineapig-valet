# Architecture

## Current System

```text
Browser
-> Next.js App Router
-> Supabase Auth
-> PostgreSQL with Row Level Security
-> Supabase Storage for private pet avatars
-> Supabase Storage for private general photos
```

The browser renders the landing, auth, and dashboard pages. Next.js handles route structure, server actions, server-side session checks, and UI rendering. Supabase Auth manages credentials and sessions. PostgreSQL stores application data and Row Level Security protects user-owned rows.

## Authentication Flow

```text
User submits credentials
-> Supabase Auth validates credentials
-> session is created
-> authenticated request includes identity
-> server and RLS validate access
-> authorized data is returned
```

## Important Files

- `app/layout.tsx`: root layout and navigation shell.
- `app/page.tsx`: landing page.
- `app/(auth)/login/page.tsx`: login form page.
- `app/(auth)/register/page.tsx`: registration form page.
- `app/dashboard/page.tsx`: protected dashboard placeholder.
- `app/pets/page.tsx`: authenticated pet list.
- `app/pets/new/page.tsx`: authenticated pet creation form.
- `app/pets/[id]/page.tsx`: private pet detail page.
- `app/pets/[id]/edit/page.tsx`: private pet editing form.
- `app/actions/auth.ts`: server actions for login, registration, logout.
- `app/actions/pets.ts`: server actions for pet create, update, delete, avatar upload, avatar replacement, and avatar removal.
- `app/actions/photos.ts`: server actions for signed photo-upload requests and metadata finalization.
- `app/photos/page.tsx`: authenticated private photo gallery with sorting, pagination, and timeline grouping.
- `app/photos/[id]/page.tsx`: authenticated private photo detail page.
- `app/photos/upload/page.tsx`: authenticated private photo upload page.
- `components/photos/delete-photo-form.tsx`: accessible confirmation dialog for permanent photo deletion.
- `components/photos/photo-card.tsx`: signed-image gallery card component.
- `components/photos/photo-upload-form.tsx`: selected-file review, direct Storage upload, per-file status, and retry UI.
- `components/pets/pet-avatar-form.tsx`: edit-page avatar upload and removal UI.
- `lib/photos/upload.ts`: shared photo upload limits, file validation, path helpers, and metadata validation.
- `lib/photos/exif.ts`: browser-safe EXIF taken-date parsing and fallback helpers.
- `lib/photos/gallery.ts`: display-date fallback, sort parsing, timeline grouping, pagination, and formatting helpers.
- `lib/photos/queries.ts`: server-only photo queries and signed URL generation.
- `lib/pets/avatar.ts`: avatar file validation and ownership-scoped Storage path helpers.
- `lib/pets/avatar-urls.ts`: server-only signed URL generation for private avatars.
- `proxy.ts`: session refresh and route protection when Supabase is configured.
- `lib/pets/age.ts`: date-only pet age calculation and display formatting.
- `lib/validation/pets.ts`: server-side pet form validation.
- `lib/supabase/server.ts`: server-only Supabase client.
- `lib/supabase/client.ts`: browser Supabase client.
- `lib/env.ts`: environment-variable validation.
- `supabase/migrations/0001_initial_schema.sql`: relational schema and RLS.
- `supabase/migrations/0002_pet_avatar_storage.sql`: private avatar bucket and Storage policies.
- `supabase/migrations/0003_user_photo_upload_storage.sql`: private general-photo bucket, Storage policies, and photo metadata refinements.

## Pet Avatar Storage Flow

```text
Edit pet page
-> Server Action checks current Supabase user
-> Server Action confirms pet ownership by id and user_id
-> Supabase Storage stores object in pet-avatars/<user-id>/<pet-id>/...
-> pets.profile_photo_path stores only the object path
-> Server Components create short-lived signed URLs for rendering
```

Profile avatars are intentionally separate from general photo upload and future AI reference photos. Replacing an avatar uploads the new object first, updates the pet row only after upload succeeds, then best-effort removes the old object. PostgreSQL and Storage do not share one transaction, so cleanup is designed to be safe if a later step fails.

## Private General Photo Upload Flow

```text
Upload page
-> browser validates and previews selected files
-> Server Action checks current Supabase user
-> Server Action creates signed upload requests for user-photos/<user-id>/<year>/<month>/...
-> browser uploads directly to the private user-photos bucket
-> Server Action validates metadata and inserts photos row
-> if metadata insert fails, Server Action best-effort removes the Storage object
```

General photos use a separate private `user-photos` bucket. The database stores the object path and metadata, not public URLs. The initial `ai_status` is `uploaded`, which means the image has not been analyzed or classified. Direct browser upload keeps large image bytes out of Next.js server actions, which is better suited to serverless deployment. The trade-off is that Storage and PostgreSQL do not share a transaction, so cleanup after partial failure is best effort.

## Private Gallery and Timeline Flow

```text
Gallery or detail request
-> Server Component checks current Supabase user
-> query photos with id and authenticated user_id
-> RLS independently restricts rows to auth.uid()
-> server validates the Storage path begins with the same user id
-> server creates short-lived signed URLs for the current result set
-> UI renders private thumbnails/detail image without storing signed URLs
```

The gallery uses a UTC display date: `taken_at` when present, otherwise `uploaded_at`, otherwise `created_at`. That display date drives labels, month grouping, and helper-level sorting. The current database query orders by the stored timestamp columns plus `id` and only reads one page at a time; Phase 2A uploads always save `taken_at` with either EXIF time or upload time, so current rows sort predictably. If older imported rows become common, a future migration can add a generated display-date column for database-native ordering.

## Photo Deletion Flow

```text
Detail page
-> user confirms deletion in a dialog
-> Server Action verifies current Supabase user
-> query photo by id and authenticated user_id
-> delete Storage object using the database-owned path
-> delete photos row
-> revalidate dashboard, gallery, and detail routes
```

Deletion removes the Storage object first, then the metadata row. This avoids a misleading success state where the row is gone but the private image remains. The trade-off is that if the later row deletion fails, the app reports that partial failure and leaves a broken metadata row for retry or maintenance cleanup.

## Future AI Boundary

```text
Browser
-> Next.js
-> Private Storage
-> Job or AI Service
-> Embedding Comparison
-> Prediction
-> Review Queue
```

The AI service should receive a server-authorized request containing a photo ID, user ID, and storage path or signed temporary access. It should return a prediction status, optional pet ID, confidence, and model version. Failures should mark the photo as `needs_review` instead of blocking the whole UI.

## Boundary Decision

The first web app does not depend on the AI service. This keeps core authentication, CRUD, storage, and RLS work testable before machine-learning complexity is added.
