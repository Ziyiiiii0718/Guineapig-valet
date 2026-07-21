# PiggieVault Project Plan

This roadmap is based on `Project Requirement.docx`. The project is intentionally phased so each step is understandable, testable, and explainable in interviews.

## Phase 1: Repository Foundation and Authentication

Objective: Create the project foundation and prepare secure authentication.

Major features: Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth wiring, protected dashboard shell, environment validation, documentation, tests.

Dependencies: Supabase project credentials for real auth testing.

Expected database changes: Initial schema and RLS planning.

Expected API or server actions: Login, registration, logout.

Expected UI pages: Landing, login, register, dashboard placeholders.

Testing strategy: Unit tests for env validation and form validation; production build; manual auth test after Supabase setup.

Learning-document topics: architecture, Next.js flow, Supabase Auth, RLS, environment variables, Git foundation, UI accessibility.

Completion criteria: App installs, lints, type checks, tests, builds, and documents missing external credentials honestly.

## Phase 2: Pet Profile CRUD

Objective: Let authenticated users manage guinea pig profiles.

Major features: pet list, create/edit/delete forms, pet detail placeholder.

Dependencies: Phase 1 auth and pets table.

Expected database changes: Confirm `pets` table fields and constraints.

Expected API or server actions: Pet create, update, delete, list, detail.

Expected UI pages: `/pets`, `/pets/new`, `/pets/[id]`, edit form.

Testing strategy: Validation tests, server-action tests where practical, RLS integration tests later.

Learning-document topics: CRUD, ownership, form validation, relational modeling.

Completion criteria: Users can only see and modify their own pets.

## Phase 3: Photo Upload and Private Storage

Objective: Allow users to upload private photos safely.

Major features: upload form, selected-file review, direct browser upload, metadata extraction, storage paths, signed upload access.

Dependencies: Supabase Storage bucket, photos table.

Expected database changes: `user-photos` private bucket, Storage policy alignment, photo metadata refinements.

Expected API or server actions: signed upload request initialization, metadata insert, best-effort cleanup.

Expected UI pages: `/photos/upload`, dashboard upload entry point, recent photos placeholder remains honest.

Testing strategy: File validation tests, storage integration test with test credentials.

Learning-document topics: private storage, file validation, signed URLs.

Completion criteria: A user can upload private photo files into their own Storage folder and create only their own photo metadata rows. Full gallery viewing remains a later phase.

## Phase 4: Photo Gallery and Timeline

Objective: Browse private photos chronologically.

Major features: gallery grid, date sorting, empty/error/loading states.

Dependencies: Phase 3 photos.

Expected database changes: Indexes for taken/uploaded dates.

Expected API or server actions: Photo list queries.

Expected UI pages: `/photos`, photo detail.

Testing strategy: Query helper tests and integration tests.

Learning-document topics: pagination, indexes, responsive galleries.

Completion criteria: Photos load efficiently and sort predictably.

## Phase 5: Albums

Objective: Let users organize photos into custom albums.

Major features: album CRUD, add/remove photos, album detail.

Dependencies: photos table and album tables.

Expected database changes: Confirm `albums` and `album_photos`.

Expected API or server actions: Album create/update/delete, relationship changes.

Expected UI pages: `/albums`, `/albums/[id]`.

Testing strategy: Relationship validation and RLS integration.

Learning-document topics: many-to-many relationships.

Completion criteria: Removing from an album does not delete the photo.

## Phase 6: Weight Tracking

Objective: Track weight history for each pet.

Major features: weight forms, list, latest weight summary.

Dependencies: pets table.

Expected database changes: `weight_records` constraints.

Expected API or server actions: Weight CRUD.

Expected UI pages: pet detail weight section and weight tracker.

Testing strategy: Numeric validation and date sorting.

Learning-document topics: time-series data and chart-ready queries.

Completion criteria: Users can add and view their own pet weight records.

## Phase 7: Health Records

Objective: Store personal health notes without medical diagnosis.

Major features: health record CRUD and disclaimer.

Dependencies: pets table.

Expected database changes: `health_records` constraints.

Expected API or server actions: Health CRUD.

Expected UI pages: health records list and pet detail section.

Testing strategy: validation and ownership tests.

Learning-document topics: privacy, sensitive notes, disclaimers.

Completion criteria: Health notes are private and clearly non-diagnostic.

## Phase 8: AI Reference-Photo Pipeline

Objective: Prepare reference photos for future AI matching.

Major features: reference upload, minimum-photo warnings, embedding job boundary.

Dependencies: storage, pets, AI service contract.

Expected database changes: pgvector embedding storage and status fields.

Expected API or server actions: reference upload and job creation.

Expected UI pages: pet reference photo management.

Testing strategy: storage validation, queue/job tests.

Learning-document topics: embeddings and AI service boundaries.

Completion criteria: Reference photos can be stored and queued for embedding.

## Phase 9: AI Classification and Review Queue

Objective: Classify uploaded photos and support manual correction.

Major features: prediction result, statuses, review queue, manual confirmation.

Dependencies: AI reference pipeline and photo upload.

Expected database changes: prediction confidence, model version, correction audit.

Expected API or server actions: classify photo, update prediction.

Expected UI pages: review queue and photo detail controls.

Testing strategy: mocked AI service tests and failure-mode tests.

Learning-document topics: async AI processing, idempotency, confidence thresholds.

Completion criteria: AI failures do not delete photos and uncertain results are reviewable.

## Phase 10: Portfolio Polish and Deployment

Objective: Make the project presentation-ready.

Major features: deployment, screenshots, demo workflow, UI polish, README refinement.

Dependencies: stable core functionality.

Expected database changes: production-safe policies and seed/demo strategy.

Expected API or server actions: no speculative additions unless needed.

Expected UI pages: polished existing pages, not marketing-only work.

Testing strategy: end-to-end happy path, production build, deployment smoke tests.

Learning-document topics: deployment, observability, trade-offs.

Completion criteria: A reviewer can run or visit the app and understand the architecture.
