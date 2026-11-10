# Local browser release checks

This suite never accepts a hosted URL or an existing Supabase stack. It exercises the real production Next.js build. `smoke` needs no backend; `local` creates a fresh disposable Supabase Auth/PostgREST/Storage/PostgreSQL 17 stack. Neither result certifies hosted staging or production.

## Prerequisites and commands

Use Node 22.18+ (native TypeScript stripping), pnpm 9.15.4, and the committed lockfile. The full suite also needs local Docker with a Unix-socket context, enough resources for Supabase, and free ports 4317 and 54380–54389. Unset `DOCKER_HOST`; remote Docker is rejected. The pinned Supabase CLI downloads its container images on first use. Builds currently fetch Google Fonts.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e:safety
pnpm test:e2e:list
pnpm test:e2e:smoke
pnpm test:e2e:local
pnpm test:e2e:all
# Fresh stack for one lifecycle run, or all five browser tests:
node --experimental-strip-types tests/e2e/run.ts lifecycle
node --experimental-strip-types tests/e2e/run.ts all
```

On Linux, install Chromium system dependencies using Playwright's documented `install --with-deps chromium` command. If the package-manager launcher is unavailable, the already-installed equivalents are `node --experimental-strip-types tests/e2e/run.ts smoke` and `node --experimental-strip-types tests/e2e/run.ts local`. Direct `playwright test` has no runtime session and fails closed; do not invent environment variables to bypass the launcher.

## Coverage and fixtures

- Two smoke tests check anonymous protected-route redirects and login form validation without making an Auth request.
- Three local tests check synthetic login/session/logout; pet create/edit, upload/gallery, rename, manual labels, album membership, cross-owner route denial, and deletion preservation; and successful-upload finalization replay.
- Accounts are random `example.invalid` identities with generated passwords. Images are tiny PNGs generated in memory. No staging fixture, real account, photograph, model, threshold or AI service is used. Empty reference libraries should yield `insufficient_references`.
- Replay captures the actual finalization POST by its upload payload, checks its successful response, waits for its prediction, then repeats the exact bytes twice with the same authenticated browser context. Independent local SQL snapshots assert unchanged photos, predictions, Storage metadata and reference rows; retained bytes must still be downloadable. This tests successful sequential replay, not every possible concurrent interleaving. The separate database suites cover database concurrency and direct-write denial.
- Selectors use labels/roles and semantic resource links. Waits observe UI or database state; there are no arbitrary sleeps. Tests run serially with no retries.

## Isolation and cleanup

The launcher creates `.local/piggievault-e2e/run-<random>/` with restricted permissions. Its allowlisted application snapshot excludes `.env*`, private workspaces and datasets. Child environments discard inherited Supabase/AI/Vercel settings and Node preload hooks. App and API origins are fixed loopback addresses; browser requests to other origins are blocked. The service key stays in the private runner and is never supplied to Next.js. A generated project identity is checked before SQL access. Occupied ports and a reused app server are rejected.

Migrations 0001–0015 are applied only inside that generated local database, with the exact final-v4 checksum checked. The harness requires the reviewed non-superuser `postgres` role prerequisites; it stops instead of changing roles, security controls or the migration to fit a different local image.

Each fixture removes only the Storage paths and accounts it created and checks cleanup. The launcher then stops only its generated project with `--no-backup`, removing its database volumes, and removes the session credential file. Logs and builds stay ignored. Do not upload `.local` to CI artifacts. After a forced termination or cleanup failure, inspect the run's generated `backend/supabase/config.toml` and stop **that exact generated project only**:

```sh
node_modules/.bin/supabase stop --workdir .local/piggievault-e2e/run-<id>/backend --project-id pv-e2e-<id> --no-backup
```

Never use `--all`. Delete the run's remaining session file after stopping it. A hard kill/power loss cannot guarantee fixture teardown; a subsequent run refuses occupied ports rather than reusing the old stack.

The console reporter emits test titles, status and source locations only. By default traces, video and screenshots are disabled; automatically generated error-context snapshots are removed. For a local investigation only, append `--diagnostics` to the launcher command. This records a private trace, console events and form state inside that run directory; traces can contain generated passwords/session tokens. Never publish them, and delete these diagnostic files after investigation. Screenshots and video remain disabled. Failure attachments contain only route patterns and error/request counts. Raw local build/server/infrastructure logs may contain synthetic runtime material and remain private. Do not attach them to issues or CI reports without review.

## Evidence and CI gate

See [release preparation](../../docs/RELEASE_PREPARATION.md) for dated executed results. The stabilization pass passed five consecutive fresh lifecycle-only runs, then all five browser tests in another fresh environment (six consecutive lifecycle passes total, zero retries). The correction refreshes the document after confirmed rename/label success, and the label helper waits for that document load while retaining all rendered-state and database assertions. Baseline failures and the evidence for a client-render stall are recorded in release preparation. Finite local repetition does not guarantee an absence of future flakes. Test discovery or a passing smoke run does not mean mutation workflows or replay passed. Historical manual staging evidence and its skipped replay remain separate.

The full disposable-stack run is green with role prerequisites intact. For GitHub Actions integration, pin the runtime/package manager, install the browser and Docker prerequisites, run safety/smoke/local plus existing application/database checks, and allowlist only sanitized diagnostics as artifacts. Do not inject hosted secrets or reuse Vercel preview environments. The subsequent [CI implementation](../../docs/CI.md) maps these commands to a verification-only workflow. Deployment authorization remains separate.

## File inventory for this phase

New files:

- `playwright.config.mts`: Chromium projects, timeouts, production app server, safe output defaults.
- `tests/e2e/run.ts`, `start-app.ts`, `safety.ts`: disposable stack, isolated build, target and environment validation.
- `tests/e2e/fixtures.ts`, `helpers.ts`: synthetic accounts/media, cleanup, snapshots and browser actions.
- `tests/e2e/smoke.spec.ts`, `workflows.spec.ts`, `safety.node.ts`: smoke, release workflows and target-safety checks.
- `tests/e2e/reporter.ts`, `package.json`, `README.md`: sanitized reporting, ESM scope and these instructions.

Existing files updated in this phase: root `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `.gitignore`, `README.md`, `docs/RELEASE_PREPARATION.md`, `docs/PROJECT_PLAN.md`, and `docs/learning/12-private-photo-gallery.md`. Earlier uncommitted consolidation changes are preserved. The initial infrastructure phase left application source unchanged. The subsequent stabilization pass adds `lib/photos/confirmed-action.ts` and its unit tests, uses it in the photo-name and label forms, and corrects the pet-deletion dialog copy. Migration SQL and ML behavior remain unchanged.
