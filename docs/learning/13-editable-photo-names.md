# Editable Photo Names

Phase 2C lets an authenticated user give a private photo a friendly name without changing the uploaded file or its private Storage object.

## Separate Metadata From Storage Keys

A name shown to a person has different requirements from an internal object key. People want readable, editable names with spaces, Chinese characters, punctuation, and emoji. Storage needs stable, collision-resistant identifiers.

PiggieVault therefore keeps three separate values:

- `storage_path`: the internal owner-scoped UUID path, such as `<user-id>/2026/08/<uuid>.jpg`;
- `file_name`: the preserved original upload name, such as `IMG_3847.HEIC`;
- `display_name`: optional editable metadata, such as `Annie eating hay`.

## Why UUID Storage Names Are Useful

UUID object names avoid collisions, do not expose user-supplied filenames in bucket keys, and remain stable when the user edits a title. This is especially useful for converted HEIC files because the original `.HEIC` name can remain metadata while Storage contains a browser-compatible UUID `.jpg`.

## Why Storage Objects Are Not Renamed

Renaming an object would require copying or moving bytes, updating the database path, handling partial failures, and coordinating signed URLs and deletion. Supabase Storage and PostgreSQL do not share one transaction. Keeping the path stable makes a title change a small PostgreSQL metadata update and avoids new consistency failure modes.

## Database Migration Strategy

Migration `0004_photo_display_names.sql` adds a nullable `photos.display_name` column. Existing rows remain valid because `null` means “use the original filename fallback.” A check constraint requires stored custom names to be trimmed, non-empty, and at most 80 characters.

The existing `photos` update RLS policy already limits updates to rows where `auth.uid() = user_id`, so the new column inherits the established ownership model without a new policy.

## Server-Side Authorization

The rename Server Action validates the photo UUID and intent, validates and trims the custom name or handles an explicit reset, authenticates the Supabase user on the server, queries by both `id` and authenticated `user_id`, checks the existing owner-scoped Storage path, and updates only `display_name` and `updated_at`.

The browser never submits a trusted `user_id` or Storage path. Missing and unauthorized IDs return the same friendly message, so the action does not reveal whether another user owns a guessed photo ID.

## RLS As Defense In Depth

Application ownership filters make intent clear and produce safe UI behavior. PostgreSQL RLS independently rejects cross-user updates if application code is accidentally weakened later. No service-role key is used, so the authenticated user's RLS context remains effective.

## Validation

Names are trimmed and must contain between 1 and 80 Unicode characters. Normal text, Chinese, numbers, spaces, punctuation, and emoji are treated as plain React text, not HTML. Blank saves are rejected. Reset is explicit and stores `null`, avoiding ambiguity between a mistake and an intentional return to the original filename.

The name never becomes a bucket key, filesystem path, or Storage operation argument.

## Shared Fallback Logic

`getPhotoDisplayName(photo)` is used by detail and shared photo-card UI:

1. a non-blank `display_name`;
2. the original `file_name` with only its final extension removed;
3. `Untitled photo` when neither value is useful.

The full original filename remains visible in detail metadata. Gallery and Dashboard both render `PhotoCard`, so they cannot drift into different naming behavior.

## Accessible Editing

The detail page keeps editing compact. Edit focuses and selects the input. Enter submits the form. Escape or Cancel closes it and restores focus to Edit. Pending controls are disabled to prevent duplicate submissions. Reset is shown only when a custom name exists.

## Common Rename-Feature Bugs

- Renaming the Storage object and creating database/Storage drift.
- Overwriting `file_name`, which loses original upload identity.
- Trusting a browser-supplied owner ID or Storage path.
- Updating by photo ID without an owner filter.
- Treating blank input as an implicit reset.
- Implementing different fallbacks in Gallery and Dashboard.
- Rendering user input as HTML instead of text.
- Forgetting to revalidate every page that displays the name.

## Interview Questions

**Why is `display_name` separate from `file_name`?**
`file_name` preserves upload identity for metadata and debugging. `display_name` is optional user-owned presentation metadata that can change safely.

**Why not rename the Storage object?**
It would turn a small metadata update into a cross-system copy/update/delete workflow without a shared transaction.

**How do you prevent one user renaming another user's photo?**
The Server Action authenticates the user, filters both reads and updates by `id` and `user_id`, returns the same response for missing and unauthorized rows, and relies on RLS as a second barrier.

**Why use an explicit reset action?**
It distinguishes intentionally returning to the original filename from accidentally submitting blank text.

**How are Gallery and Dashboard kept consistent?**
Both use the same typed fallback helper through the shared `PhotoCard` component.

**How is user input kept safe?**
The server trims and validates length, React renders it as text, and the value is never used in Storage paths or filesystem operations.

## How I Would Explain This Feature In 60 Seconds

“PiggieVault photo names are editable metadata, not file renames. Storage keeps a stable owner-scoped UUID path, `file_name` preserves the original upload name, and nullable `display_name` stores the user's friendly title. A shared helper shows the custom title first, otherwise the original filename without its extension, otherwise `Untitled photo`. The Server Action validates a maximum of 80 Unicode characters, authenticates the user, scopes reads and updates by both photo ID and owner ID, and relies on RLS for defense in depth. Reset explicitly stores null. Because no Storage object moves, signed URLs, HEIC JPEG conversion, gallery rendering, and deletion continue using the same stable path.”

## Vocabulary

- **Storage key:** The internal bucket object path.
- **Original filename:** The name supplied by the uploaded file.
- **Display name:** Optional editable user-facing metadata.
- **Fallback:** A safe value used when preferred metadata is absent.
- **Defense in depth:** Multiple independent authorization checks protecting the same data.
