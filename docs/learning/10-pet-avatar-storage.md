# Pet Avatar Storage

## What This Feature Does

PiggieVault lets an authenticated user upload, replace, and remove a private profile photo for a pet they own. The image appears on the dashboard, pet list, pet detail page, and pet edit page. If no image exists, the app keeps the warm initial-letter avatar fallback.

This is not the general photo gallery, reference-photo workflow, or AI pipeline. It is a focused Storage feature for pet identity.

## Supabase Storage Buckets

A Supabase Storage bucket is a container for files. PiggieVault uses a private bucket named `pet-avatars`.

Private means files are not publicly readable by default. A user needs an authenticated session and matching Storage policy to access an object.

## Object Paths Versus URLs

The database stores only the object path:

```text
<user-id>/<pet-id>/<unique-file-name>
```

It does not store a permanent URL. Permanent public URLs would be risky for private data because anyone with the URL could potentially keep using it. Instead, Server Components create short-lived signed URLs when rendering the UI.

## Signed URLs

A signed URL is a temporary URL that grants access to a private object for a limited time. In PiggieVault, signed URLs are created server-side from the authenticated Supabase session. If signing fails, the UI falls back to the initial-letter avatar rather than showing a broken image.

## Storage Policies

The `0002_pet_avatar_storage.sql` migration creates Storage policies on `storage.objects`.

The key rule is:

```text
(storage.foldername(name))[1] = auth.uid()::text
```

That means the first folder in the object path must equal the authenticated user ID. User A can work inside `user-a/...`, but not inside `user-b/...`.

## Why Browser Ownership Cannot Be Trusted

The browser submits a pet ID and a file, but it does not get to choose a trusted `user_id`. The Server Action reads the current Supabase user, fetches the pet with both `id` and `user_id`, and only then uploads or updates avatar data.

This protects against someone editing form fields or calling the action directly.

## File Validation

The app validates avatar files before upload:

- JPEG, PNG, and WEBP only.
- Empty files are rejected.
- Files over 5 MB are rejected.
- Malformed pet IDs are rejected.
- Unauthenticated and unauthorized attempts are rejected.

The bucket also has MIME type and size restrictions, so application validation and Storage configuration protect the same boundary.

## Replacing and Cleaning Old Files

Replacing an avatar follows this order:

1. Upload the new object.
2. Update `pets.profile_photo_path`.
3. Best-effort remove the old object.

If the upload fails, the database is not changed. If the database update fails, the newly uploaded object is removed best-effort. If old-object cleanup fails, the pet still points to the new valid avatar, and the orphaned old object can be cleaned later.

## No Shared Transaction

PostgreSQL and Supabase Storage do not share one transaction. A database update can succeed while a Storage cleanup call fails, or vice versa. The app handles this by choosing a safe order and by never pointing the pet row at a file before upload succeeds.

## Removing a Photo

Removing an avatar clears `pets.profile_photo_path` and then best-effort deletes the object from Storage. The UI immediately returns to the initial-letter fallback.

## Delete Confirmation Dialog

Pet deletion uses a compact danger zone and an accessible dialog. The dialog names the pet, explains that deletion is permanent, requires typing the pet name, provides Cancel, supports Escape through the native dialog behavior, and prevents repeated submission while pending.

## Common Bugs

- Storing public URLs instead of object paths.
- Trusting a hidden `user_id` input.
- Uploading to a path not scoped by authenticated user ID.
- Updating the pet row before upload succeeds.
- Forgetting to clean up old files after replacement.
- Showing broken images when signed URL creation fails.
- Making a whole card clickable while nesting another link inside it.

## Interview Questions

Q: Why use a private bucket for avatars?
A: Pet data is private. A private bucket plus signed URLs keeps direct file access limited to authenticated, authorized users.

Q: Why store an object path instead of a URL?
A: Paths are stable internal identifiers. Signed URLs are temporary access tokens and should be generated when needed, not saved permanently.

Q: How do Storage policies protect users?
A: They compare the first folder in the object path to `auth.uid()`, so users can only access objects in their own folder.

Q: Why also check ownership in the Server Action?
A: Defense in depth. The app should reject unauthorized mutations before asking Storage or Postgres, while policies still protect the backend if app code has a bug.

Q: What happens if old avatar cleanup fails?
A: The pet still points to the new valid avatar. The old object may be orphaned and can be cleaned later.

## 60-Second Explanation

PiggieVault pet avatars use Supabase Storage with a private `pet-avatars` bucket. The app stores only the object path on the pet row, then creates short-lived signed URLs server-side when rendering pages. Upload, replace, remove, and pet deletion all verify the current Supabase user and pet ownership before touching Storage. Storage policies also restrict users to their own top-level folder, so another user cannot read, upload into, or delete someone else's avatar path. File validation rejects empty, oversized, and unsupported image types. If no signed image is available, the UI falls back to the original initial-letter avatar.

## Vocabulary

- Bucket: a Storage container for files.
- Object path: the internal file path inside a bucket.
- Signed URL: temporary URL for reading a private object.
- MIME type: browser/file-declared content type such as `image/png`.
- RLS: database row-level security.
- Storage policy: access rule for files in Supabase Storage.
- Orphaned object: a file no database row currently references.
