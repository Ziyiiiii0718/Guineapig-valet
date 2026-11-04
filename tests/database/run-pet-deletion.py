"""Run pet deletion SQL and concurrency regressions in the disposable container.

Uses the same isolated container and bootstrap as run-photo-deletion.py, and
runs that suite first to verify compatibility with migration 0010. No network
endpoints or production credentials are accepted. See that runner for startup.
"""
import pathlib
import runpy
import select
import subprocess
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
context = runpy.run_path(str(ROOT / "tests/database/run-photo-deletion.py"))
sql = context["sql"]
COMMAND = context["COMMAND"]
sql((ROOT / "tests/database/pet-deletion.sql").read_text())
print("PASS: pet deletion rollback, RLS, name confirmation, label parity, cascades, shared photos, direct and repeated deletes", flush=True)

OWNER = "12000000-0000-4000-8000-000000000001"
PET = "22000000-0000-4000-8000-000000000001"
PHOTO = "32000000-0000-4000-8000-000000000001"
SESSION = f"set role authenticated; select set_config('request.jwt.claim.sub','{OWNER}',false);"
sql(f"""insert into auth.users values ('{OWNER}');
insert into public.pets(id,user_id,name,sex) values ('{PET}','{OWNER}','Piggie','unknown');
insert into public.photos(id,user_id,storage_path) values ('{PHOTO}','{OWNER}','{OWNER}/concurrent.jpg');
insert into public.photo_pet_predictions(photo_id,user_id,prediction_status,prediction_source)
values ('{PHOTO}','{OWNER}','needs_review','ai');""")


def open_transaction(statement):
    process = subprocess.Popen(COMMAND, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
    # Suppress output before READY so buffered readline cannot hide the marker.
    process.stdin.write("\\o /dev/null\n" + SESSION + "begin;" + statement + "\n\\o\n\\echo READY\n")
    process.stdin.flush()
    if not select.select([process.stdout], [], [], 15)[0] or process.stdout.readline().strip() != "READY":
        process.kill()
        raise AssertionError("Transaction failed to reach synchronization point: " + process.stderr.read())
    return process


def start_request(statement):
    process = subprocess.Popen(COMMAND, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    process.stdin.write(SESSION + statement)
    process.stdin.close()
    return process


def wait_for_blocked(count):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        waiting = sql("select count(*) from pg_locks where not granted and locktype in ('transactionid','tuple');")
        if int(waiting) >= count:
            return
        time.sleep(0.05)
    raise AssertionError("Expected concurrent transaction to block")


def commit(process):
    process.stdin.write("commit;\n\\q\n")
    process.stdin.flush()
    process.wait(timeout=15)
    assert process.returncode == 0, process.stderr.read()


processes = []
try:
    # A label writer first acquires KEY SHARE. Deletion must wait and then see
    # and clean that newly committed label, rather than using an old snapshot.
    writer = open_transaction(f"update public.photo_pet_predictions set candidate_pet_ids=array['{PET}']::uuid[], candidate_scores=array[0.9], candidate_reference_counts=array[3], suggested_pet_ids=array['{PET}']::uuid[] where photo_id='{PHOTO}';")
    processes.append(writer)
    deletion = start_request(f"select outcome from public.delete_pet_transaction('{PET}','Piggie');")
    processes.append(deletion)
    wait_for_blocked(1)
    commit(writer)
    deletion.wait(timeout=15)
    assert deletion.returncode == 0, deletion.stderr.read()
    assert "deleted" in deletion.stdout.read()
    assert sql(f"select cardinality(candidate_pet_ids) from public.photo_pet_predictions where photo_id='{PHOTO}';") == "0"
    print("PASS: delete waits for and cleans concurrent committed prediction labels", flush=True)

    # Recreate a fixture with a new ID, then reverse the order: deletion holds
    # the row lock, while duplicate deletion and a stale prediction write wait.
    PET = "22000000-0000-4000-8000-000000000002"
    sql(f"insert into public.pets(id,user_id,name,sex) values ('{PET}','{OWNER}','Piggie','unknown');")
    first = open_transaction(f"select outcome from public.delete_pet_transaction('{PET}','Piggie');")
    processes.append(first)
    duplicate = start_request(f"select outcome from public.delete_pet_transaction('{PET}','Piggie');")
    late_write = start_request(f"update public.photo_pet_predictions set confirmed_pet_ids=array['{PET}']::uuid[], review_status='confirmed' where photo_id='{PHOTO}';")
    processes.extend([duplicate, late_write])
    wait_for_blocked(2)
    commit(first)
    duplicate.wait(timeout=15)
    late_write.wait(timeout=15)
    assert duplicate.returncode == 0, duplicate.stderr.read()
    assert "absent" in duplicate.stdout.read()
    assert late_write.returncode != 0
    assert "prediction label pet is unavailable" in late_write.stderr.read()
    assert sql(f"select count(*) from public.pets where user_id='{OWNER}';") == "0"
    assert sql(f"select cardinality(confirmed_pet_ids) from public.photo_pet_predictions where photo_id='{PHOTO}';") == "0"
    assert sql(f"select count(*) from public.photos where id='{PHOTO}';") == "1"
    print("PASS: concurrent duplicate deletes are safe; stale review cannot restore deleted pet; shared photo survives", flush=True)
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
