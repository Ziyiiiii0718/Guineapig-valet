"""Pre-v4 upgrade regressions on isolated PostgreSQL 17 through migration 0014.

These historical tests intentionally exercise writes that 0015 later revokes.
Run run-regressions.py for BOTH this chain and the final v4 authorization suite.
No remote endpoints or credentials are accepted; the container is auto-removed.
"""
import atexit
import pathlib
from local_postgres import LocalPostgres
import subprocess
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
database = LocalPostgres(admin="postgres").__enter__()
atexit.register(database.close)
COMMAND = database.command


def sql(statement):
    result = subprocess.run(COMMAND, input=statement, text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()


sql((ROOT / "tests/database/photo-deletion-bootstrap.sql").read_text())
for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
    if migration.name[:4] <= "0014":
        sql(migration.read_text())
print("PASS: pre-v4 migrations 0001–0014 applied to isolated PostgreSQL 17", flush=True)
# Defaults are test fixture data only, never changes to a production migration.
sql("alter table public.photos alter column file_name set default 'fixture.jpg'; alter table public.photos alter column file_size set default 1024;")
sql((ROOT / "tests/database/photo-deletion.sql").read_text())
print("PASS: rollback, cascades, RLS, references, Storage policy, tombstones and retries", flush=True)
isolation = subprocess.run(COMMAND, input="begin isolation level repeatable read; insert into public.photos(user_id,storage_path) values ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001/test.jpg');", text=True, capture_output=True, timeout=10)
assert isolation.returncode != 0 and "require READ COMMITTED" in isolation.stderr
print("PASS: custom transaction isolation fails closed", flush=True)

OWNER = "10000000-0000-4000-8000-000000000001"
PHOTO = "30000000-0000-4000-8000-000000000001"
PATH = OWNER + "/2026/11/concurrent.jpg"
SESSION = f"set role authenticated; select set_config('request.jwt.claim.sub','{OWNER}',false);"
sql(f"insert into auth.users values ('{OWNER}'); insert into public.photos(id,user_id,storage_path) values ('{PHOTO}','{OWNER}','{PATH}');")

# Hold a real open transaction after deleting. A second delete and a late
# finalization must wait on the lifecycle lock until the tombstone is committed.
first = subprocess.Popen(COMMAND, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
try:
    first.stdin.write(SESSION + f"begin; select photo_id from public.begin_photo_deletion('{PHOTO}');\n\\echo READY\n")
    first.stdin.flush()
    while first.stdout.readline().strip() != "READY":
        if first.poll() is not None:
            raise AssertionError(first.stderr.read())
    duplicate = subprocess.Popen(COMMAND, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    late_upload = subprocess.Popen(COMMAND, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    duplicate.stdin.write(SESSION + f"select photo_id from public.begin_photo_deletion('{PHOTO}');")
    duplicate.stdin.close()
    late_upload.stdin.write(SESSION + f"insert into public.photos(user_id,storage_path) values ('{OWNER}','{PATH}');")
    late_upload.stdin.close()
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        waiting = sql("select count(*) from pg_locks where locktype = 'advisory' and not granted;")
        if int(waiting) >= 2:
            break
        time.sleep(0.05)
    else:
        raise AssertionError("Concurrent requests did not wait for the lifecycle lock")
    first.stdin.write("commit;\n\\q\n")
    first.stdin.flush()
    first.wait(timeout=10)
    duplicate.wait(timeout=10)
    late_upload.wait(timeout=10)
    assert first.returncode == 0, first.stderr.read()
    assert duplicate.returncode == 0, duplicate.stderr.read()
    assert PHOTO in duplicate.stdout.read()
    assert late_upload.returncode != 0
    assert "use a new upload path" in late_upload.stderr.read()
    assert sql("select count(*) from public.photos;") == "0"
    assert sql("select count(*) from public.photo_deletions;") == "1"
    print("PASS: concurrent deletions share one job; concurrent finalization cannot resurrect path", flush=True)
finally:
    if first.poll() is None:
        first.kill()
