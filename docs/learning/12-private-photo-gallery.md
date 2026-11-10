# Private Photo Gallery

Phase 2B lets an authenticated user browse and delete private photos uploaded in Phase 2A. It adds `/photos`, `/photos/[id]`, and real dashboard recent-photo previews without adding albums, AI labels, pet assignment, or public sharing.

## 1. Gallery Request and Data Flow

The browser requests `/photos`. A Server Component checks the Supabase session, reads only the authenticated user's `photos` rows, generates temporary signed URLs for that page of results, and renders a timeline grid. The browser receives metadata and signed image URLs, not a service-role key or permanent public Storage paths.

## 2. Server Components for Database Reads

Initial gallery and detail reads happen in Server Components because they can safely use the server Supabase client and cookies. This avoids a client-side "fetch then filter" model where private rows might briefly depend on browser logic.

## 3. Private Signed Image URLs

The `user-photos` bucket remains private. The server calls Supabase Storage to create signed URLs only after the row belongs to the current user and the object path begins with that user's ID.

## 4. Why Signed URLs Should Not Be Stored

Signed URLs expire and are access tokens for a specific object. Storing them in PostgreSQL would create stale data and increase the blast radius if metadata was exposed. PiggieVault stores only `storage_path` and creates URLs when needed.

## 5. RLS and Storage Policy Defense in Depth

PostgreSQL RLS protects `photos` rows by `auth.uid() = user_id`. Storage policies protect objects by the first path folder. Application checks use both systems, so a bug in one layer is less likely to expose another user's photos.

## 6. Taken-Date Fallback Logic

The display date is:

1. `taken_at`;
2. `uploaded_at`;
3. `created_at`.

The helper treats malformed dates as unknown. Dates are formatted as UTC calendar dates to avoid month shifts caused by server or browser timezone differences.

## 7. Sorting and Deterministic Ordering

The gallery supports newest-first and oldest-first URL parameters. Equal timestamps are ordered by photo ID so pagination has a stable secondary key.

## 8. Timeline Grouping

After sorting, photos are grouped by UTC month and year, such as `July 2026`. Groups preserve the selected order and include a count.

## 9. URL Query Parameters

`/photos?sort=newest&page=2` is shareable within the user's account. Invalid sort values default to newest-first, and invalid page values default to page 1.

## 10. Pagination Trade-Offs

The page size is 24 photos. Page-based pagination is easy to understand, supports browser navigation, and is enough for this portfolio phase. It can shift if photos are added or deleted while browsing.

## 11. Page-Based Versus Cursor Pagination

Cursor pagination is stronger for constantly changing feeds because the next page starts after a specific item. Page-based pagination is simpler and fits a private gallery where the user is usually browsing their own relatively small library.

## 12. Image Loading and Layout Shift

Gallery cards use fixed aspect-ratio containers and `object-fit: cover`. Detail pages contain the image in a bounded area. The app uses signed URLs directly with Next-compatible image rendering and avoids marking every thumbnail as high priority.

## 13. Private Photo-Detail Authorization

`/photos/[id]` validates the ID shape, checks the current user, queries by both `id` and `user_id`, and returns not found if no owned row is available. This does not reveal whether another user's photo ID exists.

## 14. Safe Deletion Across Storage and PostgreSQL

The delete Server Action accepts only a photo UUID and authenticates the current user. Migration `0010_recoverable_photo_deletion.sql` adds an owner-scoped `begin_photo_deletion` RPC. In one PostgreSQL transaction it deletes the photo, cascades album memberships, predictions and pet-reference relationships, clears album covers, and writes a durable `photo_deletions` record containing the Storage path. The RPC runs as the caller, so existing photo RLS still applies.

Only after that transaction returns a confirmed owned deletion record does the action remove the private object from `user-photos`. It then calls the ownership-checked `acknowledge_photo_deletion` RPC installed by `0015_authorization_boundary_v4.sql`. Only the exact `acknowledged` result counts as success; the RPC checks Storage metadata before recording `storage_deleted_at`. Repeated requests return the same deletion record and always repeat removal and acknowledgment, even with an existing completion timestamp. Concurrent requests may both remove the same object safely. There is no direct outbox UPDATE or privileged-client fallback.

The deletion record also permanently reserves the old photo ID and path. Without that reservation, a delayed upload-finalization retry could recreate metadata while deletion removes the bytes. Database triggers serialize photo creation/deletion per owner with a transaction advisory lock and reject reuse of retired paths/IDs. This requires READ COMMITTED isolation (the Supabase default); lifecycle writes from custom sessions at other isolation levels fail closed. Photo identity and paths are immutable, while ordinary metadata and AI updates are unchanged.

A reference trigger ensures any non-null legacy `pet_reference_photos.storage_path` matches its owned parent photo. Existing inconsistent legacy references cause deletion to fail rather than delete shared bytes. Pet avatars use a different bucket and are not part of general-photo cleanup. A restrictive Storage DELETE policy also requires a committed deletion record and no remaining references, in addition to the existing owner policy.

## 15. Partial Failure Handling and Operations

- Database failure: the photo, related records and Storage bytes stay intact. Transaction rollback also removes the cleanup record.
- Lost database response: Storage is not touched. Retrying by the original photo ID returns the committed cleanup record if the transaction succeeded.
- Storage failure or process exit after database commit: the photo is already removed from the library, but the private object remains and the cleanup record stays pending. The action reports pending cleanup explicitly.
- Storage success followed by failed or lost acknowledgment: the action reports pending cleanup, even if acknowledgment committed. Retry safely removes an already absent object and rechecks through the RPC. Null, unexpected, `unavailable`, or `storage_present` results also remain pending. A successful Storage response alone does not prove absence.
- Unauthorized or unknown IDs: the RPC returns no owned deletion record, and the action never touches Storage. Completed owned IDs remain distinguishable through their private tombstone for safe retries.

Apply migration 0010 separately, after migrations 0001–0009. This action also requires the staging-verified `0015-v4` acknowledgment RPC after 0011–0014. Staging verified the migration and matching application together; production rollout remains separately gated. Missing acknowledgment RPC leaves cleanup pending without falling back to direct writes. This repository change does not apply it to production. Without the RPC, the action fails safely and never falls back to Storage-first deletion. Existing broken records from historical failures are not repaired by this migration.

There is deliberately no new background worker or scheduled service. Pending cleanup is durable but not automatically retried. A repeated authenticated deletion request for the original ID resumes cleanup. If the detail page has disappeared or the user leaves before retrying, maintenance is required; this change does not add a cleanup dashboard. Operators can inspect never-acknowledged work with this read-only query in an appropriately authorized environment:

```sql
select photo_id, user_id, storage_path, requested_at
from public.photo_deletions
where storage_deleted_at is null
order by requested_at;
```

For maintenance, use the same workflow: obtain the owned deletion record, verify its path and owner, remove only that path through the Storage API, then call `acknowledge_photo_deletion` and require `acknowledged`. Never delete directly from `storage.objects` using SQL: that is metadata, not the actual bytes. Account deletion retains these minimal cleanup records so pending bytes are not forgotten; cleanup after account deletion needs an authorized operator because the former user's session is gone.

Keep completed tombstones: deleting them would allow delayed finalization to reuse deleted paths. They store only IDs, path and timestamps, not filenames, image bytes, embeddings or model output. Retaining these small rows is the trade-off for safe retries without a separate job service. Signed upload tokens already issued before deletion can still leave orphan bytes later, but tombstones prevent recreating live photo records at those paths. A completion timestamp proves absence only at the acknowledgment instant. Maintenance must reconcile completed tombstones too, after outstanding signed-upload tokens expire; the null-timestamp query above cannot find later recreations. Storage retention audits remain an operational responsibility.

## 16. Common Gallery Bugs

- Sorting only in the browser after loading every row.
- Trusting a browser-submitted `user_id` or Storage path.
- Storing signed URLs permanently.
- Creating signed URLs before authorization.
- Grouping dates in local time and moving photos across month boundaries.
- Loading full libraries instead of one page.
- Returning different errors for missing versus unauthorized private IDs.

## 17. Testing Strategy

Automated tests cover display-date fallback, UTC month grouping, newest/oldest sorting, deterministic tie-breaking, query parameter validation, pagination ranges, Storage path ownership, detail ID validation, file-size formatting, and metadata fallbacks. Deletion regression tests cover successful and repeated requests, concurrent attempts, database and Storage failures, lost responses, completion acknowledgement failures, and unauthorized requests. The disposable PostgreSQL suite applies all migrations and tests actual RLS, FK cascades, rollback, shared-reference safety, path tombstones, and concurrent upload/deletion locking. The Storage HTTP API itself is mocked; a staging Supabase smoke test is still needed for end-to-end provider behavior.

## 18. Likely Interview Questions

**Why not make the Storage bucket public?**  
Because uploaded photos are private account data. Signed URLs allow temporary browser access without weakening the bucket policy.

**Why check both `user_id` and RLS?**  
The app check gives clear intent and better query scoping. RLS remains a database backstop if app code regresses.

**Why not store signed URLs in the database?**  
They expire and act like temporary access tokens. The stable data is the object path.

**How do you avoid leaking whether another user's photo exists?**  
The detail route queries by both photo ID and current `user_id`, then uses the same not-found response for missing and unauthorized rows.

**What happens if deletion partially fails?**  
Database deletion and a durable cleanup record commit together before Storage removal. Storage failures leave pending cleanup, and retries use the same record without recreating broken photo metadata.

**Why use UTC dates for grouping?**  
UTC makes grouping deterministic across server, browser, and test environments.

## 19. How I Would Explain This Feature in 60 Seconds

"Phase 2B turns uploaded private photos into a real library. The gallery is a protected Server Component route that reads only the current user's photo rows under RLS, creates short-lived signed URLs for the current page, and groups photos by a UTC display date. The detail route repeats the same ownership checks and shows metadata honestly, including that AI has not processed the photo yet. Deletion is a Server Action that takes only a photo ID, atomically retires the authorized metadata and records durable cleanup, then removes the private Storage object with safe retries."

## 20. Important Technical Vocabulary

- **RLS:** PostgreSQL Row Level Security, used to filter rows by authenticated user.
- **Signed URL:** A temporary URL granting access to a private Storage object.
- **Defense in depth:** Multiple layers protecting the same data.
- **Server Component:** A React component rendered on the server, suitable for private reads.
- **Pagination:** Loading a bounded page of results instead of every row.
- **Deterministic ordering:** Stable sort keys that avoid duplicate or missing rows.
- **Timeline grouping:** Organizing photos by calendar periods after sorting.
- **Partial failure:** One system succeeds while another fails in a multi-system operation.
- **Object path:** The private Storage key saved in the database.
- **Service-role key:** A powerful Supabase secret that must never reach browser code.

## Local browser release checks

The [Playwright suite](../../../tests/e2e/README.md) uses generated PNGs and disposable accounts. Its replay case captures the successful finalization request rather than guessing a Server Action identifier, then compares independent database and Storage snapshots after two repeats. This checks that a retry returns the existing photo without duplicating data. Backend-free smoke tests do not prove upload or RLS behavior; the disposable-stack tests and existing PostgreSQL authorization suites provide separate evidence. No staging credentials or private media are part of these tests.

### Confirmed save refresh

Local production-browser diagnosis reproduced successful rename/manual-label Server Actions whose React transition never committed: the server response completed, but the old label revision and disabled Saving control remained visible. Waiting longer did not establish a reliable completion signal. Photo-name and label forms now reload the current document only after their existing action returns success. This reads the authoritative saved state without depending on the suspended transition. Validation errors remain inline; rejected requests are neither retried nor treated as success. Server authentication, ownership checks, revision checks and database writes are unchanged.

The trade-off is a full document load after successful saves, potentially resetting scroll and transient UI state. The shared helper is deliberately limited to these photo forms. Three unit tests check confirmed completion, validation failure and uncertain rejection; the unchanged lifecycle browser assertions verify the rendered result and data preservation. See release preparation for exact repeated-run evidence and the remaining uncertainty about the underlying framework defect.
