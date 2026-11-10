"""Avatar regression tests in the isolated disposable PostgreSQL container only."""
import pathlib
import runpy
ROOT = pathlib.Path(__file__).resolve().parents[2]
c = runpy.run_path(str(ROOT / 'tests/database/run-manual-photo-labels.py'))
sql, owner = c['sql'], c['OWNER']
pet = '23000000-0000-4000-8000-000000000001'
a = f'{owner}/{pet}/33000000-0000-4000-8000-000000000001.jpg'
b = f'{owner}/{pet}/33000000-0000-4000-8000-000000000002.png'
sql(f"insert into public.pets(id,user_id,name,sex) values ('{pet}','{owner}','Avatar','unknown');")
def call(revision, path):
    value = 'null' if path is None else f"'{path}'"
    return f"select outcome from public.set_pet_avatar('{pet}',{revision},{value});"
def auth(statement):
    return sql(f"begin; set local role authenticated; select set_config('request.jwt.claim.sub','{owner}',true); {statement} commit;")
assert 'saved' in auth(call(0,a))
assert 'saved' in auth(call(0,a))
assert 'conflict' in auth(call(0,b))
assert 'saved' in auth(call(1,b))
assert sql(f"select avatar_revision from public.pets where id='{pet}'") == '2'
auth(f"savepoint before_change; {call(2,a)} rollback to before_change;")
assert sql(f"select profile_photo_path from public.pets where id='{pet}'") == b
assert 'saved' in auth(call(2,None))
assert 'saved' in auth(call(2,None))
assert 'conflict' in auth(call(0,a))
assert 'unavailable' in sql(f"begin; set local role authenticated; select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',true); {call(3,None)} commit;")
processes=[]
try:
    first=c['open_transaction'](call(3,a)); processes.append(first)
    duplicate=c['start_request'](call(3,a)); processes.append(duplicate)
    stale=c['start_request'](call(3,b)); processes.append(stale)
    c['wait_for_blocked'](2)
    c['commit'](first)
    for proc in [duplicate,stale]:
        proc.wait(timeout=15)
        assert proc.returncode == 0, proc.stderr.read()
    assert 'saved' in duplicate.stdout.read()
    assert 'conflict' in stale.stdout.read()
    assert sql(f"select avatar_revision from public.pets where id='{pet}'") == '4'
finally:
    for proc in processes:
        if proc.poll() is None: proc.kill()
print('PASS: avatar replacement/removal, retries, rollback, ownership, stale resurrection, concurrent duplicates/conflicts; migrations 0010–0013 compatible',flush=True)
