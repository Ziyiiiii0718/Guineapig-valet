-- Real PostgreSQL regression tests; Storage bytes/API are mocked separately.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Assertion failed: %', message; end if;
end $$;
insert into auth.users values ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
insert into public.pets(id,user_id,name,sex) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Test pet','unknown');
insert into public.photos(id,user_id,storage_path) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001/2026/11/one.jpg'),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001/2026/11/two.jpg');
insert into public.albums(id,user_id,title,cover_photo_id) values
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Album','30000000-0000-4000-8000-000000000001');
insert into public.album_photos(album_id,photo_id,user_id) values
  ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into public.photo_pet_predictions(photo_id,user_id,prediction_status,prediction_source) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','unknown','ai');
insert into public.pet_reference_photos(pet_id,photo_id,user_id) values
  ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into storage.objects values ('user-photos','10000000-0000-4000-8000-000000000001/2026/11/one.jpg');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*) = 0 from public.begin_photo_deletion('30000000-0000-4000-8000-000000000001')), 'unauthorized deletion returns no record');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true((select count(*) = 2 from public.photos), 'unauthorized request preserved photos');
delete from storage.objects where bucket_id = 'user-photos';
select pg_temp.assert_true((select count(*) = 1 from storage.objects), 'live object cannot be removed directly');

do $$ begin
  begin
    insert into public.photo_deletions(photo_id,user_id,storage_path) values
      ('30000000-0000-4000-8000-000000000009',auth.uid(),auth.uid()::text || '/fake.jpg');
    raise exception 'Forged cleanup job was allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.photos set storage_path = auth.uid()::text || '/changed.jpg';
    raise exception 'Mutable path was allowed';
  exception when check_violation then null; end;
  begin
    insert into public.pet_reference_photos(pet_id,photo_id,user_id,storage_path) values
      ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',auth.uid(),auth.uid()::text || '/2026/11/one.jpg');
    raise exception 'Cross-photo path reference was allowed';
  exception when foreign_key_violation then null; end;
end $$;

-- A later database error must roll back both deletion and outbox creation.
reset role;
create function pg_temp.fail_delete() returns trigger language plpgsql as $$
begin raise exception 'Injected delete failure'; end $$;
create trigger test_delete_failure after delete on public.photos for each row execute function pg_temp.fail_delete();
set local role authenticated;
do $$ begin
  begin
    perform public.begin_photo_deletion('30000000-0000-4000-8000-000000000001');
    raise exception 'Expected injected failure';
  exception when raise_exception then
    if SQLERRM <> 'Injected delete failure' then raise; end if;
  end;
end $$;
select pg_temp.assert_true((select count(*) = 2 from public.photos), 'database failure retains photos');
select pg_temp.assert_true((select count(*) = 0 from public.photo_deletions), 'database failure rolls back job');
select pg_temp.assert_true((select count(*) = 1 from public.album_photos), 'database failure rolls back cascades');
reset role;
drop trigger test_delete_failure on public.photos;

-- Simulate a pre-migration inconsistent legacy reference. Deletion must block.
alter table public.pet_reference_photos disable trigger reference_photo_storage_path;
insert into public.pet_reference_photos(pet_id,photo_id,user_id,storage_path) values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001/2026/11/one.jpg');
alter table public.pet_reference_photos enable trigger reference_photo_storage_path;
set local role authenticated;
do $$ begin
  begin
    perform public.begin_photo_deletion('30000000-0000-4000-8000-000000000001');
    raise exception 'Referenced object was retired';
  exception when foreign_key_violation then null; end;
end $$;
select pg_temp.assert_true((select count(*) = 0 from public.photo_deletions), 'reference conflict leaves no cleanup job');
delete from public.pet_reference_photos where photo_id = '30000000-0000-4000-8000-000000000002';

select pg_temp.assert_true((select count(*) = 1 from public.begin_photo_deletion('30000000-0000-4000-8000-000000000001')), 'successful deletion returns durable job');
select pg_temp.assert_true((select count(*) = 1 from public.photos), 'only targeted photo removed');
select pg_temp.assert_true((select count(*) = 0 from public.album_photos), 'album membership cascades');
select pg_temp.assert_true((select cover_photo_id is null from public.albums), 'album cover cleared');
select pg_temp.assert_true((select count(*) = 0 from public.photo_pet_predictions), 'prediction cascades');
select pg_temp.assert_true((select count(*) = 0 from public.pet_reference_photos), 'pet reference cascades');
select pg_temp.assert_true((select count(*) = 1 from public.pets), 'pet retained');
select pg_temp.assert_true((select count(*) = 1 from storage.objects), 'database transaction leaves bytes intact');
select pg_temp.assert_true((select count(*) = 1 from public.begin_photo_deletion('30000000-0000-4000-8000-000000000001')), 'repeated deletion returns same job');

do $$ begin
  begin
    insert into public.photos(user_id,storage_path) values (auth.uid(),auth.uid()::text || '/2026/11/one.jpg');
    raise exception 'Retired path was reused';
  exception when check_violation then null; end;
  begin
    insert into public.photos(id,user_id,storage_path) values ('30000000-0000-4000-8000-000000000001',auth.uid(),auth.uid()::text || '/new.jpg');
    raise exception 'Retired ID was reused';
  exception when check_violation then null; end;
end $$;
delete from storage.objects where bucket_id = 'user-photos';
select pg_temp.assert_true((select count(*) = 0 from storage.objects), 'retired object can be removed');
update public.photo_deletions set storage_deleted_at = now();
select pg_temp.assert_true((select storage_deleted_at is not null from public.begin_photo_deletion('30000000-0000-4000-8000-000000000001')), 'completed retry remains completed');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*) = 0 from public.photo_deletions), 'other owner cannot read job');
update public.photo_deletions set storage_deleted_at = now();
select pg_temp.assert_true((select count(*) = 0 from public.begin_photo_deletion('30000000-0000-4000-8000-000000000001')), 'other owner cannot retry job');
reset role;
delete from auth.users where id = '10000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select count(*) = 0 from public.photos), 'account cascade still works');
select pg_temp.assert_true((select count(*) = 2 from public.photo_deletions), 'account cascade retains cleanup records');
rollback;
