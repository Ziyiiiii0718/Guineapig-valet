# Synthetic claims/role assertions loaded by run-authorization.py only.

assert (
    sql(
        "select has_schema_privilege('postgres', 'auth', 'USAGE') and not has_schema_privilege('postgres','auth','USAGE WITH GRANT OPTION');"
    )
    == "t"
)
assert (
    sql("select has_schema_privilege('piggievault_rpc_writer','auth','USAGE');") == "f"
)
assert (
    sql(
        "select has_schema_privilege('piggievault_rpc_writer','piggievault_private','USAGE');"
    )
    == "t"
)
assert (
    sql(
        "select has_schema_privilege('piggievault_rpc_writer','piggievault_private','CREATE');"
    )
    == "f"
)
assert (
    sql(
        "select has_schema_privilege('authenticated','piggievault_private','USAGE') or has_schema_privilege('anon','piggievault_private','USAGE');"
    )
    == "f"
)
assert (
    sql(
        "select has_function_privilege('piggievault_rpc_writer','piggievault_private.request_user_id()','EXECUTE');"
    )
    == "t"
)
for role in ("anon", "authenticated", "authenticator"):
    assert (
        sql(
            f"select has_function_privilege('{role}','piggievault_private.request_user_id()','EXECUTE');"
        )
        == "f"
    )
assert (
    sql(
        "select count(*) from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='piggievault_private.request_user_id()'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE';"
    )
    == "0"
)
assert (
    sql(
        "select count(*) from pg_policies where schemaname='public' and tablename in ('pets','photos','pet_reference_photos','photo_pet_predictions') and policyname like 'Users can %' and roles<>'{authenticated}'::name[];"
    )
    == "0"
)
assert (
    sql(
        "select count(*) from pg_policies where policyname like 'RPC writer %' and roles='{piggievault_rpc_writer}'::name[];"
    )
    == "12"
)
assert (
    sql(
        "select count(*) from pg_policies where policyname like 'RPC writer %' and (coalesce(qual,'')||coalesce(with_check,'')) like '%auth.uid()%';"
    )
    == "0"
)
assert (
    sql(
        "select count(*) from pg_proc where pronamespace='public'::regnamespace and proowner='piggievault_rpc_writer'::regrole and pg_get_functiondef(oid) like '%auth.uid()%';"
    )
    == "0"
)
print(
    "PASS: hosted Auth ACLs reproduced; writer has no auth access; private helper and policy targets are minimal",
    flush=True,
)


# PostgREST's current aggregate request.jwt.claims convention.
claim_pet = "20000000-0000-4000-8000-000000000099"
sql(
    f"insert into public.pets(id,user_id,name,sex) values('{claim_pet}','{A}','Claims only','unknown');"
)


def claims_request(statement, user=A):
    claims = json.dumps(
        {"sub": user, "role": "authenticated"}, separators=(",", ":")
    ).replace("'", "''")
    return f"begin;set local role authenticated;select set_config('request.jwt.claims','{claims}',true);{statement}commit;"


def claims_result(statement, user=A):
    return sql(claims_request(statement, user)).splitlines()[-1]


assert (
    claims_result(f"select outcome from public.set_pet_avatar('{claim_pet}',0,null);")
    == "saved"
)
assert (
    claims_result(
        f"select outcome from public.set_pet_avatar('{claim_pet}',0,null);", B
    )
    == "unavailable"
)
denied(
    "set role anon;select outcome from public.set_pet_avatar('"
    + claim_pet
    + "',0,null);"
)
denied("set role authenticated;select piggievault_private.request_user_id();")
denied(
    "set role authenticated;create function public.identity_spoof() returns uuid language sql as $$select gen_random_uuid()$$;"
)
denied(
    "set role authenticated;create function piggievault_private.identity_spoof() returns uuid language sql as $$select gen_random_uuid()$$;"
)
denied(
    "begin;set local role authenticated;select set_config('app.user_id','"
    + A
    + "',true);select outcome from public.set_pet_avatar('"
    + claim_pet
    + "',0,null);commit;",
    "Authentication required",
)
before_claim = sql(f"select to_jsonb(p) from public.pets p where id='{claim_pet}';")
denied(
    'begin;set local role authenticated;select set_config(\'request.jwt.claims\',\'{"sub":"not-a-uuid","role":"authenticated"}\',true);select outcome from public.set_pet_avatar(\''
    + claim_pet
    + "',0,null);commit;",
    "invalid input syntax for type uuid",
)
assert (
    sql(f"select to_jsonb(p) from public.pets p where id='{claim_pet}';")
    == before_claim
)
assert sql("select not rolcanlogin from pg_roles where rolname='authenticated';") == "t"
sql(f"delete from public.pets where id='{claim_pet}';")
print(
    "PASS: aggregate JWT claims owner access, cross-user/anon denial, unrelated-GUC spoof denial, malformed-claim rollback",
    flush=True,
)
