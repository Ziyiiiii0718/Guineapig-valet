begin;
create or replace function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'Assertion failed: %',message; end if;
end $$;
insert into auth.users values ('13000000-0000-4000-8000-000000000001'),('13000000-0000-4000-8000-000000000002');
insert into public.pets(id,user_id,name,sex) values ('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','A','unknown'),('23000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000001','B','unknown'),('23000000-0000-4000-8000-000000000003','13000000-0000-4000-8000-000000000002','C','unknown');
insert into public.photos(id,user_id,storage_path) values ('33000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001/manual.jpg'),('33000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000002/private.jpg');
set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true((select outcome='saved' and revision=1 from public.set_photo_labels('33000000-0000-4000-8000-000000000001',0,array['23000000-0000-4000-8000-000000000001']::uuid[],false,'save')), 'manual save before any AI exists');
select pg_temp.assert_true((select processing_status='pending' and classification_started_at is null and confirmed_pet_ids=array['23000000-0000-4000-8000-000000000001']::uuid[] from public.photo_pet_predictions where photo_id='33000000-0000-4000-8000-000000000001'), 'AI not fabricated by manual labeling');
-- Gallery eligibility is identical to lib/pets/media-queries.ts predicates.
select pg_temp.assert_true((select count(*)=1 from public.photos p join public.photo_pet_predictions r on r.photo_id=p.id and r.user_id=p.user_id where p.user_id=auth.uid() and r.review_status in ('confirmed','corrected') and not r.confirmed_unknown and r.confirmed_pet_ids @> array['23000000-0000-4000-8000-000000000001']::uuid[]), 'manual labels visible in pet gallery without AI');
select pg_temp.assert_true((select outcome='saved' and revision=1 from public.set_photo_labels('33000000-0000-4000-8000-000000000001',0,array['23000000-0000-4000-8000-000000000001']::uuid[],false,'save')), 'lost response retry is idempotent');
select pg_temp.assert_true((select outcome='conflict' from public.set_photo_labels('33000000-0000-4000-8000-000000000001',0,array['23000000-0000-4000-8000-000000000002']::uuid[],false,'save')), 'stale different edit rejected');
select pg_temp.assert_true((select outcome='unavailable' from public.set_photo_labels('33000000-0000-4000-8000-000000000002',0,array['23000000-0000-4000-8000-000000000001']::uuid[],false,'save')), 'foreign photo rejected');
select pg_temp.assert_true((select outcome='unavailable' from public.set_photo_labels('33000000-0000-4000-8000-000000000001',1,array['23000000-0000-4000-8000-000000000003']::uuid[],false,'save')), 'foreign pet rejected');

-- Real SQL equivalent of the existing AI start upsert: no human columns.
insert into public.photo_pet_predictions(photo_id,user_id,prediction_status,prediction_source,processing_status)
 values ('33000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','needs_review','ai','processing')
 on conflict(photo_id) do update set processing_status=excluded.processing_status,prediction_source=excluded.prediction_source;
update public.photos set ai_status='processing' where id='33000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select confirmed_pet_ids=array['23000000-0000-4000-8000-000000000001']::uuid[] and labels_revision=1 from public.photo_pet_predictions where photo_id='33000000-0000-4000-8000-000000000001'), 'AI upsert preserves human labels and revision');
select pg_temp.assert_true((select ai_status='specific_pet' from public.photos where id='33000000-0000-4000-8000-000000000001'), 'stale AI summary cannot override manual identity');
update public.photo_pet_predictions set candidate_pet_ids=array['23000000-0000-4000-8000-000000000002']::uuid[],candidate_scores=array[0.8],candidate_reference_counts=array[2],suggested_pet_ids=array['23000000-0000-4000-8000-000000000002']::uuid[],processing_status='ready_for_review',classification_version='unchanged' where photo_id='33000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select outcome='saved' and revision=2 from public.set_photo_labels('33000000-0000-4000-8000-000000000001',1,array['23000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002']::uuid[],false,'save')), 'multiple pet edit succeeds');
select pg_temp.assert_true((select suggested_pet_ids=array['23000000-0000-4000-8000-000000000002']::uuid[] and candidate_scores=array[0.8]::double precision[] and classification_version='unchanged' from public.photo_pet_predictions where photo_id='33000000-0000-4000-8000-000000000001'), 'machine prediction remains separate');
select pg_temp.assert_true((select outcome='saved' and revision=3 from public.set_photo_labels('33000000-0000-4000-8000-000000000001',2,'{}',true,'save')), 'explicit Unknown succeeds');
select pg_temp.assert_true((select confirmed_unknown and cardinality(confirmed_pet_ids)=0 from public.photo_pet_predictions where photo_id='33000000-0000-4000-8000-000000000001'), 'Unknown does not imply a known pet');
select pg_temp.assert_true((select outcome='saved' and revision=4 from public.set_photo_labels('33000000-0000-4000-8000-000000000001',3,'{}',false,'clear')), 'manual labels removable');
select pg_temp.assert_true((select not confirmed_unknown and cardinality(confirmed_pet_ids)=0 and review_status='pending_review' from public.photo_pet_predictions where photo_id='33000000-0000-4000-8000-000000000001'), 'clear means unlabeled, not Unknown');
update public.photos set ai_status='specific_pet' where id='33000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select ai_status='ready_for_review' from public.photos where id='33000000-0000-4000-8000-000000000001'), 'stale reviewed AI snapshot cannot resurrect cleared labels/status');
select pg_temp.assert_true((select outcome='conflict' from public.set_photo_labels('33000000-0000-4000-8000-000000000001',4,array['23000000-0000-4000-8000-000000000001']::uuid[],false,'confirm')), 'confirm refuses a changed AI suggestion');
select pg_temp.assert_true((select outcome='saved' and revision=5 from public.set_photo_labels('33000000-0000-4000-8000-000000000001',4,array['23000000-0000-4000-8000-000000000002']::uuid[],false,'confirm')), 'confirm displayed current suggestion');

update public.photo_pet_predictions set processing_status='failed',error_category='service_unavailable' where photo_id='33000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select outcome='saved' and revision=6 from public.set_photo_labels('33000000-0000-4000-8000-000000000001',5,array['23000000-0000-4000-8000-000000000001']::uuid[],false,'save')), 'manual save after AI error');
update public.photo_pet_predictions set processing_status='insufficient_references',error_category=null where photo_id='33000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select outcome='saved' and revision=7 from public.set_photo_labels('33000000-0000-4000-8000-000000000001',6,'{}',true,'save')), 'manual save with insufficient references');
update public.photos set ai_status='insufficient_references' where id='33000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select ai_status='unknown' from public.photos where id='33000000-0000-4000-8000-000000000001'), 'late AI failure respects Unknown');

reset role;
create temp table before_labels as select to_jsonb(r) as data from public.photo_pet_predictions r where photo_id='33000000-0000-4000-8000-000000000001';
create function pg_temp.fail_summary() returns trigger language plpgsql as $$ begin raise exception 'Injected summary failure'; end $$;
create trigger test_summary_failure after update on public.photos for each row execute function pg_temp.fail_summary();
set local role authenticated;
do $$ begin
 begin
  perform public.set_photo_labels('33000000-0000-4000-8000-000000000001',7,array['23000000-0000-4000-8000-000000000001']::uuid[],false,'save');
  raise exception 'Expected rollback';
 exception when raise_exception then if SQLERRM <> 'Injected summary failure' then raise; end if; end;
end $$;
reset role;
select pg_temp.assert_true((select to_jsonb(r) from public.photo_pet_predictions r where photo_id='33000000-0000-4000-8000-000000000001')=(select data from before_labels), 'failed summary update rolls back human fields and revision');
drop trigger test_summary_failure on public.photos;

set local role authenticated;
select pg_temp.assert_true((select outcome='saved' from public.set_photo_labels('33000000-0000-4000-8000-000000000001',7,array['23000000-0000-4000-8000-000000000001']::uuid[],false,'save')), 'save before pet deletion');
select * from public.delete_pet_transaction('23000000-0000-4000-8000-000000000001','A');
select pg_temp.assert_true((select cardinality(confirmed_pet_ids)=0 and review_status='pending_review' and labels_revision=9 from public.photo_pet_predictions where photo_id='33000000-0000-4000-8000-000000000001'), '0011 removes labels and advances edit revision');
select pg_temp.assert_true((select outcome='conflict' from public.set_photo_labels('33000000-0000-4000-8000-000000000001',8,array['23000000-0000-4000-8000-000000000002']::uuid[],false,'save')), 'pet deletion invalidates stale forms');
select * from public.begin_photo_deletion('33000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select outcome='unavailable' from public.set_photo_labels('33000000-0000-4000-8000-000000000001',9,array['23000000-0000-4000-8000-000000000002']::uuid[],false,'save')), '0010 deleted photo cannot be labeled again');
rollback;
