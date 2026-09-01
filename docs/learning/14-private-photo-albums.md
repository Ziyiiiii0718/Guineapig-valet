# Private Photo Albums

Phase 3 organizes existing private photos into custom collections without moving or copying image files.

## Many-to-Many Relationships and Join Tables

One album contains many photos, and one photo can appear in many albums. Neither table can express that relationship with one foreign-key column. The `album_photos` join table stores one row per relationship. Its composite primary key `(album_id, photo_id)` prevents the same photo being added twice to one album while allowing the photo in another album.

## Albums Are Not Storage Folders

An album is PostgreSQL metadata. The original photo remains once in the private `user-photos` bucket under its stable owner-prefixed UUID path. Adding it to five albums creates five small relationship rows, not five images. This preserves HEIC-converted JPEG output, filenames, editable titles, signed delivery, and deletion behavior.

## Foreign Keys, Cascades, and Ownership

Deleting an album cascades to `album_photos.album_id`, removing membership rows only. Deleting a photo cascades through `album_photos.photo_id`, so no broken memberships remain. Neither cascade targets another photo or Storage.

The join table also carries `user_id`. Composite foreign keys `(album_id, user_id)` and `(photo_id, user_id)` require the linked album and photo to share the same owner. This database rule prevents “User A album + User B photo” even if future application code misses a check.

## RLS and Server Authorization

Server Actions authenticate with Supabase cookies, derive the user on the server, and query both IDs under that owner. They never trust a submitted owner ID. RLS independently limits album and membership rows through `auth.uid()`. Missing and unauthorized album IDs share the same not-found behavior, avoiding private existence leaks.

## Private Image Delivery

Album pages first query owner-scoped photo metadata. Only those authorized page results receive short-lived signed URLs. URLs are not stored in PostgreSQL or logged. Pagination bounds how many URLs are generated at once.

## Album Covers

Phase 3 uses the earliest surviving membership as the automatic cover. Empty albums show a PiggieVault placeholder. Removing or deleting that photo naturally selects the next membership. This avoids mutable custom-cover state, invalid cover relationships, and extra Storage copies. Custom cover selection is a documented future enhancement.

## Ordering and Pagination

Album overview sorts by `updated_at` descending, then album ID descending. Album photos sort by membership `created_at` descending, then photo ID descending. The stable tie-breaker prevents ambiguous ordering. Albums use 12-item pages; album contents and the picker use 20-item pages.

## Server and Client Components

Server Components authenticate and load initial album/photo pages close to the database. Client Components are limited to interaction: metadata editing, checkbox selection, removal feedback, and the delete confirmation dialog. This avoids shipping database orchestration or large state systems to the browser.

## Delete Album Versus Delete Photo

Delete album removes the album and join rows but preserves every photo row and Storage object. Remove from album deletes one join row. Delete photo remains the only flow that removes the private Storage object and photo metadata.

## Common Album Bugs

- Copying images into album folders.
- Allowing duplicate join rows.
- Trusting a browser owner ID.
- Checking album ownership but not photo ownership.
- Leaking another user's album through different not-found messages.
- Deleting a photo when removing membership.
- Leaving a broken cover after photo deletion.
- Loading every photo or generating unlimited signed URLs.
- Sorting without a stable tie-breaker.

## Testing Many-to-Many Behavior

Useful tests cover validation, composite uniqueness, one photo in multiple albums, duplicate prevention, cross-owner rejection, membership-only removal, album-only deletion, cascades, cover fallback, ordering, pagination boundaries, and the shared photo display-name fallback. PiggieVault also runs a rollback-only two-user RLS transaction so security is verified without retaining test data.

## Interview Questions

**Why use a join table?**

It represents many-to-many relationships without arrays or duplicated photo rows and gives PostgreSQL a place to enforce uniqueness and foreign keys.

**Why include `user_id` in `album_photos`?**

It supports direct RLS checks and composite foreign keys that prove both parents share the authenticated owner.

**Why do albums not map to Storage folders?**

Albums are presentation metadata. Folder copies would waste storage and introduce cross-system consistency failures.

**What happens when an album is deleted?**

PostgreSQL deletes its join rows through cascade. Photos and private objects are untouched.

**How are cover failures avoided?**

The cover is derived from current membership, so removal or deletion automatically falls back to another photo or the empty placeholder.

**How do private thumbnails work?**

The server queries only the authenticated owner's photos and generates temporary signed URLs for that bounded result set.

## How I Would Explain the Albums Feature in 60 Seconds

“PiggieVault albums are private database relationships, not Storage folders. `albums` stores user-owned metadata and `album_photos` is a composite-key join table, so one photo can appear in many albums without duplicating the image. Server Actions derive the current user, validate both resources, and RLS provides a second authorization layer. Composite foreign keys require the album and photo to share an owner, blocking cross-user combinations at the database level. Album deletion cascades only to membership rows, while photos and Storage remain intact. Album pages generate short-lived signed URLs only for paginated authorized photos, and automatic covers derive from surviving membership so they safely fall back.”

## Vocabulary

- **Many-to-many:** Each record on both sides can relate to multiple records on the other side.
- **Join table:** A table whose rows connect two parent tables.
- **Composite key:** A key made from more than one column.
- **Foreign key:** A constraint requiring a referenced parent row.
- **Cascade:** Automatic cleanup of dependent rows after parent deletion.
- **RLS:** PostgreSQL Row Level Security evaluated for the current user.
- **Signed URL:** A temporary authorized link to a private object.
- **Stable tie-breaker:** A secondary sort key producing deterministic order.
- **N+1 query:** One initial query followed by one query per row, often inefficient.
