# Architecture

## Current System

```text
Browser
-> Next.js App Router
-> Supabase Auth
-> PostgreSQL with Row Level Security
-> Supabase Storage for private pet avatars
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
- `components/pets/pet-avatar-form.tsx`: edit-page avatar upload and removal UI.
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
