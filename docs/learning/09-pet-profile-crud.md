# 09. Pet Profile CRUD

## 1. What CRUD Means

CRUD means Create, Read, Update, and Delete. In PiggieVault Phase 1B, an authenticated user can create guinea pig profiles, list their own pets, view one private profile, edit it, and delete it with confirmation.

## 2. Complete Read And Mutation Flow

Read flow:

```text
Browser requests /pets
-> Next.js Server Component checks Supabase session
-> server queries pets where user_id matches the authenticated user
-> PostgreSQL RLS also filters rows by auth.uid()
-> page renders private pet cards
```

Mutation flow:

```text
Form submits to Server Action
-> Server Action checks session
-> Zod validates form data
-> server assigns or verifies ownership
-> Supabase query runs under the user's session
-> RLS enforces ownership again
-> app revalidates paths and redirects
```

## 3. Server Components Versus Client Components

Server Components read private data because they can safely access the server Supabase client and cookies. Client Components are used only where browser interactivity is useful: form pending states, disabled submit buttons, and validation-state rendering after a Server Action returns.

## 4. How Server Actions Receive And Validate Form Data

The pet forms submit regular `FormData` to `app/actions/pets.ts`. The action converts the form into a plain object, then validates it with `lib/validation/pets.ts`. Browser validation is helpful, but the Server Action is the source of truth.

## 5. Why Authentication Is Checked Inside Every Mutation

Route protection is not enough. A user could call a Server Action directly, so create, update, and delete each call Supabase Auth and require a real user before touching the database.

## 6. How RLS Provides Defense In Depth

The app filters by `user_id`, but PostgreSQL RLS also checks `auth.uid() = user_id`. If application code forgets a filter, RLS still prevents another user's rows from being returned or changed.

## 7. Why Browser Ownership IDs Cannot Be Trusted

The create form never accepts a trusted `user_id`. The server sets `user_id` from the authenticated Supabase user. Update and delete use both the pet ID and authenticated owner ID, and the database policies also reject wrong ownership.

## 8. Database Constraints Versus Application Validation

The database enforces core facts such as non-empty names, allowed sex values, and unique pet names per user. Application validation gives friendlier messages and catches bad input before sending it to the database.

## 9. Redirecting And Revalidating After Mutations

After create, the app redirects to the new pet detail page. After update, it redirects back to that pet detail page. After delete, it redirects to `/pets`. The actions revalidate `/pets`, `/dashboard`, and affected detail routes so the UI reflects fresh data.

## 10. Dynamic Routes

`/pets/[id]` and `/pets/[id]/edit` use a dynamic route segment. The `id` is validated as a UUID before querying. Invalid IDs and unauthorized IDs both use safe not-found behavior.

## 11. Safe Not-Found And Unauthorized Behavior

The app does not reveal whether another user's pet ID exists. If a pet cannot be found through a query scoped to the authenticated user, the detail and edit pages return the same not-found experience.

## 12. Delete Behavior And Foreign-Key Trade-Offs

The existing schema already defines deletion rules:

- deleting a pet cascades future reference photos, weight records, and health records;
- photo records remain because a general photo library may outlive one pet profile;
- predictions that referenced the pet set `pet_id` to null.

### Transactional deletion (finalization phase)

Migration `0011_transactional_pet_deletion.sql` replaces the application's sequence of prediction updates and a later pet delete with one `delete_pet_transaction` RPC. It runs as the authenticated caller, scopes the pet to `auth.uid()`, locks the pet row, checks the typed name against the current stored name, then deletes it. All existing RLS policies remain in force. If the pet is absent, already deleted, or owned by someone else, the RPC returns the same empty-of-private-data `absent` outcome. Repeated requests therefore succeed as a no-op without revealing another owner's pet.

A BEFORE DELETE trigger performs label cleanup in that same transaction, including for direct owner-authorized deletes. It removes the pet from candidate, suggested, and confirmed ID arrays while keeping candidate scores and reference counts aligned. If the last suggested pet disappears, the suggestion becomes Unknown. If the only human-confirmed pet disappears, review becomes pending again, the confirmation flag/time are cleared, and the shared photo's summary status becomes `needs_review`. Remaining confirmed pets and explicit human-confirmed Unknown are preserved. The legacy `pet_id` becomes null. Model metadata, confidence scores for remaining candidates, and classification processing state are not recomputed.

The database then cascades that pet's reference relationships, health records and weight records. General photos, their bytes, album memberships and album covers stay intact, as do other pets' references to those same photos. Any error, even after earlier prediction updates, rolls the entire transaction back.

Array labels do not have ordinary foreign keys. A prediction-write trigger therefore checks and takes KEY SHARE locks on the referenced owned pet rows. If a prediction write commits first, deletion waits and then removes its labels. If deletion commits first, the late write fails rather than recreating dangling labels. The delete trigger requires READ COMMITTED isolation so it sees writes committed while waiting. Concurrent overlapping transactions can still deadlock; PostgreSQL aborts one transaction completely and the caller can safely retry. This does not alter the classifier's inference algorithm.

### Storage boundary and operational limits

Pet deletion retains avatar bytes, as do avatar replacement and removal. This prevents reference-check/deletion races. Private orphan bytes require coordinated future maintenance; see [avatar storage](10-pet-avatar-storage.md). General photo deletion continues using migration 0010’s separate durable workflow.

The database transaction cannot include an in-flight external AI service call. A late prediction referencing the deleted pet is rejected and may need retry. Separately issued classification/review status writes are not made transactional by this change; the prediction label arrays and review fields remain the authoritative identity state.

### Deployment order and verification

Apply migrations 0001–0009, then **0010**, then **0011**, before deploying the updated actions. No migration is applied by the application or by this task. If 0011 is missing, pet deletion reports failure without falling back to the unsafe multi-request sequence. Existing malformed data is not silently repaired; a conflicting constraint or invalid label makes deletion fail safely for investigation.

Run `python3 tests/database/run-pet-deletion.py` against the dedicated disposable container described in `run-photo-deletion.py`. The runner first executes the complete migration 0010 suite, then tests pet deletion, full-row rollback after injected prediction/delete failures, RLS, exact-name confirmation, label-array alignment, shared-photo preservation, relationship cascades, direct/repeated deletion, and real concurrent label writes/deletion. It never accepts a production URL or credentials. Action tests in `tests/pet-deletion.test.ts` cover RPC failures, uncertain responses, retries, authorization, and avatar retention.

## 13. Testing Strategy

Local tests cover pet validation, allowed sex values, optional field normalization, future birth-date rejection, date-only age calculation, ownership, and deletion actions. The disposable PostgreSQL suite tests actual transaction rollback, RLS and locking with synthetic data. Real Supabase HTTP/Storage behavior still requires a staging smoke test.

## 14. Common Bugs

- Trusting `user_id` from the browser.
- Forgetting to check auth inside a Server Action.
- Returning raw database errors to users.
- Treating unauthorized pet IDs differently from missing IDs.
- Calculating age by subtracting only calendar years.
- Letting users delete without a clear confirmation step.

## 15. Likely Interview Questions

Q: Why use Server Actions instead of API routes?
A: The mutations are form-driven and fit Next.js Server Actions well. They keep validation, auth checks, redirects, and revalidation close to the route code without duplicating an API layer.

Q: How do you prevent a user from editing another user's pet?
A: The Server Action checks the session, queries with both `id` and `user_id`, and Supabase RLS also enforces `auth.uid() = user_id`.

Q: Why does the detail page use not-found for unauthorized records?
A: Returning a different error would reveal that a private ID exists. Safe not-found behavior avoids leaking private metadata.

Q: Why calculate age in a helper?
A: Age logic has edge cases around months and date boundaries. A helper keeps it testable and avoids duplicating fragile calculations in UI components.

Q: What happens when a pet is deleted?
A: Existing schema rules cascade dependent pet-owned data such as future weight, health, and reference-photo rows. General photo records are not deleted by pet deletion.

## 16. Sixty-Second Explanation

Phase 1B adds private guinea pig profile CRUD. Authenticated pages read pet data in Server Components, and forms submit to Server Actions. Every mutation validates form data with Zod, checks the Supabase session, and uses the authenticated user ID instead of trusting the browser. Reads and writes are scoped by `user_id`, while Row Level Security enforces the same ownership rule in PostgreSQL. The UI supports list, create, detail, edit, and deliberate delete flows, with age calculated from birth date and tested separately.

## 17. Important Vocabulary

- CRUD: create, read, update, delete.
- Server Component: a React component rendered on the server.
- Client Component: a React component that can use browser interactivity.
- Server Action: a server-side function that can receive form submissions.
- RLS: Row Level Security, database-level row authorization.
- `auth.uid()`: Supabase SQL helper for the authenticated user ID.
- UUID: unique identifier used for pet IDs.
- Revalidation: refreshing cached route data after a mutation.
- Dynamic route: a route with a variable segment, such as `/pets/[id]`.
