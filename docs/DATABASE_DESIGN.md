# Database Design

PiggieVault uses Supabase PostgreSQL with UUID primary keys, foreign keys, ownership fields, check constraints, indexes, and Row Level Security.

## Relationship Overview

```text
auth.users
  -> profiles
  -> pets
       -> pet_reference_photos
       -> weight_records
       -> health_records
  -> photos
       -> photo_pet_predictions
  -> albums
       -> album_photos -> photos
```

## Tables

- `profiles`: optional application profile data for an authenticated user.
- `pets`: guinea pig profiles owned by a user.
- `photos`: private uploaded photo metadata, including stable Storage path, original filename, optional editable display name, file size, MIME type, dimensions, upload time, taken time, and AI status.
- `pet_reference_photos`: owner-safe relationships between pets and existing private photos, plus one normalized pgvector embedding and processing/model metadata.
- `photo_pet_predictions`: one owner-scoped current AI analysis per photo, including ranked candidates, a preserved suggestion, separate human-confirmed labels, model/config metadata, and processing/review state.
- `albums`: user-created photo collections.
- `album_photos`: many-to-many join table between albums and photos.
- `weight_records`: pet weight entries in grams.
- `health_records`: personal health notes.

## Classification scope

Migration 0009 evolves the dormant single-pet prediction shape without removing legacy columns. New rows support zero candidate pets, one suggested pet, or multiple suggested/confirmed pet IDs. Multiple output remains a global-embedding heuristic, not object detection.

## Independent manual photo labels

Migration 0012 retains the existing separate machine and human columns in `photo_pet_predictions`; it adds `labels_revision` and a caller/RLS-scoped `set_photo_labels` transaction. Owners can create/edit/clear human labels without an AI result. Machine suggestions and scores stay unchanged. Human labels and the photo summary update atomically; revisions prevent stale edits and a summary trigger protects against delayed AI status writes. Empty confirmed IDs with `confirmed_unknown = true` means explicit Unknown; empty IDs with pending review means unlabeled. Pet-specific galleries continue to use confirmed/corrected human fields regardless of processing status. Apply migrations in order; 0015-v4 subsequently restricts writes and elevates the protected RPCs under a non-BYPASSRLS role.

## Deletion Behavior

- User account deleted: owned rows cascade because they are private user data.
- Pet deleted: migration 0011 removes prediction array labels and the legacy `pet_id`, reopens review when the only confirmed identity is lost, and cascades reference relationships, weights and health records in one transaction. General photos, albums and memberships remain. Prediction reference locks prevent concurrent writers from restoring deleted IDs. The application retains avatar bytes for coordinated future cleanup; migration 0013 adds revision-checked avatar pointer updates.
- Photo deleted: predictions and album relationships cascade. Storage object deletion must be handled by application/storage logic.
- Album deleted: album-photo relationships cascade, but original photos remain.
- Reference relationship deleted: only the relationship and embedding metadata are removed. The original `photos` row, private Storage object, title, and album memberships remain. Deleting the pet or original photo cascades the relationship.

## Indexing

Indexes prioritize ownership and common list views: pets by user, photos by user and date, album contents, and pet-specific health/weight histories. The gallery reads one page at a time and uses a deterministic secondary order by photo ID so equal timestamps do not duplicate or skip rows between pages.

## Migration

See:

- `supabase/migrations/0001_initial_schema.sql`
- `supabase/migrations/0002_pet_avatar_storage.sql`
- `supabase/migrations/0003_user_photo_upload_storage.sql`
- `supabase/migrations/0004_photo_display_names.sql`
- `supabase/migrations/0005_private_photo_albums.sql`
- `supabase/migrations/0006_pet_weight_tracking.sql`
- `supabase/migrations/0007_private_pet_health_records.sql`
- `supabase/migrations/0008_ai_reference_photo_embeddings.sql`
- `supabase/migrations/0009_ai_photo_classification_review.sql`

## Current Photo Upload Metadata

General photo upload stores files in the private `user-photos` bucket and saves the object path in `photos.storage_path`. The object path must start with the same `user_id` as the row. This gives PostgreSQL a database-level check that matches the Storage policy convention.

The upload phase saves `mime_type` and initially sets `ai_status` to `uploaded`. Classification may then move it through processing, ready-for-review, failed, or insufficient-reference state. A reviewed final label uses the legacy specific-pet/Unknown status while the prediction row remains the authoritative detailed lifecycle.

## Current Photo Gallery Metadata

The gallery and detail pages query `photos` rows by both authenticated `user_id` and photo ID where applicable. RLS remains enabled, so the database still refuses cross-user access if the application query is accidentally loosened.

Gallery display dates use a typed application helper:

1. `taken_at` when present;
2. `uploaded_at` when `taken_at` is absent;
3. `created_at` as a final fallback.

Dates are formatted as UTC calendar dates for stable month grouping. Signed URLs are generated at render time from `storage_path` and are never stored in database columns.

Photo deletion uses migration `0010_recoverable_photo_deletion.sql`: a caller/RLS-scoped RPC deletes metadata and all dependent relationships atomically with a durable `photo_deletions` cleanup record. Storage removal happens afterward; failures leave a retryable pending record. Completed records permanently reserve the retired ID/path against late upload finalization. Lifecycle triggers serialize by owner, require READ COMMITTED, and make photo identity/path immutable. Existing inconsistent legacy path references block deletion. Account deletion retains minimal cleanup records for operator recovery. No worker is installed; see learning/12-private-photo-gallery.md for the operational procedure.

## Editable Photo Names

`photos.display_name` is nullable, trimmed user-facing metadata with an 80-character database constraint. A null value falls back to the preserved original `file_name`; it does not rename `storage_path`. Rename and reset operations therefore stay inside PostgreSQL and do not create a cross-system Storage transaction.

## Album Relationships

`albums` stores owner-scoped metadata in `title` (the UI name), optional `description`, and timestamps. `album_photos` uses `(album_id, photo_id)` as its primary key, preventing duplicate membership while allowing the same photo in different albums. `user_id` participates in composite foreign keys to both parent tables, so an album and photo must share the same owner. Album deletion and photo deletion cascade only to membership rows. Album deletion never references Storage.

## Pet Weight Records

`weight_records` is a one-to-many child of `pets`. `weight_grams` is an integer constrained to 100–5000. `recorded_at` is a date-only measurement day, separate from creation timestamps. Multiple records per pet/day are allowed; date, creation time, and UUID provide deterministic ordering. A composite `(pet_id, user_id)` foreign key prevents cross-owner pet relationships.

## Phase 5 health records

Migration `0007_private_pet_health_records.sql` evolves the existing child table with `record_type` and unified `notes`. Categories are constrained to symptom, vet visit, medication, treatment, or general. Titles remain required and limited to 120 characters; notes are limited to 4,000. `record_date` is a calendar date distinct from creation time. A composite `(pet_id, user_id)` foreign key prevents cross-owner relationships, and a deterministic history index supports newest-first reads.

## AI reference embeddings

The initial schema already enabled `vector` and reserved `pet_reference_photos.embedding vector(512)`. Migration 0008 adds `photo_id`, status, error category, model name/version, dimension, and update time. Composite foreign keys `(pet_id, user_id)` and `(photo_id, user_id)` prevent cross-owner relationships. `(pet_id, photo_id)` is unique, which prevents accidental duplicate references while allowing the same underlying photo to be referenced by a different owned pet if appropriate.

The legacy `storage_path` column becomes nullable for compatibility; new reference rows do not populate it. Next.js always resolves the current path from the authorized `photos` row, avoiding a second source of truth. `embedding_status` is `pending`, `processing`, `ready`, or `failed`; errors use a small sanitized category set. A ready row records the 512-value vector and exact model metadata.

## AI photo predictions and human truth

Migration 0009 adds one unique prediction per `photo_id`, a composite `(photo_id, user_id)` foreign key, explicit processing/review states, ranked `candidate_pet_ids` with parallel score/reference-count arrays, suggested pet IDs or Unknown, confirmed pet IDs or Unknown, model/classifier/configuration metadata, timestamps, sanitized failure category, and a per-attempt processing token.

Parallel array-length and value checks keep persisted candidate evidence internally consistent. Suggested IDs must be a subset of candidates; Unknown cannot coexist with pet IDs. RLS write policies verify the photo, legacy top pet, and every candidate/suggested/confirmed pet belong to `auth.uid()`. Candidate scores retain only pet-level aggregates, not every reference comparison or a duplicate query embedding.

AI suggestion fields are never overwritten by review. Human confirmation updates only confirmed fields, review status/time, and the legacy compatibility status. Reanalysis can refresh machine fields while review is pending; after review, it preserves the suggestion snapshot and all confirmed fields. A photo or user deletion cascades its prediction. Pet labels are resolved from current owner-scoped pets; deleting a pet removes it from future reference comparisons and migration 0011 removes that pet from persisted label arrays atomically with deletion. Its restricted-writer RPC (after 0015-v4) and invoker triggers preserve RLS, and array-reference row locks prevent late writers from restoring deleted IDs. Migration 0011 follows 0010 and never deletes general photos or creates photo-cleanup jobs.

## Final schema through 0015-v4

Migrations 0010–0014 remain immutable dependencies: deletion tombstones/lifecycle guards, transactional pet deletion, manual-label revisions, avatar revisions, and atomic classification tokens. Migration 0015-v4 adds the private request-identity helper and restricted writer, changes protected RPC ownership and policy targets, narrows authenticated column grants, enforces initial photo state, and adds retired-path upload restrictions and `acknowledge_photo_deletion`.

The final schema has ten RLS-enabled application tables, including `photo_deletions`. Acknowledgment must use the RPC; direct timestamp updates are no longer permitted. Tombstones permanently reserve deleted paths/IDs and survive account deletion for operator recovery. The acknowledgment timestamp proves absence only at that instant.

Staging verification recorded migrations 0001–0015 with preserved original data. This does not establish the production schema. See [release preparation](RELEASE_PREPARATION.md) for exact migration provenance and rollout gates.
