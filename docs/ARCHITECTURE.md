# Architecture

## Current System

```text
Browser
-> Next.js App Router
-> Supabase Auth
-> PostgreSQL with Row Level Security
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
- `app/actions/auth.ts`: server actions for login, registration, logout.
- `proxy.ts`: session refresh and route protection when Supabase is configured.
- `lib/supabase/server.ts`: server-only Supabase client.
- `lib/supabase/client.ts`: browser Supabase client.
- `lib/env.ts`: environment-variable validation.
- `supabase/migrations/0001_initial_schema.sql`: planned relational schema and RLS.

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
