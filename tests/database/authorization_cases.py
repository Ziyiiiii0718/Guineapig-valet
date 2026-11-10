# Synthetic final-schema cases loaded by run-authorization.py only.
assert (
    sql(
        "select count(*) from pg_auth_members where (roleid='piggievault_rpc_writer'::regrole and (member<>'postgres'::regrole or not admin_option or inherit_option or set_option)) or member='piggievault_rpc_writer'::regrole;"
    )
    == "0"
)
assert (
    sql(
        "select has_table_privilege('piggievault_rpc_writer','storage.objects','INSERT,UPDATE,DELETE');"
    )
    == "f"
)
assert (
    sql(
        "select rolsuper or rolbypassrls or rolcanlogin or rolcreatedb or rolcreaterole from pg_roles where rolname='piggievault_rpc_writer';"
    )
    == "f"
)
assert (
    sql("select has_schema_privilege('piggievault_rpc_writer','public','CREATE');")
    == "f"
)
assert (
    sql(
        "select count(*) from pg_class where relowner='piggievault_rpc_writer'::regrole;"
    )
    == "0"
)
assert (
    sql(
        "select count(*) from pg_proc where pronamespace='public'::regnamespace and prosecdef and proowner='piggievault_rpc_writer'::regrole and proconfig @> array['search_path=\"\"'];"
    )
    == "6"
)
denied("set session authorization authenticated;set role piggievault_rpc_writer;")
denied(
    "set session authorization authenticator;set role authenticated;set role piggievault_rpc_writer;"
)
# Direct SQL role escalation not available; caller-settable custom settings do not help.
for statement in [
    f"update public.photo_pet_predictions set processing_token='{TOKEN1}' where photo_id='{PHOTO}';",
    f"update public.photo_pet_predictions set confirmed_unknown=true where photo_id='{PHOTO}';",
    f"insert into public.photo_pet_predictions(photo_id,user_id,prediction_status,prediction_source) values('{PHOTO}','{A}','unknown','manual');",
    f"delete from public.photo_pet_predictions where photo_id='{PHOTO}';",
    f"update public.photos set ai_status='failed' where id='{PHOTO}';",
    f"update public.pets set profile_photo_path='{A}/forged.png' where id='{PET}';",
    f"update public.pets set avatar_revision=0 where id='{PET}';",
    f"delete from public.pets where id='{PET}';",
    "update public.photo_deletions set storage_deleted_at=now();",
    "update public.photo_deletions set storage_path='forged';",
    "delete from public.photo_deletions;",
    f"insert into public.photo_deletions(photo_id,user_id,storage_path) values(gen_random_uuid(),'{A}','{A}/fake.png');",
    "select * from public.profiles;",
]:
    denied(request("select set_config('app.trusted_rpc','true',true);" + statement))
denied(
    request(
        f"insert into public.photos(user_id,storage_path,file_name,file_size,ai_status) values('{A}','{A}/fake-status.png','synthetic.png',1,'specific_pet');"
    ),
    "New photos must start uploaded",
)
print(
    "PASS: direct protected INSERT/UPDATE/DELETE and manufactured initial AI status denied",
    flush=True,
)
# Real application-shaped direct mutations, ordinary fields only.
newpet = result(
    f"insert into public.pets(user_id,name,sex,birth_date,favorite_foods,disliked_foods,personality_notes,general_notes) values('{A}','New metadata','unknown',null,null,null,null,null) returning id;"
)
auth(
    f"update public.pets set name='New metadata edited',updated_at=now() where id='{newpet}';"
)
photo2 = result(
    f"insert into public.photos(user_id,storage_path,file_name,file_size,width,height,mime_type,taken_at,uploaded_at,ai_status) values('{A}','{A}/upload.png','synthetic.png',1024,1,1,'image/png',null,now(),'uploaded') returning id;"
)
auth(
    f"update public.photos set display_name='Rename',updated_at=now() where id='{photo2}';"
)
album = result(
    f"insert into public.albums(user_id,title,description) values('{A}','Synthetic album',null) returning id;"
)
auth(
    f"insert into public.album_photos(album_id,photo_id,user_id,created_at) values('{album}','{photo2}','{A}',now()) on conflict(album_id,photo_id) do nothing;insert into public.album_photos(album_id,photo_id,user_id) values('{album}','{photo2}','{A}') on conflict(album_id,photo_id) do nothing;"
)
auth(
    f"update public.albums set title='Edited',description='Synthetic',updated_at=now() where id='{album}';"
)
reference = result(
    f"insert into public.pet_reference_photos(user_id,pet_id,photo_id,embedding_status) values('{A}','{newpet}','{photo2}','pending') returning id;"
)
auth(
    f"update public.pet_reference_photos set embedding_status='processing',embedding_error_category=null,updated_at=now() where id='{reference}';update public.pet_reference_photos set embedding=null,embedding_dimension=null,embedding_error_category='service_unavailable',embedding_model=null,embedding_status='failed',embedding_version=null,updated_at=now() where id='{reference}';"
)
auth(
    f"update public.pet_reference_photos set embedding=array_fill(0::real,array[512])::vector,embedding_dimension=512,embedding_model='synthetic-test',embedding_version='fixture',embedding_status='ready',embedding_error_category=null,updated_at=now() where id='{reference}';"
)
auth(
    f"insert into public.weight_records(user_id,pet_id,weight_grams,recorded_at) values('{A}','{newpet}',900,current_date);update public.weight_records set weight_grams=950,recorded_at=current_date,updated_at=now() where pet_id='{newpet}';insert into public.health_records(user_id,pet_id,record_date,record_type,title,notes) values('{A}','{newpet}',current_date,'general','Synthetic',null);update public.health_records set title='Edited',updated_at=now() where pet_id='{newpet}';"
)
for t in [
    "pets",
    "photos",
    "albums",
    "album_photos",
    "pet_reference_photos",
    "weight_records",
    "health_records",
]:
    assert result(f"select count(*) from public.{t} where user_id='{A}';", B) == "0"
    denied(f"set role anon;select * from public.{t};")
denied(
    request(
        f"insert into public.pets(user_id,name,sex) values('{A}','Forged','unknown');",
        B,
    ),
    "row-level security",
)
auth(f"update public.photos set display_name='forged' where id='{PHOTO}';", B)
assert (
    result(
        f"select coalesce(display_name,'unchanged') from public.photos where id='{PHOTO}';"
    )
    == "unchanged"
)
print(
    "PASS: application-shaped CRUD, reference embedding errors, albums, health/weights, cross-user/anon isolation",
    flush=True,
)


# Actual elevated RPCs still respect ownership, even if called as writer in harness.
def labels(rev, unknown=True, ids="'{}'"):
    return f"select outcome from public.set_photo_labels('{PHOTO}',{rev},{ids}::uuid[],{str(unknown).lower()},'save');"


assert result(labels(0)) == "saved"
assert result(labels(0)) == "saved"
assert result(labels(0, False, f"array['{PET}']")) == "conflict"
assert result(labels(1, False, f"array['{PET}']")) == "saved"
assert (
    result(f"select ai_status from public.photos where id='{PHOTO}';") == "specific_pet"
)
assert (
    result(
        f"select count(*) from public.photos p join public.photo_pet_predictions r on r.photo_id=p.id where '{PET}'=any(r.confirmed_pet_ids) and r.review_status in('confirmed','corrected');"
    )
    == "1"
)
assert result(labels(2), B) == "unavailable"
for call in [
    labels(2),
    f"select public.start_photo_classification('{PHOTO}','{TOKEN1}');",
    f"select public.finish_photo_classification('{PHOTO}','{TOKEN1}','failed','service_unavailable','{{}}');",
    f"select * from public.set_pet_avatar('{PET}',0,null);",
    f"select * from public.delete_pet_transaction('{PET}','Hardening');",
    f"select * from public.begin_photo_deletion('{PHOTO}');",
    f"select public.acknowledge_photo_deletion('{PHOTO}');",
]:
    denied("set role anon;" + call)
    denied("set role authenticated;" + call, "Authentication required")
assert (
    json.loads(
        result(f"select public.start_photo_classification('{PHOTO}','{TOKEN1}');", B)
    )["outcome"]
    == "unavailable"
)
assert (
    json.loads(
        result(
            f"select public.finish_photo_classification('{PHOTO}','{TOKEN1}','failed','service_unavailable','{{}}');",
            B,
        )
    )["outcome"]
    == "unavailable"
)
assert (
    result(f"select outcome from public.set_pet_avatar('{PET}',0,null);", B)
    == "unavailable"
)
assert (
    result(
        f"select outcome from public.delete_pet_transaction('{PET}','Hardening');", B
    )
    == "absent"
)
assert result(f"select count(*) from public.begin_photo_deletion('{PHOTO}');", B) == "0"
assert (
    result(f"select public.acknowledge_photo_deletion('{PHOTO}');", B) == "unavailable"
)
# RLS also applies to writer: inspect as the non-owning user, under that role.
assert (
    sql(
        f"begin;set local role piggievault_rpc_writer;select set_config('request.jwt.claim.sub','{B}',true);select count(*) from public.photos where id='{PHOTO}';rollback;"
    ).splitlines()[-1]
    == "0"
)
# Temp objects cannot hijack qualified SQL in definer functions.
assert (
    result(f"create temporary table photo_pet_predictions(dummy text);{labels(2)}")
    == "saved"
)
print(
    "PASS: manual revision conflicts/idempotence, gallery visibility, six original RPCs plus acknowledgment cross-user/anon/auth checks, writer RLS and search-path shadowing",
    flush=True,
)
# Return manual state to unreviewed for machine concurrency tests.
assert (
    result(
        f"select outcome from public.set_photo_labels('{PHOTO}',3,'{{}}',false,'clear');"
    )
    == "saved"
)
for tok in [TOKEN1, TOKEN1, TOKEN2]:
    out = json.loads(
        result(f"select public.start_photo_classification('{PHOTO}','{tok}');")
    )["outcome"]
    assert out in ("started", "duplicate")
assert (
    json.loads(
        result(
            f"select public.finish_photo_classification('{PHOTO}','{TOKEN2}','ready_for_review',null,'{{\"suggested_unknown\":true}}');"
        )
    )["outcome"]
    == "saved"
)
assert (
    json.loads(
        result(
            f"select public.finish_photo_classification('{PHOTO}','{TOKEN1}','failed','service_unavailable','{{}}');"
        )
    )["outcome"]
    == "superseded"
)
assert (
    result(
        f"select p.ai_status=r.processing_status from public.photos p join public.photo_pet_predictions r on r.photo_id=p.id where p.id='{PHOTO}';"
    )
    == "t"
)
# Avatar optimistic concurrency and unknown-path rejection.
a = f"{A}/{PET}/{TOKEN1}.png"
b = f"{A}/{PET}/{TOKEN2}.png"
assert result(f"select outcome from public.set_pet_avatar('{PET}',0,'{a}');") == "saved"
assert result(f"select outcome from public.set_pet_avatar('{PET}',0,'{a}');") == "saved"
assert (
    result(f"select outcome from public.set_pet_avatar('{PET}',0,'{b}');") == "conflict"
)
assert result(f"select outcome from public.set_pet_avatar('{PET}',1,null);") == "saved"
denied(
    request(
        f"select * from public.set_pet_avatar('{PET}',2,'{B}/{PET}/{TOKEN1}.png');"
    ),
    "Invalid avatar path",
)
print(
    "PASS: machine stale-token rejection/status consistency and avatar stale/idempotent/removal checks",
    flush=True,
)
# Inject database failure after protected mutation: whole RPC must roll back.
sql(
    "create function public.test_fail_summary() returns trigger language plpgsql as $$begin raise exception 'injected failure'; end$$;create trigger test_fail_summary before update of ai_status on public.photos for each row execute function public.test_fail_summary();"
)
before = sql(
    f"select to_jsonb(r) from public.photo_pet_predictions r where photo_id='{PHOTO}';"
)
denied(
    request(f"select public.start_photo_classification('{PHOTO}',gen_random_uuid());"),
    "injected failure",
)
assert before == sql(
    f"select to_jsonb(r) from public.photo_pet_predictions r where photo_id='{PHOTO}';"
)
sql(
    "drop trigger test_fail_summary on public.photos;drop function public.test_fail_summary();"
)
print(
    "PASS: privileged classification RPC rollback on partial database failure",
    flush=True,
)
# Outbox acknowledgments must inspect Storage; RPC refuses false completion.
cleanup = photo2
path = f"{A}/upload.png"
auth(f"insert into storage.objects(bucket_id,name) values('user-photos','{path}');")
auth(f"delete from storage.objects where bucket_id='user-photos' and name='{path}';")
assert result(f"select count(*) from storage.objects where name='{path}';") == "1"
assert result(f"select count(*) from public.begin_photo_deletion('{cleanup}');") == "1"
assert (
    result(f"select public.acknowledge_photo_deletion('{cleanup}');")
    == "storage_present"
)
denied(
    request(
        f"update public.photo_deletions set storage_deleted_at=now() where photo_id='{cleanup}';"
    )
)
auth(f"delete from storage.objects where bucket_id='user-photos' and name='{path}';")
assert (
    result(f"select public.acknowledge_photo_deletion('{cleanup}');") == "acknowledged"
)
assert (
    result(f"select public.acknowledge_photo_deletion('{cleanup}');") == "acknowledged"
)
denied(
    request(
        f"insert into storage.objects(bucket_id,name) values('user-photos','{path}');"
    ),
    "row-level security",
)
denied(
    request(
        f"insert into public.photos(user_id,storage_path,file_name,file_size,ai_status) values('{A}','{path}','synthetic.png',1,'uploaded');"
    ),
    "This photo has been deleted",
)
auth(
    f"insert into storage.objects(bucket_id,name) values('user-photos','{A}/rename-attempt.png');"
)
denied(
    request(
        f"update storage.objects set name='{path}' where name='{A}/rename-attempt.png';"
    ),
    "row-level security",
)
assert (
    result(f"select public.acknowledge_photo_deletion('{cleanup}');", B)
    == "unavailable"
)
print(
    "PASS: truthful/idempotent cleanup acknowledgment, no direct timestamps, live-object safety, retired path insert/rename/resurrection denied",
    flush=True,
)
# Private bucket ownership remains; helper exposes no other user's tombstones.
assert (
    result(f"select public.photo_path_accepts_upload('{A}/unrelated.png');", B) == "f"
)
assert (
    result(f"select count(*) from storage.objects where name like '{A}/%';", B) == "0"
)
denied(
    request(
        f"insert into storage.objects(bucket_id,name) values('user-photos','{A}/foreign.png');",
        B,
    ),
    "row-level security",
)
# Direct metadata cleanup still works; pet deletion must use guarded RPC.
auth(
    f"delete from public.albums where id='{album}';delete from public.weight_records where pet_id='{newpet}';delete from public.health_records where pet_id='{newpet}';"
)
assert (
    result(
        f"select outcome from public.delete_pet_transaction('{newpet}','New metadata edited');"
    )
    == "deleted"
)
assert (
    result(
        f"select outcome from public.delete_pet_transaction('{newpet}','New metadata edited');"
    )
    == "absent"
)
print(
    "PASS: transactional pet deletion and repeat, shared photo retention and ordinary metadata cleanup",
    flush=True,
)
# Signed-upload Storage implementations can write with an elevated service role
# after token issuance. Simulate this trusted-service boundary explicitly.
sql(f"insert into storage.objects(bucket_id,name) values('user-photos','{path}');")
assert (
    result(f"select public.acknowledge_photo_deletion('{cleanup}');")
    == "storage_present"
)
assert (
    result(
        f"select storage_deleted_at is not null from public.photo_deletions where photo_id='{cleanup}';"
    )
    == "t"
)
auth(f"delete from storage.objects where bucket_id='user-photos' and name='{path}';")
assert (
    result(f"select public.acknowledge_photo_deletion('{cleanup}');") == "acknowledged"
)
print(
    "PASS with residual: elevated signed-upload replay can recreate metadata; acknowledgment rechecks instead of trusting timestamp. App must not skip retries based on timestamp.",
    flush=True,
)
