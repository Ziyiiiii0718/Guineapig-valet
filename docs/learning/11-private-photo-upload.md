# Private Photo Upload

## What This Feature Does

PiggieVault now lets an authenticated user upload one or more private guinea pig photos. This phase stores the image file in Supabase Storage and stores photo metadata in PostgreSQL. It does not build the full gallery, albums, pet classification, AI embeddings, or review queue.

## Complete Upload Flow

```text
Authenticated upload page
-> browser validates selected files for fast feedback
-> browser converts HEIC/HEIF imports to JPEG when needed
-> server verifies the Supabase user
-> server creates owner-scoped signed upload requests
-> browser uploads directly to private Storage
-> server validates metadata and inserts the photo row
-> if insertion fails, server best-effort removes the uploaded object
```

The server derives `user_id` from the authenticated session. The browser never submits a trusted owner ID.

## Why Private Storage Is Required

Uploaded photos are private user data. A public bucket would make files readable through stable public URLs. PiggieVault uses a private `user-photos` bucket so access depends on an authenticated session and Storage policies.

## Public Buckets Versus Private Buckets

A public bucket is convenient for static website assets, but it is wrong for private account photos. A private bucket requires explicit access, usually through authenticated API calls or short-lived signed URLs.

## Object Paths Versus Database Rows

Storage holds bytes. PostgreSQL holds metadata. The `photos.storage_path` value is the link between them:

```text
<user-id>/<year>/<month>/<unique-file-name>
```

The path starts with the authenticated user ID so Storage policies can enforce ownership. The app does not use the original filename in the path because filenames can contain unsafe or identifying text.

## Direct Browser Upload Versus Server-Proxied Upload

This feature uploads files directly from the browser to Supabase Storage using signed upload tokens. That keeps large image bytes out of Next.js server actions, which is better for serverless deployments where request body size, memory, and timeout limits can be tight.

The trade-off is that Storage and PostgreSQL are two separate systems. If Storage succeeds but the database insert fails, cleanup is best effort instead of a single transaction.

## Signed Uploads and Signed Reads

A signed upload token lets the browser upload exactly to a server-created private object path. A signed read URL is a temporary URL for displaying a private object. This phase uses signed upload tokens for direct upload. Signed read URLs will matter more in the full gallery phase.

## Storage Policies Versus PostgreSQL RLS

PostgreSQL RLS protects table rows such as `photos`. Storage policies protect files in `storage.objects`. Both are needed because a user should not be able to read another user's metadata or another user's image bytes.

The `user-photos` policies check:

```text
(storage.foldername(name))[1] = auth.uid()::text
```

The `photos` table also has RLS on `user_id` and a check constraint requiring `storage_path` to begin with that row's `user_id`.

## Why Browser User IDs Cannot Be Trusted

Browsers are controlled by users. Hidden inputs, JSON payloads, and JavaScript state can all be changed. Server actions must read the authenticated Supabase user and assign ownership from that trusted session.

## File Validation

The centralized upload rules allow:

- JPEG
- PNG
- WEBP
- HEIC imports
- HEIF imports

HEIF is the image container family. HEIC is the common HEIF image encoding used by iPhones. PiggieVault accepts `.heic`, `.heif`, `image/heic`, and `image/heif`; when a browser reports an empty MIME type, the upload flow also checks the file extension. It still does not trust the extension by itself where practical: HEIC/HEIF candidates must contain an ISO-BMFF `ftyp` brand associated with HEIC/HEIF before conversion starts.

The app rejects empty files, unsupported MIME types, files over 10 MB, batches over 10 files, invalid HEIC/HEIF signatures, malformed dimensions, unauthenticated requests, and paths outside the current user's folder.

Client-side validation improves the experience. Server-side validation protects the data.

## HEIC/HEIF Browser Conversion

Most browsers cannot reliably preview or render raw HEIC/HEIF images. Instead of sending the original HEIC file through a Next.js server action, PiggieVault dynamically imports `heic-to` only when the user selects a HEIC/HEIF candidate. The browser converts the image to JPEG at about 0.9 quality, then the normal signed-upload flow uploads that converted JPEG directly to Supabase Storage.

Dynamic import matters because most uploads are already JPEG, PNG, or WEBP. Keeping the decoder out of the initial bundle avoids making the normal upload page heavier for everyone.

The conversion is sequential to keep browser memory usage conservative. HEIC files can be large, and decoding plus JPEG encoding temporarily holds multiple image buffers. A 0.9 JPEG quality setting keeps visual quality high enough for a private photo album while avoiding the much larger files that near-lossless JPEG settings can create.

PiggieVault stores only the converted JPEG in `user-photos`. The Storage filename is still UUID-based and ends in `.jpg`. The database preserves the original filename, such as `IMG_1000.HEIC`, but the stored `mime_type`, dimensions, and file size describe the converted JPEG. This distinction is useful in the detail page: the user can recognize the source file, while the app records the actual stored format.

Live Photos include a still image and a separate `.mov` video component. This phase imports only the still image. Video support needs separate file limits, playback UI, metadata, and Storage policy decisions, so it is intentionally deferred.

## EXIF Metadata

JPEG files may contain EXIF timestamps. The browser helper checks these fields in order:

- `DateTimeOriginal`
- `DateTimeDigitized`
- `DateTime`

For HEIC/HEIF imports, PiggieVault tries to read the original capture date before conversion with a browser metadata parser. That is important because the converted JPEG blob may not contain the same metadata. If the original date cannot be read safely, the normal upload-time fallback still applies.

If no reliable timestamp exists, PiggieVault stores the upload timestamp as `taken_at`. Dates are normalized to ISO timestamps so the database has a consistent timezone-aware format.

## Taken Date Versus Upload Date

`taken_at` is the best available estimate of when the image was captured. `uploaded_at` is when PiggieVault received the upload. If EXIF is missing, both effectively point to the upload time.

## Partial Failures

One failed file should not make successful files look failed. Each selected file has its own status: preparing, converting HEIC, ready, uploading, uploaded, failed, or invalid.

If HEIC/HEIF conversion fails, no signed upload is requested, no Storage object is created, and no database row is inserted. If upload fails before Storage succeeds, no database row is created. If Storage succeeds but metadata insertion fails, the server tries to delete the object. If cleanup fails, an orphaned private object may remain for later maintenance, but the app does not create a misleading row.

## Idempotency and Duplicate Prevention

Each object path uses a random UUID and upload buttons are disabled while active. That avoids object overwrites and accidental duplicate submissions in normal use. Stronger idempotency keys can be added later if uploads become resumable or backgrounded.

## Serverless Deployment Considerations

Direct browser uploads avoid pushing large files through Vercel functions. The server only creates signed upload requests and saves metadata, which keeps requests small and predictable.

## Common Upload Bugs

- Trusting a browser-provided `user_id`.
- Using a public bucket for private photos.
- Storing permanent public URLs.
- Reusing original filenames in Storage paths.
- Forgetting per-file error states in multi-file uploads.
- Creating database rows before Storage succeeds.
- Not cleaning up Storage objects when metadata insertion fails.
- Relying only on frontend validation.
- Treating uploaded photos as AI-classified before any AI service exists.
- Forgetting that Storage policies and table RLS are separate protections.

## Testing Strategy

Useful automated tests cover MIME allowlists, HEIC/HEIF detection, uppercase extensions, empty MIME handling, disguised invalid files, mocked conversion, converted JPEG metadata, original filename preservation, taken-date preservation, rejected file types, size and batch limits, path ownership, metadata validation, EXIF fallback behavior, unauthenticated initialization, mixed-format batches, gallery compatibility, and cleanup after metadata failure. Remote integration tests should use non-personal test users and generated images.

## Interview Questions

Q: Why upload directly to Supabase Storage instead of through Next.js?
A: It avoids sending large image bodies through serverless functions, reducing timeout, memory, and request-size risk.

Q: Why does the object path start with the user ID?
A: Storage policies can compare the first folder to `auth.uid()`, which gives a simple ownership boundary for every object.

Q: Why store object paths instead of public URLs?
A: Paths are internal identifiers. Public URLs would keep private photos publicly reachable.

Q: What protects photo metadata?
A: PostgreSQL RLS allows access only when `photos.user_id = auth.uid()`, and the server always derives `user_id` from the session.

Q: What happens if database insertion fails after upload?
A: The server tries to remove the uploaded object and returns a friendly per-file failure message.

Q: Why convert HEIC in the browser?
A: Browsers do not consistently display HEIC, and sending large image bodies through server actions is a poor fit for serverless limits. Browser-side conversion keeps the server small and stores a gallery-compatible JPEG.

Q: Why is `uploaded` the initial AI status?
A: It honestly says the photo was received but has not been analyzed or classified.

## 60-Second Explanation

PiggieVault private photo upload uses a separate private Supabase Storage bucket named `user-photos`. The server verifies the current Supabase session, creates a safe path under that user's ID, and returns a signed upload token. The browser uploads the image directly to Storage, then the server validates and saves metadata in the RLS-protected `photos` table. The app allows JPEG, PNG, WEBP, HEIC, and HEIF imports up to 10 MB, with 10 files per batch. HEIC and HEIF are converted to JPEG in the browser before upload, preserving the original filename in metadata. EXIF capture dates are used when available, otherwise upload time is stored. If Storage succeeds but the database insert fails, the server tries to clean up the object. No AI classification, albums, or Live Photo video support is implied yet.

## Vocabulary

- Bucket: a Storage container for files.
- Object path: the private path of a file inside a bucket.
- Signed upload token: temporary permission to upload to a specific path.
- Signed URL: temporary read access to a private file.
- MIME type: a file media type such as `image/webp`.
- HEIF: a high-efficiency image container format.
- HEIC: a common HEIF image encoding used by iPhones.
- Dynamic import: loading extra JavaScript only when a feature needs it.
- EXIF: image metadata that can include camera timestamps.
- RLS: PostgreSQL Row Level Security for table rows.
- Storage policy: Supabase access rule for files.
- Orphaned object: a stored file without a matching database row.
- Idempotency: designing repeated attempts so they do not create unsafe duplicates.
