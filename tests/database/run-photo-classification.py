"""Atomic classification regressions. Only the dedicated local test container;
no production endpoint or credentials. Includes all 0010–0013 regressions.
"""
import json
import pathlib
import runpy
ROOT = pathlib.Path(__file__).resolve().parents[2]
previous = runpy.run_path(str(ROOT / 'tests/database/run-pet-avatars.py'))
c = previous['c']
sql, owner = c['sql'], c['OWNER']
photo = '34000000-0000-4000-8000-000000000001'
a = '44000000-0000-4000-8000-000000000001'
b = '44000000-0000-4000-8000-000000000002'
d = '44000000-0000-4000-8000-000000000003'
sql(f"insert into public.photos(id,user_id,storage_path) values ('{photo}','{owner}','{owner}/atomic.jpg');")
def auth(statement, user=owner):
    return sql(f"begin; set local role authenticated; select set_config('request.jwt.claim.sub','{user}',true); {statement} commit;")
def start(token):
    return f"select public.start_photo_classification('{photo}','{token}');"
def finish(token, status='ready_for_review', payload=None):
    machine = json.dumps(payload or {'suggested_unknown': True, 'classification_version': 'test-v1'})
    category = "'service_unavailable'" if status == 'failed' else 'null'
    return f"select public.finish_photo_classification('{photo}','{token}','{status}',{category},'{machine}'::jsonb);"
def result(statement, user=owner):
    return json.loads(auth(statement,user).splitlines()[-1])
def snapshot():
    return sql(f"select jsonb_build_array(to_jsonb(p),to_jsonb(r)) from public.photos p join public.photo_pet_predictions r on r.photo_id=p.id where p.id='{photo}';")
def consistent(status):
    assert sql(f"select ai_status from public.photos where id='{photo}';") == status

# A then B starts; B finishes first. A's successful/failed/insufficient results
# are all rejected, and retries of a terminal B cannot replace its result.
assert result(start(a))['outcome'] == 'started'
assert result(start(a))['outcome'] == 'duplicate'
assert result(start(b))['outcome'] == 'started'
assert result(finish(b))['status'] == 'ready_for_review'
before = snapshot()
for state in ['ready_for_review','failed','insufficient_references']:
    assert result(finish(a,state))['outcome'] == 'superseded'
    assert snapshot() == before
assert result(finish(b,'failed'))['status'] == 'ready_for_review'
assert result(start(b))['outcome'] == 'duplicate'
assert snapshot() == before
consistent('ready_for_review')
for statement in [start(d),finish(b)]:
    assert result(statement,'12000000-0000-4000-8000-000000000099')['outcome'] == 'unavailable'
assert snapshot() == before
try:
    sql(f"begin; set local role authenticated; {start(d)} commit;")
    raise AssertionError('Unauthenticated call unexpectedly succeeded')
except AssertionError as error:
    assert 'Authentication required' in str(error)
print('PASS: latest attempt wins, old success/failure/insufficient rejected, duplicate start/finish, RLS and authentication',flush=True)

# Failure in the SECOND write must roll back the prediction too, including start.
sql(f"""create function public.test_fail_classification_summary() returns trigger language plpgsql as $$ begin raise exception 'injected summary failure'; end $$;
create trigger test_fail_summary before update of ai_status on public.photos for each row when (new.id = '{photo}') execute function public.test_fail_classification_summary();""")
try:
    result(start(d))
    raise AssertionError('Expected failure')
except AssertionError as error:
    assert 'injected summary failure' in str(error)
assert snapshot() == before
sql('drop trigger test_fail_summary on public.photos;')
result(start(d)); consistent('processing'); before = snapshot()
sql(f"create trigger test_fail_summary before update of ai_status on public.photos for each row when (new.id = '{photo}') execute function public.test_fail_classification_summary();")
try:
    result(finish(d))
    raise AssertionError('Expected failure')
except AssertionError as error:
    assert 'injected summary failure' in str(error)
assert snapshot() == before
sql('drop trigger test_fail_summary on public.photos; drop function public.test_fail_classification_summary();')
assert result(finish(d,'failed'))['status'] == 'failed'
consistent('failed')
print('PASS: partial start/finish failure rolls back both rows; retry safely records service failure',flush=True)

processes=[]
try:
    # Concurrent starts serialize on photo. B replaces A; both finish requests
    # may race, but only B can commit results.
    first=c['open_transaction'](start(a)); processes.append(first)
    newer=c['start_request'](start(b)); processes.append(newer)
    c['wait_for_blocked'](1); c['commit'](first)
    newer.wait(timeout=15); assert newer.returncode == 0, newer.stderr.read()
    first_finish=c['open_transaction'](finish(b)); processes.append(first_finish)
    old_finish=c['start_request'](finish(a,'failed')); processes.append(old_finish)
    duplicate=c['start_request'](finish(b)); processes.append(duplicate)
    c['wait_for_blocked'](2); c['commit'](first_finish)
    for proc in [old_finish,duplicate]:
        proc.wait(timeout=15); assert proc.returncode == 0, proc.stderr.read()
    assert 'superseded' in old_finish.stdout.read()
    assert 'saved' in duplicate.stdout.read()
    consistent('ready_for_review')

    # Manual labels commit first while AI finish waits. Malicious extra payload
    # fields cannot change ownership, human labels, revision or token.
    result(start(d))
    human=c['open_transaction'](f"select * from public.set_photo_labels('{photo}',0,'{{}}',true,'save');"); processes.append(human)
    ai=c['start_request'](finish(d,payload={'confirmed_unknown':False,'confirmed_pet_ids':[],'review_status':'pending_review','user_id':owner,'labels_revision':99,'classification_version':'overwrite'})); processes.append(ai)
    c['wait_for_blocked'](1); c['commit'](human)
    ai.wait(timeout=15); assert ai.returncode == 0, ai.stderr.read()
    consistent('unknown')
    assert sql(f"select confirmed_unknown and labels_revision=1 and classification_version='test-v1' from public.photo_pet_predictions where photo_id='{photo}';") == 't'

    # Reverse lock order: AI finishes first, then the manual clear sees current
    # processing state and restores that state as the photo summary.
    result(start(a))
    ai_first=c['open_transaction'](finish(a,'insufficient_references')); processes.append(ai_first)
    clear=c['start_request'](f"select * from public.set_photo_labels('{photo}',1,'{{}}',false,'clear');"); processes.append(clear)
    c['wait_for_blocked'](1); c['commit'](ai_first)
    clear.wait(timeout=15); assert clear.returncode == 0, clear.stderr.read()
    consistent('insufficient_references')
    print('PASS: real concurrent retries/completions and manual labels in both lock orders; snapshots and human fields preserved',flush=True)
finally:
    for proc in processes:
        if proc.poll() is None: proc.kill()
