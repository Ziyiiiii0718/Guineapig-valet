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

The delete Server Action receives only a photo ID. It reads the authorized database row to get the Storage path, deletes the object from `user-photos`, then deletes the `photos` row.

## 15. Partial Failure Handling

Storage and PostgreSQL do not share a transaction. PiggieVault deletes Storage first to avoid leaving private image files behind. If metadata deletion fails afterward, the app reports a partial failure and leaves a row that can be retried or cleaned by maintenance.

## 16. Common Gallery Bugs

- Sorting only in the browser after loading every row.
- Trusting a browser-submitted `user_id` or Storage path.
- Storing signed URLs permanently.
- Creating signed URLs before authorization.
- Grouping dates in local time and moving photos across month boundaries.
- Loading full libraries instead of one page.
- Returning different errors for missing versus unauthorized private IDs.

## 17. Testing Strategy

Automated tests cover display-date fallback, UTC month grouping, newest/oldest sorting, deterministic tie-breaking, query parameter validation, pagination ranges, Storage path ownership, detail ID validation, file-size formatting, and metadata fallbacks. Manual tests with configured Supabase credentials are still needed for real signed images and cross-user isolation.

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
If Storage deletion fails, the row is kept. If row deletion fails after Storage succeeds, the app reports that partial failure so the user does not get a false success.

**Why use UTC dates for grouping?**  
UTC makes grouping deterministic across server, browser, and test environments.

## 19. How I Would Explain This Feature in 60 Seconds

"Phase 2B turns uploaded private photos into a real library. The gallery is a protected Server Component route that reads only the current user's photo rows under RLS, creates short-lived signed URLs for the current page, and groups photos by a UTC display date. The detail route repeats the same ownership checks and shows metadata honestly, including that AI has not processed the photo yet. Deletion is a Server Action that takes only a photo ID, reads the authorized row, deletes the private Storage object, then removes metadata with clear partial-failure handling."

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
