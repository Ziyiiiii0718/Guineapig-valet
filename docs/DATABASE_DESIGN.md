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
- `pet_reference_photos`: reference photos for future AI embeddings.
- `photo_pet_predictions`: AI or manual labels for photos.
- `albums`: user-created photo collections.
- `album_photos`: many-to-many join table between albums and photos.
- `weight_records`: pet weight entries in grams.
- `health_records`: personal health notes.

## Initial Classification Scope

Phase 1A assumes one primary classification result:

- one specific pet;
- unknown;
- not a guinea pig;
- needs review.

Reliable multi-pet detection is a future enhancement.

## Deletion Behavior

- User account deleted: owned rows cascade because they are private user data.
- Pet deleted: dependent reference photos, weight records, and health records cascade. Photo records remain because a general photo library may outlive one pet profile; predictions referencing the pet set `pet_id` to null. The application performs best-effort cleanup of the pet avatar Storage object.
- Photo deleted: predictions and album relationships cascade. Storage object deletion must be handled by application/storage logic.
- Album deleted: album-photo relationships cascade, but original photos remain.
- Reference photo deleted: the reference row cascades with the pet or can be deleted directly; future storage cleanup should remove or retire the related object.

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

## Current Photo Upload Metadata

General photo upload stores files in the private `user-photos` bucket and saves the object path in `photos.storage_path`. The object path must start with the same `user_id` as the row. This gives PostgreSQL a database-level check that matches the Storage policy convention.

The current upload phase saves `mime_type` for new uploads and sets `ai_status` to `uploaded`. That status means the file was received but has not been classified by AI.

## Current Photo Gallery Metadata

The gallery and detail pages query `photos` rows by both authenticated `user_id` and photo ID where applicable. RLS remains enabled, so the database still refuses cross-user access if the application query is accidentally loosened.

Gallery display dates use a typed application helper:

1. `taken_at` when present;
2. `uploaded_at` when `taken_at` is absent;
3. `created_at` as a final fallback.

Dates are formatted as UTC calendar dates for stable month grouping. Signed URLs are generated at render time from `storage_path` and are never stored in database columns.

Photo deletion is split across Storage and PostgreSQL because they are separate systems. The app deletes the private Storage object first, then the `photos` row. This favors not leaving private image files behind, while reporting a partial failure if metadata deletion fails afterward.

## Editable Photo Names

`photos.display_name` is nullable, trimmed user-facing metadata with an 80-character database constraint. A null value falls back to the preserved original `file_name`; it does not rename `storage_path`. Rename and reset operations therefore stay inside PostgreSQL and do not create a cross-system Storage transaction.

## Album Relationships

`albums` stores owner-scoped metadata in `title` (the UI name), optional `description`, and timestamps. `album_photos` uses `(album_id, photo_id)` as its primary key, preventing duplicate membership while allowing the same photo in different albums. `user_id` participates in composite foreign keys to both parent tables, so an album and photo must share the same owner. Album deletion and photo deletion cascade only to membership rows. Album deletion never references Storage.

## Pet Weight Records

`weight_records` is a one-to-many child of `pets`. `weight_grams` is an integer constrained to 100–5000. `recorded_at` is a date-only measurement day, separate from creation timestamps. Multiple records per pet/day are allowed; date, creation time, and UUID provide deterministic ordering. A composite `(pet_id, user_id)` foreign key prevents cross-owner pet relationships.

## Phase 5 health records

Migration `0007_private_pet_health_records.sql` evolves the existing child table with `record_type` and unified `notes`. Categories are constrained to symptom, vet visit, medication, treatment, or general. Titles remain required and limited to 120 characters; notes are limited to 4,000. `record_date` is a calendar date distinct from creation time. A composite `(pet_id, user_id)` foreign key prevents cross-owner relationships, and a deterministic history index supports newest-first reads.
