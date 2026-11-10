"""Synthetic final 0015-v4 authorization/upgrade regressions on PostgreSQL 17.

Models hosted non-superuser provisioning and restricted Auth ACLs. Does not run
PostgREST, the Storage API, a hosted executor, or any staging fixture/script.
"""

import hashlib
import json
import runpy
import select
import subprocess
import time
import uuid
from pathlib import Path

from local_postgres import LocalPostgres, ROOT

HERE = Path(__file__).resolve().parent
MIGRATIONS = ROOT / "supabase/migrations"
V4_SHA256 = "301d60547667959a045c86b315ad16fd3fbc11bf1e1f8a685b00c110d9a67f71"
A = "10000000-0000-4000-8000-000000000001"
B = "10000000-0000-4000-8000-000000000002"
PET = "20000000-0000-4000-8000-000000000001"
PHOTO = "30000000-0000-4000-8000-000000000001"
TOKEN1 = "40000000-0000-4000-8000-000000000001"
TOKEN2 = "40000000-0000-4000-8000-000000000002"

with LocalPostgres() as database:
    CMD = database.command.copy()

    def sql(statement):
        p = subprocess.run(
            CMD, input=statement, text=True, capture_output=True, timeout=40
        )
        assert p.returncode == 0, p.stderr
        return p.stdout.strip()

    def denied(statement, expected="permission denied"):
        p = subprocess.run(
            CMD, input=statement, text=True, capture_output=True, timeout=20
        )
        assert p.returncode != 0 and expected in p.stderr, p.stderr or p.stdout

    sql(
        "create role postgres login nosuperuser createrole createdb bypassrls;create database authz owner postgres;"
    )
    CMD[-1] = "authz"
    sql((HERE / "photo-deletion-bootstrap.sql").read_text())
    sql("""create extension vector;
        create role storage_manager nologin;
        alter table storage.objects owner to storage_manager;
        alter table storage.buckets owner to storage_manager;
        grant storage_manager to postgres;
        grant usage on schema auth to postgres;
        grant usage on schema storage to postgres with grant option;
        grant select, references on auth.users to postgres;""")
    ADMIN = CMD.copy()
    MIGRATOR = CMD.copy()
    MIGRATOR[MIGRATOR.index("-U") + 1] = "postgres"
    CMD = MIGRATOR
    migrations = sorted(MIGRATIONS.glob("*.sql"))
    assert [p.name[:4] for p in migrations] == [f"{i:04}" for i in range(1, 16)]
    for migration in migrations[:-1]:
        sql(migration.read_text())
    assert (
        sql(
            "select not rolsuper and rolcreaterole and rolbypassrls from pg_roles where rolname=current_user;"
        )
        == "t"
    )
    assert (
        sql(
            "select has_schema_privilege('postgres','auth','USAGE') and not has_schema_privilege('postgres','auth','USAGE WITH GRANT OPTION');"
        )
        == "t"
    )

    # Only literal synthetic identities/rows. Nothing is loaded from .local.
    CMD = ADMIN
    sql(f"""insert into auth.users values('{A}'),('{B}');
        insert into public.pets(id,user_id,name,sex) values('{PET}','{A}','Hardening','unknown');
        insert into public.photos(id,user_id,storage_path,file_name,file_size)
        values('{PHOTO}','{A}','{A}/{PHOTO}.png','synthetic.png',1024);""")
    snapshot = """select jsonb_build_object(
        'pets',(select jsonb_agg(to_jsonb(t) order by id) from public.pets t),
        'photos',(select jsonb_agg(to_jsonb(t) order by id) from public.photos t),
        'predictions',(select jsonb_agg(to_jsonb(t) order by id) from public.photo_pet_predictions t));"""
    before = sql(snapshot)
    original_policies = json.loads(
        sql(
            "select jsonb_agg(to_jsonb(p)-'roles' order by schemaname,tablename,policyname) from pg_policies p;"
        )
    )
    revised = migrations[-1].read_text()
    assert hashlib.sha256(migrations[-1].read_bytes()).hexdigest() == V4_SHA256
    assert revised.endswith("commit;\n")
    CMD = MIGRATOR
    # Fault injection changes an in-memory test input only, never migration bytes.
    denied(revised.rsplit("commit;", 1)[0] + "select 1/0;\ncommit;", "division by zero")
    assert (
        sql("select count(*) from pg_roles where rolname='piggievault_rpc_writer';")
        == "0"
    )
    assert (
        sql("select count(*) from pg_namespace where nspname='piggievault_private';")
        == "0"
    )
    assert sql(snapshot) == before
    assert (
        json.loads(
            sql(
                "select jsonb_agg(to_jsonb(p)-'roles' order by schemaname,tablename,policyname) from pg_policies p;"
            )
        )
        == original_policies
    )
    print(
        "PASS: end-of-migration failure rolls back role, schema, policies and synthetic data",
        flush=True,
    )
    sql(revised)
    assert sql(snapshot) == before
    current_policies = json.loads(
        sql(
            "select jsonb_agg(to_jsonb(p)-'roles' order by schemaname,tablename,policyname) from pg_policies p;"
        )
    )
    assert all(p in current_policies for p in original_policies)
    assert (
        sql(
            "select admin_option,inherit_option,set_option from pg_auth_members where roleid='piggievault_rpc_writer'::regrole;"
        )
        == "t|f|f"
    )
    denied("set role piggievault_rpc_writer;")
    sql(revised)
    assert sql(snapshot) == before
    print(
        "PASS: exact v4 applied/replayed as non-superuser; data and original policy expressions preserved",
        flush=True,
    )
    CMD = ADMIN
    sql("grant piggievault_rpc_writer to authenticated;")
    CMD = MIGRATOR
    denied(revised, "Unexpected RPC writer membership")
    CMD = ADMIN
    sql("revoke piggievault_rpc_writer from authenticated;")
    denied(
        "set session authorization authenticated;" + revised,
        "Run only as the trusted postgres",
    )
    print(
        "PASS: unexpected API membership and untrusted migration caller rejected",
        flush=True,
    )

    def request(statement, user=A):
        return f"begin;set local role authenticated;select set_config('request.jwt.claim.sub','{user}',true);{statement}commit;"

    def auth(statement, user=A):
        return sql(request(statement, user)).splitlines()[-1:]

    def result(statement, user=A):
        return auth(statement, user)[-1]

    assert (
        sql(
            "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity;"
        )
        == "10"
    )
    sql((HERE / "photo-deletion-v4.sql").read_text())
    assert sql(snapshot) == before
    print(
        "PASS: final-v4 deletion cascades, fault rollback, account cleanup and tombstone retention",
        flush=True,
    )

    context = globals().copy()
    for file in (
        "authorization_identity.py",
        "authorization_cases.py",
        "authorization_concurrency.py",
    ):
        context.update(runpy.run_path(str(HERE / file), init_globals=context))
    print("PASS: complete synthetic v4 authorization and concurrency suite", flush=True)
