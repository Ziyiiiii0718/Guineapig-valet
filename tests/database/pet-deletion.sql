-- Run only through the disposable PostgreSQL test runner.
begin;
create or replace function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Assertion failed: %', message; end if;
end $$;
insert into auth.users values ('11000000-0000-4000-8000-000000000001'), ('11000000-0000-4000-8000-000000000002');
insert into public.pets(id,user_id,name,sex,profile_photo_path) values
 ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Piggie','unknown','11000000-0000-4000-8000-000000000001/21000000-0000-4000-8000-000000000001/avatar.jpg'),
 ('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','Buddy','unknown',null),
 ('21000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000002','Other','unknown',null);
insert into public.photos(id,user_id,storage_path,ai_status) values
 ('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001/one.jpg','specific_pet'),
 ('31000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001/two.jpg','specific_pet'),
 ('31000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001/three.jpg','unknown'),
 ('31000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001/four.jpg','ready_for_review'),
 ('31000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002/five.jpg','ready_for_review');
insert into public.photo_pet_predictions(id,photo_id,user_id,pet_id,prediction_status,prediction_source,
 candidate_pet_ids,candidate_scores,candidate_reference_counts,suggested_pet_ids,
 confirmed_pet_ids,confirmed_unknown,review_status,confirmed_by_user,reviewed_at,
 processing_status,model_version) values
 ('51000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','specific_pet','ai',array['21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002']::uuid[],array[0.9,0.8],array[3,2],array['21000000-0000-4000-8000-000000000001']::uuid[],array['21000000-0000-4000-8000-000000000001']::uuid[],false,'confirmed',true,now(),'ready_for_review','unchanged-model'),
 ('51000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','specific_pet','ai',array['21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002']::uuid[],array[0.9,0.8],array[3,2],array['21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002']::uuid[],array['21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002']::uuid[],false,'corrected',true,now(),'ready_for_review','unchanged-model'),
 ('51000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','specific_pet','ai',array['21000000-0000-4000-8000-000000000001']::uuid[],array[0.9],array[3],array['21000000-0000-4000-8000-000000000001']::uuid[],'{}',true,'corrected',true,now(),'ready_for_review','unchanged-model'),
 ('51000000-0000-4000-8000-000000000004','31000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002','specific_pet','ai',array['21000000-0000-4000-8000-000000000002']::uuid[],array[0.8],array[2],array['21000000-0000-4000-8000-000000000002']::uuid[],'{}',false,'pending_review',false,null,'ready_for_review','unchanged-model'),
 ('51000000-0000-4000-8000-000000000005','31000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000003','specific_pet','ai',array['21000000-0000-4000-8000-000000000003']::uuid[],array[0.7],array[2],array['21000000-0000-4000-8000-000000000003']::uuid[],'{}',false,'pending_review',false,null,'ready_for_review','unchanged-model');
insert into public.pet_reference_photos(pet_id,photo_id,user_id) values
 ('21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001'), ('21000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001');
insert into public.weight_records(pet_id,user_id,weight_grams,recorded_at) values
 ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',1000,current_date), ('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001',900,current_date);
insert into public.health_records(pet_id,user_id,record_date,title,record_type) values
 ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',current_date,'Test','general'), ('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001',current_date,'Test','general');
insert into public.albums(id,user_id,title,cover_photo_id) values
 ('41000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Album','31000000-0000-4000-8000-000000000001');
insert into public.album_photos(album_id,photo_id,user_id) values ('41000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001');
insert into storage.objects values ('user-photos','11000000-0000-4000-8000-000000000001/one.jpg'), ('pet-avatars','11000000-0000-4000-8000-000000000001/21000000-0000-4000-8000-000000000001/avatar.jpg');

-- Capture full row contents, including timestamps and classification metadata.
create function pg_temp.snapshot() returns jsonb language sql as $$
 select jsonb_build_object(
 'pets',(select jsonb_agg(to_jsonb(t) order by id) from public.pets t),
 'photos',(select jsonb_agg(to_jsonb(t) order by id) from public.photos t),
 'predictions',(select jsonb_agg(to_jsonb(t) order by id) from public.photo_pet_predictions t),
 'references',(select jsonb_agg(to_jsonb(t) order by id) from public.pet_reference_photos t),
 'weights',(select jsonb_agg(to_jsonb(t) order by id) from public.weight_records t),
 'health',(select jsonb_agg(to_jsonb(t) order by id) from public.health_records t),
 'albums',(select jsonb_agg(to_jsonb(t) order by id) from public.albums t),
 'memberships',(select jsonb_agg(to_jsonb(t) order by photo_id) from public.album_photos t))
$$;
create temp table before_delete as select pg_temp.snapshot() as data;

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select outcome = 'absent' and avatar_path is null from public.delete_pet_transaction('21000000-0000-4000-8000-000000000001','Piggie')), 'unauthorized deletion reveals no data');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true((select outcome = 'confirmation_required' from public.delete_pet_transaction('21000000-0000-4000-8000-000000000001','wrong')), 'wrong confirmation rejected');
reset role;
select pg_temp.assert_true(pg_temp.snapshot() = (select data from before_delete), 'rejected requests changed nothing');

-- Fail the second prediction update, after the first has already changed.
create function pg_temp.fail_prediction() returns trigger language plpgsql as $$ begin
 if new.id = '51000000-0000-4000-8000-000000000002'::uuid then raise exception 'Injected prediction failure'; end if;
 return new;
end $$;
create trigger test_prediction_failure after update on public.photo_pet_predictions
 for each row execute function pg_temp.fail_prediction();
set local role authenticated;
do $$ begin
 begin
  perform public.delete_pet_transaction('21000000-0000-4000-8000-000000000001','Piggie');
  raise exception 'Expected prediction failure';
 exception when raise_exception then
  if SQLERRM <> 'Injected prediction failure' then raise; end if;
 end;
end $$;
reset role;
select pg_temp.assert_true(pg_temp.snapshot() = (select data from before_delete), 'midway prediction failure rolls back everything');
drop trigger test_prediction_failure on public.photo_pet_predictions;

-- Also fail after the pet DELETE and its earlier label changes/cascades.
create function pg_temp.fail_pet() returns trigger language plpgsql as $$ begin
 raise exception 'Injected pet deletion failure';
end $$;
create trigger test_pet_failure after delete on public.pets for each row execute function pg_temp.fail_pet();
set local role authenticated;
do $$ begin
 begin
  perform public.delete_pet_transaction('21000000-0000-4000-8000-000000000001','Piggie');
  raise exception 'Expected pet failure';
 exception when raise_exception then
  if SQLERRM <> 'Injected pet deletion failure' then raise; end if;
 end;
end $$;
reset role;
select pg_temp.assert_true(pg_temp.snapshot() = (select data from before_delete), 'late pet failure rolls back labels and relationships');
drop trigger test_pet_failure on public.pets;

set local role authenticated;
select pg_temp.assert_true((select outcome = 'deleted' and avatar_path = '11000000-0000-4000-8000-000000000001/21000000-0000-4000-8000-000000000001/avatar.jpg' from public.delete_pet_transaction('21000000-0000-4000-8000-000000000001','Piggie')), 'owned delete succeeds');
select pg_temp.assert_true((select count(*) = 1 from public.pets), 'only target pet deleted');
select pg_temp.assert_true((select count(*) = 4 from public.photos), 'shared photo rows preserved');
select pg_temp.assert_true((select count(*) = 1 from public.pet_reference_photos), 'other pet reference to shared photo retained');
select pg_temp.assert_true((select count(*) = 1 from public.weight_records), 'only target weight cascades');
select pg_temp.assert_true((select count(*) = 1 from public.health_records), 'only target health cascades');
select pg_temp.assert_true((select count(*) = 1 from public.album_photos), 'album membership preserved');
select pg_temp.assert_true((select cover_photo_id = '31000000-0000-4000-8000-000000000001'::uuid from public.albums), 'album cover preserved');
select pg_temp.assert_true((select count(*) = 0 from public.photo_deletions), 'migration 0010 receives no photo cleanup jobs');
select pg_temp.assert_true((select count(*) = 2 from storage.objects), 'database never touches photo or avatar Storage');
select pg_temp.assert_true((select candidate_pet_ids = array['21000000-0000-4000-8000-000000000002']::uuid[] and candidate_scores = array[0.8]::double precision[]
 and candidate_reference_counts = array[2] and suggested_pet_ids = '{}'::uuid[] and suggested_unknown
 and confirmed_pet_ids = '{}'::uuid[] and not confirmed_by_user and review_status = 'pending_review'
 and reviewed_at is null and pet_id is null and model_version = 'unchanged-model' and processing_status = 'ready_for_review'
 from public.photo_pet_predictions where id = '51000000-0000-4000-8000-000000000001'), 'sole confirmed identity removed; arrays aligned and model metadata preserved');
select pg_temp.assert_true((select ai_status = 'needs_review' from public.photos where id = '31000000-0000-4000-8000-000000000001'), 'photo no longer advertises removed confirmation');
select pg_temp.assert_true((select confirmed_pet_ids = array['21000000-0000-4000-8000-000000000002']::uuid[] and suggested_pet_ids = array['21000000-0000-4000-8000-000000000002']::uuid[]
 and not suggested_unknown and confirmed_by_user and review_status = 'corrected' and reviewed_at is not null
 from public.photo_pet_predictions where id = '51000000-0000-4000-8000-000000000002'), 'remaining multi-pet confirmation preserved');
select pg_temp.assert_true((select confirmed_unknown and confirmed_by_user and review_status = 'corrected'
 from public.photo_pet_predictions where id = '51000000-0000-4000-8000-000000000003'), 'human-confirmed unknown preserved');
select pg_temp.assert_true(not exists(select 1 from public.photo_pet_predictions where
 pet_id = '21000000-0000-4000-8000-000000000001'::uuid or '21000000-0000-4000-8000-000000000001'::uuid = any(candidate_pet_ids || suggested_pet_ids || confirmed_pet_ids)), 'no dangling labels');
select pg_temp.assert_true((select outcome = 'absent' and avatar_path is null from public.delete_pet_transaction('21000000-0000-4000-8000-000000000001','Piggie')), 'repeated delete is a no-op');

do $$ begin
 begin
  update public.photo_pet_predictions set confirmed_pet_ids = array['21000000-0000-4000-8000-000000000001']::uuid[], confirmed_unknown = false,
   review_status = 'confirmed' where id = '51000000-0000-4000-8000-000000000001';
  raise exception 'Late label write was accepted';
 exception when foreign_key_violation then null; end;
 begin
  update public.photo_pet_predictions set confirmed_pet_ids = array['21000000-0000-4000-8000-000000000003']::uuid[], confirmed_unknown = false,
   review_status = 'confirmed' where id = '51000000-0000-4000-8000-000000000001';
  raise exception 'Cross-owner label write was accepted';
 exception when foreign_key_violation then null; end;
end $$;
reset role;
select pg_temp.assert_true((select to_jsonb(t) from public.photo_pet_predictions t where id = '51000000-0000-4000-8000-000000000004') =
 (select p from before_delete, jsonb_array_elements(data->'predictions') p where p->>'id' = '51000000-0000-4000-8000-000000000004'), 'unaffected prediction byte-for-byte unchanged');
select pg_temp.assert_true((select to_jsonb(t) from public.photo_pet_predictions t where id = '51000000-0000-4000-8000-000000000005') =
 (select p from before_delete, jsonb_array_elements(data->'predictions') p where p->>'id' = '51000000-0000-4000-8000-000000000005'), 'other owner unchanged');

-- The trigger also protects direct deletes using existing RLS policies.
set local role authenticated;
delete from public.pets where id = '21000000-0000-4000-8000-000000000002';
select pg_temp.assert_true(not exists(select 1 from public.photo_pet_predictions where '21000000-0000-4000-8000-000000000002'::uuid = any(candidate_pet_ids || suggested_pet_ids || confirmed_pet_ids)), 'direct delete also cleans labels');
rollback;
