# Real independent connections/transactions; no remote network or sleeps in SQL.
processes = []
request_prefix = f"begin;set local role authenticated;select set_config('request.jwt.claim.sub','{A}',true);"


def open_tx(statement):
    p = subprocess.Popen(
        CMD,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    processes.append(p)
    p.stdin.write(
        "\\o /dev/null\n" + request_prefix + statement + "\n\\o\n\\echo READY\n"
    )
    p.stdin.flush()
    if (
        not select.select([p.stdout], [], [], 15)[0]
        or p.stdout.readline().strip() != "READY"
    ):
        p.kill()
        p.wait(timeout=5)
        raise AssertionError(
            "Transaction did not reach synchronization point: " + p.stderr.read()
        )
    return p


def pending(statement):
    p = subprocess.Popen(
        CMD,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    processes.append(p)
    p.stdin.write(request(statement))
    p.stdin.close()
    return p


def blocked(n):
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        count = sql(
            "select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock';"
        )
        if int(count) >= n:
            return
        time.sleep(0.05)
    raise AssertionError("Expected concurrent blocking not observed")


def commit(p):
    p.stdin.write("commit;\n\\q\n")
    p.stdin.flush()
    p.stdin.close()
    p.wait(timeout=15)
    assert p.returncode == 0, p.stderr.read()


def complete(p, expected=None, error=None):
    p.wait(timeout=15)
    out = p.stdout.read()
    err = p.stderr.read()
    if error:
        assert p.returncode and error in err, err
    else:
        assert p.returncode == 0, err
        if expected:
            assert expected in out, out
    return out


try:
    rev = int(
        result(
            f"select labels_revision from public.photo_pet_predictions where photo_id='{PHOTO}';"
        )
    )
    first = open_tx(labels(rev))
    duplicate = pending(labels(rev))
    stale = pending(labels(rev, False, f"array['{PET}']"))
    blocked(2)
    commit(first)
    complete(duplicate, "saved")
    complete(stale, "conflict")
    assert (
        result(
            f"select confirmed_unknown and labels_revision={rev + 1} from public.photo_pet_predictions where photo_id='{PHOTO}';"
        )
        == "t"
    )
    print(
        "PASS: concurrent manual edits: one increment, duplicate saved, stale competing correction rejected",
        flush=True,
    )
    x = str(uuid.uuid4())
    y = str(uuid.uuid4())
    start = lambda token: (
        f"select public.start_photo_classification('{PHOTO}','{token}');"
    )
    finish = lambda token: (
        f"select public.finish_photo_classification('{PHOTO}','{token}','failed','service_unavailable','{{}}');"
    )
    first = open_tx(start(x))
    newer = pending(start(y))
    blocked(1)
    commit(first)
    complete(newer, "started")
    first = open_tx(finish(y))
    old = pending(finish(x))
    duplicate = pending(finish(y))
    blocked(2)
    commit(first)
    complete(old, "superseded")
    complete(duplicate, "saved")
    assert (
        result(
            f"select processing_token='{y}' and processing_status='failed' from public.photo_pet_predictions where photo_id='{PHOTO}';"
        )
        == "t"
    )
    assert (
        result(f"select ai_status from public.photos where id='{PHOTO}';") == "unknown"
    )
    # Both lock orders: manual revision wins human state while machine finish saves.
    z = str(uuid.uuid4())
    result(start(z))
    rev = int(
        result(
            f"select labels_revision from public.photo_pet_predictions where photo_id='{PHOTO}';"
        )
    )
    first = open_tx(labels(rev, False, f"array['{PET}']"))
    ai = pending(finish(z))
    blocked(1)
    commit(first)
    complete(ai, "saved")
    assert (
        result(f"select ai_status from public.photos where id='{PHOTO}';")
        == "specific_pet"
    )
    z = str(uuid.uuid4())
    result(start(z))
    rev = int(
        result(
            f"select labels_revision from public.photo_pet_predictions where photo_id='{PHOTO}';"
        )
    )
    first = open_tx(finish(z))
    human = pending(labels(rev))
    blocked(1)
    commit(first)
    complete(human, "saved")
    assert (
        result(f"select ai_status from public.photos where id='{PHOTO}';") == "unknown"
    )
    print(
        "PASS: concurrent classification starts, stale/duplicate completions, and manual changes in both lock orders",
        flush=True,
    )
    rev = int(result(f"select avatar_revision from public.pets where id='{PET}';"))
    call = lambda path: (
        f"select outcome from public.set_pet_avatar('{PET}',{rev},'{path}');"
    )
    first = open_tx(call(a))
    duplicate = pending(call(a))
    stale = pending(call(b))
    blocked(2)
    commit(first)
    complete(duplicate, "saved")
    complete(stale, "conflict")
    print("PASS: concurrent avatar duplicate/stale updates", flush=True)
    # Tombstone transaction wins: upload cannot resurrect after waiting; acknowledgment
    # observes no metadata. No managed Storage-table trigger or superuser role needed.
    for upload_first in [False, True]:
        f = str(uuid.uuid4())
        path = f"{A}/{f}.png"
        auth(
            f"insert into public.photos(id,user_id,storage_path,file_name,file_size) values('{f}','{A}','{path}','synthetic.png',1);"
        )
        upload = f"insert into storage.objects(bucket_id,name) values('user-photos','{path}');"
        delete = f"select photo_id from public.begin_photo_deletion('{f}');"
        if not upload_first:
            first = open_tx(delete)
            late = pending(upload)
            ack = pending(f"select public.acknowledge_photo_deletion('{f}');")
            blocked(2)
            commit(first)
            complete(late, error="row-level security")
            complete(ack, "acknowledged")
        else:
            first = open_tx(upload)
            later = pending(delete)
            blocked(1)
            commit(first)
            complete(later, f)
            assert (
                result(f"select public.acknowledge_photo_deletion('{f}');")
                == "storage_present"
            )
            auth(
                f"delete from storage.objects where bucket_id='user-photos' and name='{path}';"
            )
            assert (
                result(f"select public.acknowledge_photo_deletion('{f}');")
                == "acknowledged"
            )
    first = open_tx(f"select public.acknowledge_photo_deletion('{f}');")
    duplicate = pending(f"select public.acknowledge_photo_deletion('{f}');")
    blocked(1)
    commit(first)
    complete(duplicate, "acknowledged")
    print(
        "PASS: upload/deletion serialization in both orders; acknowledgment cannot race a permitted in-flight upload",
        flush=True,
    )
    # Pet deletion cleans references under the limited role, serializes duplicates,
    # and leaves shared photo metadata intact. Transactional failure rolls back.
    rev = int(
        result(
            f"select labels_revision from public.photo_pet_predictions where photo_id='{PHOTO}';"
        )
    )
    result(labels(rev, False, f"array['{PET}']"))
    sql(
        "create function public.test_fail_pet() returns trigger language plpgsql as $$begin raise exception 'injected pet failure';end$$;create trigger test_fail_pet after delete on public.pets for each row execute function public.test_fail_pet();"
    )
    before = sql(
        f"select to_jsonb(r) from public.photo_pet_predictions r where photo_id='{PHOTO}';"
    )
    denied(
        request(f"select * from public.delete_pet_transaction('{PET}','Hardening');"),
        "injected pet failure",
    )
    assert before == sql(
        f"select to_jsonb(r) from public.photo_pet_predictions r where photo_id='{PHOTO}';"
    )
    sql(
        "drop trigger test_fail_pet on public.pets;drop function public.test_fail_pet();"
    )
    first = open_tx(
        f"select outcome from public.delete_pet_transaction('{PET}','Hardening');"
    )
    duplicate = pending(
        f"select outcome from public.delete_pet_transaction('{PET}','Hardening');"
    )
    blocked(1)
    commit(first)
    complete(duplicate, "absent")
    assert result(f"select count(*) from public.photos where id='{PHOTO}';") == "1"
    assert (
        result(
            f"select cardinality(confirmed_pet_ids)=0 from public.photo_pet_predictions where photo_id='{PHOTO}';"
        )
        == "t"
    )
    print(
        "PASS: pet deletion rollback/concurrency/label cleanup and preservation of shared photo",
        flush=True,
    )
finally:
    for proc in processes:
        if proc.poll() is None:
            proc.kill()
