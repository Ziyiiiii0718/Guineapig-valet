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
- `photos`: private uploaded photo metadata.
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
- Pet deleted: dependent reference photos, weight records, and health records cascade. Photo records remain because a general photo library may outlive one pet profile; predictions referencing the pet set `pet_id` to null.
- Photo deleted: predictions and album relationships cascade. Storage object deletion must be handled by application/storage logic.
- Album deleted: album-photo relationships cascade, but original photos remain.
- Reference photo deleted: the reference row cascades with the pet or can be deleted directly; future storage cleanup should remove or retire the related object.

## Indexing

Indexes prioritize ownership and common list views: pets by user, photos by user and date, album contents, and pet-specific health/weight histories.

## Migration

See `supabase/migrations/0001_initial_schema.sql`.
