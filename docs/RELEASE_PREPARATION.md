# PiggieVault V1.0 release preparation

Local consolidation date: 2026-11-09. This document records source provenance and release gates; it is not authorization to push, migrate or deploy.

## Source and migration provenance

The audited development branch was `dev/piggievault-v1-finalization` at `3996115b9d5304bc23b6c56018eecbb6d1279d6b`, matching local HEAD. The local deletion action/test changes are part of the release. They replace direct tombstone timestamp updates with unconditional Storage removal followed by `acknowledge_photo_deletion`; only `acknowledged` succeeds.

`supabase/migrations/0015_authorization_boundary_v4.sql` is copied byte-for-byte from the staging-verified source. SHA-256:

```text
301d60547667959a045c86b315ad16fd3fbc11bf1e1f8a685b00c110d9a67f71
```

Migrations 0001–0014 remain unchanged. Dependencies are sequential: 0010 deletion tombstones/lifecycle locks; 0011 pet deletion/reference guards; 0012 label revisions; 0013 avatar revisions; 0014 classification tokens; 0015 restricted writer/claims helper, protected grants, upload gates and acknowledgment.

Earlier API-permissions, v2 and v3 candidates are superseded, not additional migrations. V4 contains historical review comments, including obsolete wording about PUBLIC-targeted policies. These comments are retained to preserve the verified hash; the SQL retargets sixteen policies to authenticated and adds writer-specific policies. The final semantics are documented in [the security model](SECURITY_MODEL.md). Do not edit the verified migration to accommodate a test or unexpected production prerequisite.

## Evidence boundaries

| Evidence                        | Status and limits                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current local application tests | 38 files / 288 tests passed. Storage and Supabase calls are mocked where applicable; this is not browser E2E.                                                                                                                                                                                           |
| Current local PostgreSQL 17.11  | Retained 0001–0014 upgrade regressions and final-v4 synthetic authorization/concurrency suites passed. Network-disabled disposable containers, no private fixtures or hosted access. See [database test instructions](../tests/database/README.md).                                                     |
| Application ESLint / TypeScript | Passed against current source. Ignored staging runtime is excluded from discovery.                                                                                                                                                                                                                      |
| Production build                | Passed: optimized compilation, TypeScript and page generation. The first sandbox attempt failed to fetch Google Fonts; the rerun with font network access passed. Synthetic loopback Supabase configuration and disabled AI configuration are used, not hosted credentials.                             |
| Real Supabase staging upgrade   | Previously verified through 0015-v4; recorded ledger source hashes match the repository migrations. Original 317 application rows, two Auth users and 105 Storage metadata rows were preserved at the upgrade checkpoint; ten application tables had RLS enabled. This consolidation did not reconnect. |
| Round 2 hosted mutation tests   | Passed with one skipped test. User-reported manual browser actions were supported by independent read-only database/RLS/Storage-metadata checks and direct cross-user mutation-denial probes. They are not automated Playwright results.                                                                |
| Production                      | Not accessed or reverified. Earlier records indicate migration 0009; a fresh baseline is required before any upgrade. No claim that 0010–0015 or the consolidated application is deployed there.                                                                                                        |

Round 2's final preservation check retained all original fixture rows, both original Auth users, all original Storage metadata, and User B's data. Approved synthetic additions/deletions explain differences from the upgrade counts. Raw identities, manifests, credentials, approvals, result files and media remain in the ignored workspace; they are not committed evidence.

## Skipped tests and limitations

- Finalization Replay was skipped in the manual browser run because the successful request could not be identified unambiguously. No replay was attempted. An automated case now captures the exact successful request and replays it twice, asserting unchanged photo, prediction and Storage/reference snapshots. Its execution status is recorded below; implementation alone does not close the skipped hosted case.
- An earlier deletion-candidate label revision increased unexpectedly from 1 to 2. A rollback-only RPC probe and later controlled single-request browser save showed idempotence at revision 2; the earlier increase remains unexplained.
- A direct cross-user pet-delete probe preserved data, but its HTTP response status was not captured by the earlier harness. Other resumed probes recorded response status/shape.
- The final pet-deletion verifier was corrected to expect revision 6: removing the deleted pet from labels legitimately increments the revision under 0012.
- Previously issued elevated signed-upload capabilities may recreate bytes after acknowledgment. Retain tombstones and reconcile completed as well as pending cleanup. There is no background cleanup worker. Avatar orphan cleanup remains coordinated maintenance.
- Local SQL stand-ins do not test JWT verification, hosted PostgREST, Storage object bytes or browser routing. Local rollback tests do not certify the private hosted migration-history executor. The successful staging executor evidence remains distinct.
- No ML experiment, model, threshold or production inference behavior changed or was validated by this consolidation.

## Reproducible validation

With the repository's pinned package manager and dependencies installed:

```sh
pnpm test
pnpm lint:app
pnpm typecheck
pnpm test:db
```

The local environment's pnpm launcher attempted dependency reinstallation and aborted before running scripts. Validation therefore used the installed equivalents without changing the lockfile:

```sh
node node_modules/vitest/vitest.mjs run
node node_modules/eslint/bin/eslint.js app components lib tests proxy.ts next.config.ts vitest.config.ts
node node_modules/typescript/bin/tsc --noEmit
python3 tests/database/run-regressions.py
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-build-only NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-build-only AI_SERVICE_URL= AI_SERVICE_TOKEN= NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build
```

The build may need access to Google Fonts because the existing layout uses `next/font/google`. It must not use staging/production credentials for local validation. Generated build output and TypeScript caches remain ignored. Unit test discovery is restricted to repository `tests/`; TypeScript and ESLint exclude `.local`.

## Local Playwright implementation (2026-11-09)

The [local browser harness](../tests/e2e/README.md) provides two backend-free smoke tests and three disposable-stack workflows, including deterministic successful-upload replay. It builds an allowlisted application snapshot without repository environment files, accepts only fixed loopback targets, generates synthetic users/media, verifies the v4 checksum and database identity, and destroys only its own stack. No hosted connection or CI workflow is introduced.

Validation: two Chromium smoke tests and isolated production builds passed; all 288 application tests, three target-safety checks, application ESLint, TypeScript, and both PostgreSQL 17 regression suites passed. The real disposable Supabase browser run repeatedly passed login/session/logout and successful finalization replay, including unchanged database/Storage/reference snapshots and identical retained image bytes.

### Lifecycle stabilization diagnosis (2026-11-09)

Four fresh pre-correction lifecycle runs reproduced the intermittent failure: three failed and one passed. On a failing Unknown-label save, the action POST returned HTTP 200 in 51 ms with a complete successful Flight payload and the incremented label state, while the browser retained revision 1 and disabled Saving controls. Another failure occurred on the first label save. Console diagnostics found no JavaScript errors, stylesheet loads were complete, and the read-only React root probe showed a suspended pending transition without a ping. Server logs and the action response did not show a mutation failure. This demonstrates a client-render completion problem after server success, rather than a slow database operation.

The precise internal Next.js/React defect is not established. Similar independent [Next.js reports](https://github.com/vercel/next.js/issues/96233) describe this failure shape on the same framework generation; those reports were closed without reproductions and are corroboration, not a confirmed upstream diagnosis.

The scoped correction wraps only photo rename and label-save actions: after the existing action resolves successfully, reload the current document to read authoritative server state. Errors retain their inline handling; uncertain failures are never retried. The trade-off is a full page load and loss of transient UI/scroll state after successful saves. Authentication, ownership checks, label revisions, RLS and mutations are unchanged. Three unit tests cover success, validation error and rejected requests.

The first corrected browser run then timed out in the helper's `response.finished()` wait: the old Flight-stream completion wait did not settle although the refreshed page showed enabled controls. The helper now arms a document-load event before submitting, retaining its HTTP-success, enabled-control and rendered-revision assertions. No test timeout was increased, no sleep/retry was added, and all lifecycle data-integrity and cross-owner assertions remain required.

After both corrections, five consecutive lifecycle-only runs passed, each with a fresh disposable Supabase project, synthetic accounts/media and isolated production build; retries remained zero. The earlier four baseline runs (three failures/one pass), one post-application-fix timeout before the helper correction, and one launcher filter attempt that selected no tests are excluded from that five-run stability sequence. All 288 original application tests plus three new tests passed (291 total), along with three target-safety checks, both PostgreSQL 17.11 suites, application ESLint and TypeScript. Every browser run built the production snapshot with `next build --webpack`. The subsequent complete suite passed all five tests in a sixth fresh environment, including lifecycle and exact successful-upload replay. Thus the final code passed six consecutive lifecycle executions in total, with no observed remaining flake. All generated stacks and session files were cleaned up; this pass's private traces/logs/build snapshots were removed after diagnosis. These results support proceeding to CI integration, not production deployment approval. Historical manual staging evidence remains unchanged, including its skipped replay; automated local replay does not retroactively create hosted evidence. Production remains unverified.

Files changed by this stabilization pass (earlier consolidation/E2E changes are preserved):

- `lib/photos/confirmed-action.ts` (new), `components/photos/photo-name-editor.tsx`, `components/ai/review-prediction-form.tsx`: confirmed-success refresh.
- `components/pets/delete-pet-form.tsx`: wording only.
- `tests/confirmed-photo-action.test.ts` (new): three outcome tests.
- `tests/e2e/helpers.ts`: document-load synchronization; `run.ts`: focused/all modes and optional diagnostics; `safety.ts`: private diagnostic-session flag; `fixtures.ts`: opt-in private tracing and console/form diagnostics; `README.md`: commands and evidence.
- `docs/RELEASE_PREPARATION.md`, `docs/PROJECT_PLAN.md`, `docs/learning/09-pet-profile-crud.md`, `docs/learning/12-private-photo-gallery.md`: diagnosis, results, behavior and limitations.

The pet-deletion dialog now accurately distinguishes removed pet/reference/label records from retained general library records and private avatar files requiring separate cleanup. Deletion and Storage cleanup code are unchanged. This minimal browser suite does not exercise avatar cleanup.

The full local workflow gate is green. The subsequent CI implementation below pins the runtime/package manager, provisions dependencies and restricts failure artifacts; hosted execution and deployment safeguards remain separate gates. Wider avatar, weights/health and deletion-retry browser coverage is outside this minimal phase; existing application/database tests remain complementary evidence.

## GitHub Actions CI implementation (2026-11-09)

The [verification-only workflow](CI.md) is implemented locally for PRs and pushes targeting the development branch and main. It pins official action release SHAs, Node 22.23.4 and pnpm 9.15.4; uses frozen dependencies; runs application, safety, PostgreSQL 17, lint, type and complete production-build/browser checks; and includes bounded failure outcomes plus always-run targeted cleanup. No hosted credentials, deployment jobs, migration changes or ML changes were introduced.

Local validation: actionlint 1.7.12 and YAML/structure/package-script checks passed. Five CI-boundary tests and three E2E safety tests passed. A fresh frozen dependency installation with the exact pinned runtime/package manager passed; all 291 application tests, ESLint, TypeScript and both PostgreSQL 17.11 suites passed with those pins. The pinned image manifest includes Linux amd64 support. The isolated production build and all five Playwright tests passed under the pinned runtime. A separate fresh-install source copy passed all 291 application tests, ESLint and TypeScript without a pre-existing `.next` cache. Generated local test containers, volumes and networks were verified absent after teardown; private run files were then removed.

GitHub-hosted Ubuntu execution, apt/browser installation, permissions/event behavior, artifact upload and cancellation teardown remain unverified until the first reviewed run. Before any push, independently block automatic Git deployments for both Vercel projects, review the release diff/private-file exclusions and confirm Actions policy/resources. The workflow cannot suppress separate Vercel Git integrations. Branch/review/environment protections remain rollout gates. No commit, push, workflow dispatch or deployment occurred during local implementation.

## Deployment safeguards observed during the read-only audit

At the audited commit, GitHub reported no protection on the development branch or `main`, no repository rulesets, zero Actions workflows, and no protection rules or branch restrictions on either Production environment. These are historical audit observations, not refreshed by local consolidation.

Vercel reported the web build canceled by its Ignored Build Step, while the separate `ai-service` deployment ran and failed. A cancellation on one commit/project does not protect both projects or establish future behavior. Vercel settings could not be inspected in the available logged-out session.

Before any push, verify both projects' production branch, preview branch selection, ignore-build rules, root/build configuration, environment-specific Supabase/AI variables, deployment protection and credentials. Establish required CI/review and branch/environment safeguards; do not rely on an unenforced manual convention. Preview must not target production Supabase. Do not disable an existing safeguard just to obtain a green deployment.

## Production rollout and recovery gates

1. Review the exact release diff and secrets/private-file exclusions; approve commits/push separately.
2. Complete CI/E2E and verify deployment controls for both connected projects.
3. Read-only verification of the intended production target, current schema and ledger, PostgreSQL 17 role capabilities, grants, policy ownership, migration hashes and preservation baseline; obtain backups and a reviewed recovery plan.
4. Drain application/AI requests and control writers before the schema transition. Coordinate the new schema and compatible application; old cleanup timestamp writes are denied by v4. Do not leave old clients running through the transition.
5. Use a separately reviewed executor that keeps each migration and its ledger insert in one transaction. Ordinary CLI `db push` with these explicit-transaction files is not established as safe. A dry run verifies selection only. Executors/approvals remain private, not application source.
6. Stop on unexpected state, warnings or errors. A lost COMMIT response is ambiguous: reconcile schema and history read-only before considering retry. Do not blindly rerun, reset, edit applied migrations or broaden grants.
7. Verify schema, ledger, writer/RPC permissions, RLS, preservation, Auth redirects/email setup and isolated smoke tests before reopening traffic. Do not roll back to an application that performs forbidden direct writes; use the reviewed recovery plan.

No hosted migration, hosted Auth/Storage mutation, commit, push, merge or deployment is performed by this document or by the local regression commands. Database mutations occur only in disposable local test containers.
