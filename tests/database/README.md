# Local PostgreSQL regression suites

Run `python3 tests/database/run-regressions.py` (or `pnpm test:db`). Python 3 and a local Docker Unix-socket context are required. Install the pinned image explicitly first if absent:

```sh
docker pull pgvector/pgvector@sha256:7d0a41464797aeb9862dfdc0bbf1526b82cfd324cdd8036df19e3545f4a9ccb8
```

The harness refuses remote Docker contexts, starts fresh PostgreSQL 17.11 containers with `--network none`, no host ports or bind mounts, tmpfs database storage, and removes them at completion. The image is never pulled implicitly. It accepts no database endpoint, loads no `.env` file, and reads no ignored workspace or private fixture. Trust authentication exists only inside these isolated disposable containers.

## Two explicit checkpoints

1. `run-photo-classification.py` chains the existing photo deletion, pet deletion, manual-label, avatar and classification regressions against **0001–0014**. Historical direct-write tests exercise the pre-v4 upgrade state, not the final API permissions. Its base runner now provisions PostgreSQL 17 automatically.
2. `run-authorization.py` applies **0001–0015** from repository source as an actual non-superuser `postgres` migration role. Auth schema access has no grant option, reproducing the capability restriction that motivated v4. Synthetic Auth and Storage metadata stand-ins are bootstrapped by a separate fixture administrator. V4's exact SHA-256 is asserted before execution; the migration file is never rewritten.

Final-schema cases are split into `authorization_identity.py`, `authorization_cases.py`, and `authorization_concurrency.py`, loaded by the runner with an explicit test context. They are extracted synthetic assertions, not staging executors. `photo-deletion-v4.sql` additionally repeats lifecycle/cascade/account-retention and injected-failure checks under the final schema with RPC-only acknowledgment. Cases cover private-helper access, legacy/aggregate claims, malformed/missing identity, API role escalation denial, direct protected writes, valid metadata CRUD, owner isolation, RPC execution, revisions/tokens, Storage acknowledgment, retired paths, rollback, and independent-connection concurrency in both lock orders.

Migration fault injection appends an error before COMMIT in memory and asserts rollback of roles, schema, policies and data. RPC fault injection tests partial-mutation rollback. These tests do **not** validate the private hosted migration-history executor. Hosted ledger atomicity remains separate staging evidence and a production rollout requirement.

## Evidence limits

Storage SQL is a local metadata stand-in; application tests mock the Storage API. No bytes are uploaded or deleted. Request settings model claims but do not verify JWT signatures or exercise PostgREST. Real hosted staging and manual browser evidence is recorded separately in `docs/RELEASE_PREPARATION.md`. This suite is not browser E2E, does not run ML inference, and makes no production verification claim.
