# Architecture

The authenticated pet UI now uses a desktop sidebar and composed pet overview. `lib/pets/media-queries.ts` derives photos from owner-scoped confirmed/corrected pet labels and albums through those photos, with no schema changes. Cover images use existing confirmed photos or avatar/illustration fallbacks. Full weight management stays on the pet route's Weight view, Health keeps its existing route, and reference setup sits above deletion. See [the pet profile learning note](learning/19-pet-profile-ui-and-confirmed-media.md) for query boundaries, cache invalidation, and verification limits.

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
- `app/actions/photos.ts`: server actions for signed photo-upload requests, metadata finalization, editable names, and deletion.
- `app/actions/classification.ts`: owner-authorized analyze, retry, confirm, correction, Unknown, and skip actions.
- `app/review/page.tsx`: authenticated human review queue with validated URL filters.
- `app/photos/page.tsx`: authenticated private photo gallery with sorting, pagination, and timeline grouping.
- `app/photos/[id]/page.tsx`: authenticated private photo detail page.
- `app/photos/upload/page.tsx`: authenticated private photo upload page.
- `components/photos/delete-photo-form.tsx`: accessible confirmation dialog for permanent photo deletion.
- `components/photos/photo-card.tsx`: signed-image gallery card component.
- `components/photos/photo-name-editor.tsx`: compact accessible display-name editor for photo detail.
- `components/photos/photo-upload-form.tsx`: selected-file review, direct Storage upload, per-file status, and retry UI.
- `components/pets/pet-avatar-form.tsx`: edit-page avatar upload and removal UI.
- `lib/photos/upload.ts`: shared photo upload limits, file validation, path helpers, and metadata validation.
- `lib/photos/exif.ts`: browser-safe EXIF taken-date parsing and fallback helpers.
- `lib/photos/gallery.ts`: display-date fallback, sort parsing, timeline grouping, pagination, and formatting helpers.
- `lib/photos/display-name.ts`: editable-name validation and shared user-facing filename fallback.
- `lib/photos/queries.ts`: server-only photo queries and signed URL generation.
- `lib/ai/classifier.ts`: canonical deterministic top-k similarity classifier.
- `lib/ai/photo-classification.ts`: private-byte processing, reference loading, persistence, and retry orchestration.
- `lib/ai/prediction-queries.ts`: owner-scoped prediction, queue, label, and Dashboard count reads.
- `app/actions/albums.ts`: authenticated album metadata and membership mutations.
- `app/albums/*`: private album overview, creation, detail, and photo-picker routes.
- `components/albums/*`: album cards, forms, membership controls, and confirmation UI.
- `lib/albums/queries.ts`: typed paginated album reads and authorized signed-image delivery.
- `lib/albums/validation.ts`: album metadata, ID, and pagination validation.
- `app/actions/weights.ts`: authenticated weight-record mutations.
- `components/weights/*`: compact forms, history, summary, and responsive Recharts visualization.
- `lib/weights/core.ts`: validation, date formatting, ordering, and derived calculations.
- `lib/weights/queries.ts`: bounded owner-scoped weight reads.
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
- `supabase/migrations/0004_photo_display_names.sql`: nullable constrained user-facing photo names.
- `supabase/migrations/0005_private_photo_albums.sql`: album validation, composite ownership foreign keys, and ordering indexes.
- `supabase/migrations/0006_pet_weight_tracking.sql`: canonical range, composite pet ownership, and stable history index.

## Weight Tracking Flow

```text
Pet detail -> authenticated owner-scoped query -> newest-first history
Client form -> Server Action -> pet ownership check -> RLS weight mutation
History -> shared summary calculations -> Recharts chronological view
```

Weights use integer grams and calendar dates. The chart reverses the deterministic newest-first history for oldest-to-newest display; exact values remain available in text.

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

General photos use a separate private `user-photos` bucket. The database stores the object path and metadata, not public URLs. The initial `ai_status` is `uploaded`. After Storage and metadata succeed, the browser starts a separate non-blocking owner-authorized classification action. Direct browser upload keeps large image bytes out of Next.js server actions, and AI failure cannot roll back the valid photo. The trade-off is that Storage and PostgreSQL do not share a transaction, so cleanup after partial upload failure is best effort.

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

Deletion atomically removes metadata and creates a durable tombstone first. The action then removes the owned Storage object and calls the v4 acknowledgment RPC. Storage errors leave durable pending cleanup; repeated requests always recheck, even after an earlier completion. See the gallery learning note for the maintenance limitations.

## Editable Photo Name Flow

```text
Detail page edit form
-> Server Action validates photo ID and display name
-> Server Action authenticates the current user
-> query photo by id and authenticated user_id
-> RLS independently enforces the same ownership rule
-> update only display_name and updated_at
-> revalidate detail, gallery, and Dashboard
```

The original `file_name` and UUID `storage_path` stay unchanged. Keeping user-facing metadata separate avoids copying or moving a private object and preserves signed-image delivery, HEIC conversion output, and deletion behavior.

## Private Album Flow

```text
Authenticated album route
-> owner-scoped album and membership queries
-> owner-scoped photo metadata query
-> short-lived signed URLs for only the authorized page
-> Server Action validates album/photo IDs and current user
-> RLS plus composite album/photo ownership foreign keys
```

Albums do not create Storage folders or duplicate objects. `album_photos` links one photo to many albums. Deleting an album cascades only through join rows; deleting a photo cleans its memberships through the photo foreign key. Overview albums use recently updated ordering. Album contents use membership creation time descending plus photo ID descending. The automatic cover is the earliest surviving membership, so removal or photo deletion falls back without mutable cover state.

## AI Reference-Embedding Boundary

```text
Browser
-> authenticated Next.js Server Action
-> pet and photo ownership checks
-> private user-photos download through the user's Supabase session
-> authenticated byte-only FastAPI /embed request
-> validated normalized vector and model metadata
-> owner-scoped pet_reference_photos update under RLS
```

The AI service receives raw JPEG, PNG, or WEBP bytes only after Next.js has authorized and downloaded an existing private photo. It receives no Supabase key, user ID, pet ID, Storage path, signed URL, or arbitrary remote URL. A server-only bearer token protects the internal endpoint. The response contains one normalized 512-dimensional image embedding plus model name/version metadata; it contains no pet classification.

Reference rows move through `pending`, `processing`, `ready`, or `failed`. Failed relationships remain visible and retryable. Adding several references uses bounded concurrency and preserves partial success. Removing a reference deletes only relationship/embedding metadata and never deletes the photo or Storage object.

## Boundary Decision

The web app still does not globally depend on the AI service. Pets, photos, albums, weights, health records, and Dashboard remain usable when AI configuration or deployment is absent; embedding and classification attempts fail gracefully.

## FastAPI embedding service

`ai-service/` isolates model loading, matching OpenCLIP preprocessing, inference, and L2 normalization from Next.js. `ViT-B-32-quickgelu` with `openai` weights produces 512 values intended for later cosine similarity. The QuickGELU variant matches the activation used by those pretrained weights. The model loads lazily once per process rather than once per request. Incoming bytes are decoded in memory and released after the response; they are not written to disk. Health reports process/model readiness without forcing a model download. Production still needs a separately provisioned ML host because the Next.js application deploys to Vercel.

## Phase 5 health-record architecture

- `/pets/[id]/health` is an authenticated Server Component route with validated URL filters and 25-row pagination.
- `lib/health/core.ts` owns categories, validation, calendar-date formatting, sorting, filtering, and pagination rules.
- `lib/health/queries.ts` performs bounded owner-scoped reads for full history, pet detail, and Dashboard.
- `app/actions/health.ts` authenticates, verifies pet ownership, validates input, and scopes create/update/delete mutations.
- Client components provide compact forms and inline editing; PostgreSQL remains the source of truth.

## AI Classification and Review Boundary

```text
successful private photo insert
-> owner-authorized Next.js classification action
-> current compatible ready references (minimum two for a pet)
-> private image bytes sent to existing FastAPI /embed
-> canonical Next.js top-k cosine aggregation
-> one/multiple/Unknown suggestion stored under RLS
-> authenticated /review human decision
```

FastAPI remains a focused embedding service. Classification math lives once in `lib/ai/classifier.ts`, close to owner-scoped Supabase reads and writes. For the current small per-user reference sets, loading compatible vectors and comparing them in memory is simpler than a pgvector nearest-neighbor index. A much larger dataset could move candidate retrieval into indexed PostgreSQL queries without changing human review semantics.

`photo_pet_predictions` has one row per photo. A new processing token distinguishes overlapping attempts, while a unique photo constraint prevents duplicate active predictions. Ranked candidate IDs/scores/reference counts and suggested IDs are machine output. Confirmed IDs/Unknown and review status are separate human truth. Before review, retry may refresh machine output; after review it preserves the reviewed suggestion snapshot and confirmed truth while updating only processing state.

Processing states are pending, processing, ready for review, failed, or insufficient references. Review states are pending, confirmed, corrected, or skipped. The `/review` route uses validated URL filters and short-lived owner-authorized thumbnails. Photo detail exposes Analyze/Retry and state; Gallery shows definitive labels only after review and marks unreviewed results as needing review; Dashboard shows a compact pending count.

The classifier uses a versioned top-three reference-similarity mean per eligible pet. Threshold configuration is centralized and explicitly provisional because the linked dataset is not large enough for reliable calibration. Global embeddings can only offer a multiple-pet heuristic; they do not localize or count animals.

## V1.0 protected mutation boundary

The final schema through 0015-v4 separates ordinary owner-scoped metadata CRUD from protected lifecycle operations. Pet deletion, manual labels, avatar pointers, classification start/finish and deletion acknowledgment run through restricted SECURITY DEFINER RPCs. The writer still obeys RLS and derives identity from verified PostgREST claims through a private helper; browser input cannot select its identity. Photo deletion begins through the existing invoker RPC and durable lifecycle trigger, then the Server Action removes Storage bytes and requests verified acknowledgment.

This is a database authorization change, not a new service. AI models, thresholds and experiments are unchanged. See [security model](SECURITY_MODEL.md) and [release preparation](RELEASE_PREPARATION.md).
