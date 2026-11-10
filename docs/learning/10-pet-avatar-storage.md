# Pet Avatar Storage

> Release update: the sections below explain the original 0011–0014 implementation. After 0015-v4, pet deletion, manual labels, avatar updates and classification RPCs use a restricted SECURITY DEFINER writer and private request-identity helper instead of running as the authenticated caller. RLS and explicit ownership checks remain enforced. Direct protected writes are denied. See [the final security boundary](../SECURITY_MODEL.md#final-authorization-boundary-0015-v4) and [release evidence](../RELEASE_PREPARATION.md).


Pet avatars remain private in `pet-avatars`. The database stores a path; existing ten-minute signed display URLs and initial-letter fallbacks remain unchanged.

## Why larger uploads failed

Next.js defaults Server Action bodies to 1 MB. Our `next.config.ts` does not override that limit. Previously the form sent the image, plus multipart overhead, through a Server Action even though both application validation and migration 0002's Storage bucket allow 5 MB (5 × 1024 × 1024 bytes).

## Direct upload and confirmation

The browser validates JPEG, PNG, or WEBP and a nonempty size no greater than 5 MB. A metadata-only initialization action authenticates the user, checks pet ownership and the displayed avatar revision, and creates a unique owner/pet/UUID path with a signed upload token (`upsert: false`). The browser sends image bytes directly to Supabase Storage using that token. Existing private Storage policies and the bucket's size/type constraints remain in force.

A metadata-only finalization action checks ownership and path scope again, then queries Storage object information to verify existence, size and content type. It invokes `set_pet_avatar`, which locks the owned pet and updates its path only if the expected revision still matches. This is optimistic concurrency: an old browser cannot silently overwrite a newer choice. The same desired path is a successful no-op, so lost responses and concurrent duplicate requests can be retried. Revisions increase even if a photo is subsequently removed, preventing a stale upload from restoring it.

The form retains the prepared path/token for retries with the same selection. A failed upload response still leads to verification because the bytes may have arrived. Selecting a new file starts a new upload. Expired tokens require selecting the file again. Interrupted uploads never clear the old avatar. Uncertain database responses can be retried; errors are shown without discarding the current display.

Removal uses the same authenticated RPC with a null path and revision. Repeated removal is safe, and stale removal cannot clear a newer replacement. Removal controls depend on the stored path, so they remain available when URL signing fails.

## Cleanup trade-off

Upload failure, replacement, removal and pet deletion never delete avatar Storage objects. Checking references and then deleting is unsafe: a concurrent request could attach that object between those steps. Retaining private bytes removes that failure mode, including shared paths and uncertain database outcomes. General photo Storage objects are untouched.

This deliberately leaves replaced, abandoned, and removed avatars in private Storage. No automatic reaper or avatar tombstone infrastructure is added. Future reclamation must coordinate with active uploads and pointer updates (for example durable retirement state enforced on every writer); a scan followed by deletion is insufficient. Existing owner-scoped Storage delete policies remain unchanged, so direct user API deletions remain outside the application workflow guarantee. MIME metadata validation does not decode image contents; existing bucket MIME restrictions remain the upload contract.

## Deployment and verification

The release requires migrations **0010 → 0011 → 0012 → 0013 → 0014 → 0015** in order. Migration 0013 introduced `avatar_revision`, a revision-maintaining trigger, and an invoker `set_pet_avatar` RPC. V4 elevates that RPC under the restricted writer, with private request identity and writer-specific RLS; direct avatar pointer/revision updates are denied. No production migration is applied by this task. Avoid overlapping old application instances that still delete avatar bytes during rollout.

Action tests cover size/type checks, object verification, authorization, replacement, removal, retries and failures. `tests/database/run-pet-avatars.py` runs the existing deletion/manual-label suites plus real PostgreSQL avatar transaction, RLS and concurrency checks inside the disposable container documented in `run-photo-deletion.py`; it accepts no production credentials. Use `python3 tests/database/run-regressions.py` to include the final-v4 permissions and concurrency suite as well.
