# Release verification CI

`.github/workflows/ci.yml` runs one required candidate check, **Release verification**, on pull requests targeting `dev/piggievault-v1-finalization` or `main`, and pushes to either branch. It does not publish, deploy or apply hosted migrations. No GitHub Actions run has been dispatched by this local implementation.

## Runtime and command mapping

Use GitHub-hosted `ubuntu-24.04` runners, not self-hosted machines. Docker and Python 3 come from that runner image; the job verifies Docker availability and explicitly pulls the PostgreSQL 17 image pinned by the database runner. Node is pinned to **22.23.4**, pnpm to **9.15.4**, and installation uses `pnpm install --frozen-lockfile`. All three official actions are pinned to full release commit SHAs verified against their official repositories. No dependency, database or build cache is uploaded.

| Check | Actual command | Boundary |
| --- | --- | --- |
| Configuration | `python3 tests/ci/support.py preflight` | Refuses inherited Supabase URLs, project references, keys/tokens, database/AI/Vercel configuration, remote Docker and Node preload settings; refuses tracked private environment/workspace files. Values are never printed. |
| CI helper tests | `python3 -m unittest discover -s tests/ci -p 'test_*.py'` | Covers rejection, resource ownership, refusal on local/self-hosted machines, cleanup failure and bounded artifact output. |
| E2E safety | `pnpm test:e2e:safety` | Fixed loopback targets, environment filtering and session requirement. |
| Application tests | `pnpm test` | 291 existing tests; synthetic mocks. |
| ESLint | `pnpm lint:app` | Application/config/test source; excludes private workspace. |
| Types | `pnpm typecheck` | Existing TypeScript project. |
| Database | `pnpm test:db` | Both pre-v4 upgrade and final-v4 suites, PostgreSQL 17, isolated tmpfs containers with no network/host ports. |
| Browser prerequisites | `pnpm exec playwright install --with-deps chromium` | Pinned Playwright package installs matching Chromium and Ubuntu libraries. |
| Production build + browsers | `pnpm test:e2e:all` | Existing launcher builds an environment-file-free application snapshot with `next build --webpack`, then runs both Playwright projects (all five tests) against its fresh local Supabase stack. |

The build is intentionally part of the browser step: this tests the same production output that was just built, without a second build using repository environment files. Supabase CLI **2.122.1** and Playwright **1.65.0** are lockfile dependencies. The CLI provisions local Auth/PostgREST/Storage/PostgreSQL 17 containers; no separate hosted Supabase project is needed. The pgvector image digest supports both Linux amd64 and arm64. Browser tests remain single-worker with zero retries.

Required network downloads are npm packages, official action/Node assets, container images, Playwright/browser/Ubuntu packages and Google Fonts used by the existing production build. Supabase images are selected by the pinned CLI; the separate PostgreSQL regression image uses an immutable digest. Changes in these downloads or runner-image contents can still cause infrastructure failures and must not be worked around by relaxing role/schema checks.

## Credentials, isolation and cleanup

Do not add repository/environment secrets, `secrets: inherit`, hosted URLs, project references, deployment environments, service tokens or real test accounts. The workflow uses `pull_request`, never `pull_request_target` or privileged `workflow_run`. Checkout does not persist credentials. `contents: read` is the only token permission; unspecified permissions are disabled. Third-party/fork code receives no hosted-service secret. Untrusted source code still executes, so runner isolation and withholding secrets are essential; these checks are not a sandbox for malicious code.

Only the existing launcher generates runtime keys for its local disposable project. It sanitizes child environments and checks exact loopback targets, project identity, the unchanged v4 hash and non-superuser migration prerequisites. The application receives only the generated local public key. Users and images are synthetic; no private fixture is copied.

The launcher/fixtures clean up normally. An `always()` step additionally removes only generated Supabase container/volume/network names and regression-container names, then deletes the private E2E directory. This fallback refuses developer workstations and self-hosted runners. Cleanup failures fail the job. A five-minute cleanup limit bounds teardown. No `docker system prune`, global Supabase stop, or blanket container deletion is used.

Concurrency groups separate event/branch runs and **do not cancel an executing run**. Newer pending runs may supersede older pending runs. Manual cancellation, job timeout, runner loss or hard termination can prevent an `always()` step from completing; GitHub-hosted VM disposal is the final resource boundary. Never move this workflow to persistent/self-hosted machines without redesigning cleanup.

## Failure diagnosis

The job stops ordinary checks after a failure, but still attempts cleanup and summary generation. GitHub step outcomes identify the failing check; the safe Playwright reporter prints test status and source locations. No raw trace, screenshot, video, environment file, Storage media, database dump, build output or `.local` directory is an artifact.

On failure only, upload exactly `ci-safe-summary.json`, retained for **three days**. It is under **2 KB**, contains only nine fixed check names and enumerated outcomes, and does not parse raw logs or include exception text, URLs, identifiers, headers or test data. There is no wildcard artifact path. If checkout fails, there is no source-controlled summary generator and no artifact is uploaded. Action/platform logs remain subject to GitHub retention settings.

For detailed diagnosis, reproduce locally with the documented disposable launcher. Opt-in local traces can include generated credentials: keep them private and remove them afterward. Do not enable them in CI or upload them to make diagnosis easier.

## Local evidence and hosted validation

Local implementation validation uses checksum-verified `actionlint` 1.7.12, YAML parsing/structural checks, package-script mapping, the exact pinned Node/pnpm runtime, and a fresh frozen installation in an ignored disposable directory. Execution results are recorded in [release preparation](RELEASE_PREPARATION.md). The local host is macOS arm64, so a local pass is not a GitHub-hosted Ubuntu result.

The first reviewed GitHub run must verify Ubuntu package installation, amd64 Supabase image/role compatibility, runner memory/disk/time limits, action execution, event/permission behavior, failure artifact upload and real cancellation teardown. Nothing in this phase verifies hosted staging or production.

## Mandatory gate before the first push

This workflow has no deployment command, credential, environment or write permission. **It cannot prevent an independent Vercel Git integration from deploying a push or PR.** Before any push, disable or verifiably block automatic Git deployments for **both** connected web and AI-service projects, including production and preview branches. Confirm their project roots, ignored-build rules, deployment protection and environment targeting. Do not assume that the web project's previously canceled build protects the AI-service project.

Also review the complete uncommitted release diff and private-file exclusions; confirm Actions is enabled, pinned actions are permitted, fork approval policy is appropriate, and available runner resources/billing permit the job. After the first green hosted run, require `Release verification` in branch rules together with review requirements, and establish production environment protections. Historical audit findings describe missing protections; they have not been rechecked or changed here. Push approval remains separate. No CI pass authorizes a production rollout.

Action pins: [checkout](https://github.com/actions/checkout/tree/3d3c42e5aac5ba805825da76410c181273ba90b1), [setup-node](https://github.com/actions/setup-node/tree/949feb2413d6458794dcd2491c4babbbce0c15c1), [upload-artifact](https://github.com/actions/upload-artifact/tree/cf430e030ddbb5b0abf93d22962f4752f3646cd9). Update pins and runtime versions through review and repeat validation; do not replace SHAs with floating tags.
