-- REVIEW ONLY: candidate 0015-v4. Hosted Auth-schema-independent RPC identity.
-- Requires explicit approval, original 0014 and controlled transaction executor.
-- Includes the same baseline grants for clean replay and existing installations.
begin;
-- Trusted administrator provisioning, in the same transaction as all grants.
-- Local-only reviewed successor to v2. No remote authorization.
do $$ begin
 if current_user <> 'postgres' or session_user <> 'postgres' then
  raise exception 'Run only as the trusted postgres migration administrator';
 end if;
 if not exists(select 1 from pg_roles where rolname='piggievault_rpc_writer') then
  create role piggievault_rpc_writer nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
 end if;
 if exists(select 1 from pg_roles where rolname='piggievault_rpc_writer' and
  (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)) then
  raise exception 'Unsafe RPC writer role';
 end if;
 -- PG17 creates this administrative grant automatically. It grants no runtime
 -- INHERIT/SET capability. No API user or arbitrary role membership is accepted.
 if exists(select 1 from pg_auth_members m where roleid='piggievault_rpc_writer'::regrole
  and (member <> 'postgres'::regrole or not admin_option or inherit_option or set_option)) then
  raise exception 'Unexpected RPC writer membership';
 end if;
 if (select count(*) from pg_auth_members where roleid='piggievault_rpc_writer'::regrole) <> 1 then
  raise exception 'Expected exactly the PG17 administrator membership';
 end if;
end $$;
-- The writer has no role memberships; explicit object rights only.
-- Fail on unexpected memberships instead of attempting unauthorized role administration.
alter role piggievault_rpc_writer noinherit;
do $$ begin
 if exists(select 1 from pg_auth_members where member='piggievault_rpc_writer'::regrole) then
  raise exception 'RPC writer must not inherit or SET ROLE to another role';
 end if;
end $$;
grant piggievault_rpc_writer to postgres with inherit true, set true;
grant usage on schema public to authenticated;
-- No persistent schema CREATE, anonymous grants, default privilege changes or service-role grants.
revoke all privileges on table public.profiles from public, anon, authenticated;
revoke all privileges on table public.pets from public, anon, authenticated;
revoke all privileges on table public.photos from public, anon, authenticated;
revoke all privileges on table public.pet_reference_photos from public, anon, authenticated;
revoke all privileges on table public.photo_pet_predictions from public, anon, authenticated;
revoke all privileges on table public.albums from public, anon, authenticated;
revoke all privileges on table public.album_photos from public, anon, authenticated;
revoke all privileges on table public.weight_records from public, anon, authenticated;
revoke all privileges on table public.health_records from public, anon, authenticated;
-- Remove residual column-level grants too; table-level REVOKE alone does not.
do $$
declare col record;
begin
  for col in select table_name, column_name from information_schema.columns
    where table_schema = 'public' and table_name in (
      'profiles','pets','photos','pet_reference_photos','photo_pet_predictions',
      'albums','album_photos','weight_records','health_records')
  loop
    execute format('revoke all privileges (%I) on table public.%I from public, anon, authenticated', col.column_name, col.table_name);
  end loop;
end $$;
grant select, insert, update, delete on table public.pets to authenticated;
grant select, insert, update, delete on table public.photos to authenticated;
grant select, insert, update, delete on table public.pet_reference_photos to authenticated;
grant select, insert, update on table public.photo_pet_predictions to authenticated;
grant select, insert, update, delete on table public.albums to authenticated;
grant select, insert, delete on table public.album_photos to authenticated;
grant select, insert, update, delete on table public.weight_records to authenticated;
grant select, insert, update, delete on table public.health_records to authenticated;
-- Preserve the outbox's column-restricted completion API.
revoke all privileges on public.photo_deletions from public, anon, authenticated;
do $$ declare col record; begin
 for col in select column_name from information_schema.columns
  where table_schema='public' and table_name='photo_deletions' loop
  execute format('revoke all privileges (%I) on public.photo_deletions from public, anon, authenticated',col.column_name);
 end loop;
end $$;
grant select on public.photo_deletions to authenticated;
grant update (storage_deleted_at) on public.photo_deletions to authenticated;
revoke all privileges on function public.begin_photo_deletion(uuid) from public, anon, authenticated;
grant execute on function public.begin_photo_deletion(uuid) to authenticated;
revoke all privileges on function public.delete_pet_transaction(uuid,text) from public, anon, authenticated;
grant execute on function public.delete_pet_transaction(uuid,text) to authenticated;
revoke all privileges on function public.set_photo_labels(uuid,integer,uuid[],boolean,text) from public, anon, authenticated;
grant execute on function public.set_photo_labels(uuid,integer,uuid[],boolean,text) to authenticated;
revoke all privileges on function public.set_pet_avatar(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.set_pet_avatar(uuid,integer,text) to authenticated;
revoke all privileges on function public.start_photo_classification(uuid,uuid) from public, anon, authenticated;
grant execute on function public.start_photo_classification(uuid,uuid) to authenticated;
revoke all privileges on function public.finish_photo_classification(uuid,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.finish_photo_classification(uuid,uuid,text,text,jsonb) to authenticated;
revoke all privileges on function public.guard_photo_storage_lifecycle() from public, anon, authenticated;
revoke all privileges on function public.guard_reference_photo_storage_path() from public, anon, authenticated;
revoke all privileges on function public.guard_prediction_pet_references() from public, anon, authenticated;
revoke all privileges on function public.remove_deleted_pet_labels() from public, anon, authenticated;
revoke all privileges on function public.track_photo_label_revision() from public, anon, authenticated;
revoke all privileges on function public.preserve_manual_photo_status() from public, anon, authenticated;
revoke all privileges on function public.track_pet_avatar_revision() from public, anon, authenticated;

grant usage on schema public, storage to piggievault_rpc_writer;

create schema if not exists piggievault_private authorization postgres;
revoke all on schema piggievault_private from public, anon, authenticated;
grant usage on schema piggievault_private to piggievault_rpc_writer;
create or replace function piggievault_private.request_user_id()
returns uuid language sql stable security invoker set search_path='' as $$
 select coalesce(
   nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),''),
   nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb->>'sub'
 )::uuid
$$;
revoke all on function piggievault_private.request_user_id() from public,anon,authenticated;
grant execute on function piggievault_private.request_user_id() to piggievault_rpc_writer;

alter policy "Users can read own pets" on public.pets to authenticated;
alter policy "Users can insert own pets" on public.pets to authenticated;
alter policy "Users can update own pets" on public.pets to authenticated;
alter policy "Users can delete own pets" on public.pets to authenticated;
alter policy "Users can read own photos" on public.photos to authenticated;
alter policy "Users can insert own photos" on public.photos to authenticated;
alter policy "Users can update own photos" on public.photos to authenticated;
alter policy "Users can delete own photos" on public.photos to authenticated;
alter policy "Users can read own reference photos" on public.pet_reference_photos to authenticated;
alter policy "Users can insert own reference photos" on public.pet_reference_photos to authenticated;
alter policy "Users can update own reference photos" on public.pet_reference_photos to authenticated;
alter policy "Users can delete own reference photos" on public.pet_reference_photos to authenticated;
alter policy "Users can read own predictions" on public.photo_pet_predictions to authenticated;
alter policy "Users can insert own predictions" on public.photo_pet_predictions to authenticated;
alter policy "Users can update own predictions" on public.photo_pet_predictions to authenticated;
alter policy "Users can delete own predictions" on public.photo_pet_predictions to authenticated;

drop policy if exists "RPC writer reads own pets" on public.pets;
create policy "RPC writer reads own pets" on public.pets
 for select to piggievault_rpc_writer
 using(user_id=piggievault_private.request_user_id());
drop policy if exists "RPC writer updates own pets" on public.pets;
create policy "RPC writer updates own pets" on public.pets
 for update to piggievault_rpc_writer
 using(user_id=piggievault_private.request_user_id())
 with check(user_id=piggievault_private.request_user_id());
drop policy if exists "RPC writer deletes own pets" on public.pets;
create policy "RPC writer deletes own pets" on public.pets
 for delete to piggievault_rpc_writer
 using(user_id=piggievault_private.request_user_id());
drop policy if exists "RPC writer reads own photos" on public.photos;
create policy "RPC writer reads own photos" on public.photos
 for select to piggievault_rpc_writer
 using(user_id=piggievault_private.request_user_id());
drop policy if exists "RPC writer updates own photos" on public.photos;
create policy "RPC writer updates own photos" on public.photos
 for update to piggievault_rpc_writer
 using(user_id=piggievault_private.request_user_id())
 with check(user_id=piggievault_private.request_user_id());
drop policy if exists "RPC writer reads own reference photos" on public.pet_reference_photos;
create policy "RPC writer reads own reference photos" on public.pet_reference_photos
 for select to piggievault_rpc_writer
 using(user_id=piggievault_private.request_user_id());
drop policy if exists "RPC writer reads own predictions" on public.photo_pet_predictions;
create policy "RPC writer reads own predictions" on public.photo_pet_predictions
 for select to piggievault_rpc_writer
 using(user_id=piggievault_private.request_user_id());
drop policy if exists "RPC writer inserts own predictions" on public.photo_pet_predictions;
create policy "RPC writer inserts own predictions" on public.photo_pet_predictions
 for insert to piggievault_rpc_writer with check(
  user_id=piggievault_private.request_user_id()
  and exists(select 1 from public.photos where photos.id=photo_id
    and photos.user_id=piggievault_private.request_user_id())
  and (pet_id is null or exists(select 1 from public.pets where pets.id=pet_id
    and pets.user_id=piggievault_private.request_user_id()))
  and not exists(
   select 1 from unnest(candidate_pet_ids||suggested_pet_ids||confirmed_pet_ids) label_pet_id
   where not exists(select 1 from public.pets where pets.id=label_pet_id
     and pets.user_id=piggievault_private.request_user_id())
  )
 );
drop policy if exists "RPC writer updates own predictions" on public.photo_pet_predictions;
create policy "RPC writer updates own predictions" on public.photo_pet_predictions
 for update to piggievault_rpc_writer
 using(user_id=piggievault_private.request_user_id())
 with check(
  user_id=piggievault_private.request_user_id()
  and exists(select 1 from public.photos where photos.id=photo_id
    and photos.user_id=piggievault_private.request_user_id())
  and (pet_id is null or exists(select 1 from public.pets where pets.id=pet_id
    and pets.user_id=piggievault_private.request_user_id()))
  and not exists(
   select 1 from unnest(candidate_pet_ids||suggested_pet_ids||confirmed_pet_ids) label_pet_id
   where not exists(select 1 from public.pets where pets.id=label_pet_id
     and pets.user_id=piggievault_private.request_user_id())
  )
 );

revoke all on public.pets,public.photos,public.photo_pet_predictions,public.pet_reference_photos,public.photo_deletions from piggievault_rpc_writer;
grant select on public.pets,public.photos,public.photo_pet_predictions,public.pet_reference_photos,public.photo_deletions to piggievault_rpc_writer;
revoke all on storage.objects from piggievault_rpc_writer;
grant select on storage.objects to piggievault_rpc_writer;
-- Existing public-table policies target PUBLIC and apply unchanged to writer.
-- The outbox and Storage policies target authenticated explicitly, so add only
-- the corresponding ownership-scoped operations for the dedicated role.
drop policy if exists "RPC writer reads own photo deletions" on public.photo_deletions;
create policy "RPC writer reads own photo deletions" on public.photo_deletions
 for select to piggievault_rpc_writer using(user_id=piggievault_private.request_user_id());
drop policy if exists "RPC writer completes own photo deletions" on public.photo_deletions;
create policy "RPC writer completes own photo deletions" on public.photo_deletions
 for update to piggievault_rpc_writer using(user_id=piggievault_private.request_user_id())
 with check(user_id=piggievault_private.request_user_id() and storage_deleted_at is not null);
drop policy if exists "RPC writer checks own general photo objects" on storage.objects;
create policy "RPC writer checks own general photo objects" on storage.objects
 for select to piggievault_rpc_writer
 using(bucket_id='user-photos' and split_part(name,'/',1)=piggievault_private.request_user_id()::text);

-- Ordinary row reads and metadata operations remain RLS scoped.
revoke insert, update, delete on public.photo_pet_predictions from authenticated;
revoke insert, update, delete on public.pets from authenticated;
revoke insert, update on public.photos from authenticated;
revoke update (storage_deleted_at) on public.photo_deletions from authenticated;
grant insert (user_id,name,sex,birth_date,favorite_foods,disliked_foods,personality_notes,general_notes)
 on public.pets to authenticated;
grant update (name,sex,birth_date,favorite_foods,disliked_foods,personality_notes,general_notes,updated_at)
 on public.pets to authenticated;
grant insert (id,user_id,storage_path,file_name,file_size,width,height,mime_type,taken_at,uploaded_at,ai_status)
 on public.photos to authenticated;
grant update (display_name,updated_at) on public.photos to authenticated;
-- photos DELETE remains permitted: 0010's definer lifecycle trigger enforces
-- the same tombstone/reference guards regardless of direct versus RPC entry.

-- No table ownership, BYPASSRLS, DDL, Storage writes, or outbox INSERT/DELETE.
grant select, insert, update on public.photo_pet_predictions to piggievault_rpc_writer;
grant update (ai_status,updated_at) on public.photos to piggievault_rpc_writer;
grant update (profile_photo_path,updated_at), delete on public.pets to piggievault_rpc_writer;
grant update (storage_deleted_at) on public.photo_deletions to piggievault_rpc_writer;

-- Temporary provisioning rights: visible only inside this transaction.
-- postgres already administers the role; API roles receive no membership.
grant create on schema public to piggievault_rpc_writer;
-- Recreate only protected RPC bodies with the private request-identity helper.
-- All validation, ownership predicates and lock ordering otherwise remain unchanged.
create or replace function public.delete_pet_transaction(target_pet_id uuid, confirmation_name text)
returns table (outcome text, avatar_path text)
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := piggievault_private.request_user_id();
  pet public.pets%rowtype;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- Row lock serializes duplicate deletes and concurrent name changes. It also
  -- waits for the prediction reference guard's KEY SHARE locks.
  select * into pet from public.pets
    where id = target_pet_id and user_id = owner_id for update;
  if not found then
    -- Missing, already deleted, and another owner's IDs have the same result.
    return query select 'absent'::text, null::text;
    return;
  end if;
  if confirmation_name is distinct from pet.name then
    return query select 'confirmation_required'::text, null::text;
    return;
  end if;
  delete from public.pets where id = pet.id and user_id = owner_id;
  return query select 'deleted'::text, pet.profile_photo_path;
end;
$$;

create or replace function public.set_photo_labels(
  target_photo_id uuid, expected_revision integer, label_pet_ids uuid[],
  label_unknown boolean, label_intent text
)
returns table(outcome text, revision integer)
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := piggievault_private.request_user_id();
  prediction public.photo_pet_predictions%rowtype;
  selected_ids uuid[];
  selected_id uuid;
  next_review text;
  same_labels boolean;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0 or label_unknown is null
    or label_intent is null or label_intent not in ('save','confirm','clear','skip')
    or label_pet_ids is null or array_position(label_pet_ids, null) is not null then
    raise exception 'Invalid label input' using errcode = '22023';
  end if;
  selected_ids := array(select distinct id from unnest(label_pet_ids) as labels(id) order by id);
  if (label_intent in ('save','confirm') and
      ((label_unknown and cardinality(selected_ids) > 0) or (not label_unknown and cardinality(selected_ids) = 0)))
    or (label_intent in ('clear','skip') and (label_unknown or cardinality(selected_ids) > 0)) then
    raise exception 'Choose pets or Unknown, or clear labels' using errcode = '22023';
  end if;

  perform 1 from public.photos where id = target_photo_id and user_id = owner_id for update;
  if not found then return query select 'unavailable'::text, 0; return; end if;
  -- 0011's reference guard additionally protects against concurrent pet deletes.
  foreach selected_id in array selected_ids loop
    perform 1 from public.pets where id = selected_id and user_id = owner_id for key share;
    if not found then return query select 'unavailable'::text, 0; return; end if;
  end loop;

  insert into public.photo_pet_predictions(photo_id,user_id,prediction_status,prediction_source)
    values (target_photo_id,owner_id,'needs_review','manual')
    on conflict (photo_id) do nothing;
  select * into prediction from public.photo_pet_predictions
    where photo_id = target_photo_id and user_id = owner_id for update;

  same_labels := case when label_intent in ('save','confirm') then
    prediction.review_status in ('confirmed','corrected')
      and prediction.confirmed_pet_ids @> selected_ids and prediction.confirmed_pet_ids <@ selected_ids
      and prediction.confirmed_unknown = label_unknown
    else prediction.review_status = case when label_intent = 'skip' then 'skipped' else 'pending_review' end
      and cardinality(prediction.confirmed_pet_ids) = 0 and not prediction.confirmed_unknown end;
  -- A lost successful response may safely retry the same desired state.
  if same_labels then return query select 'saved'::text, prediction.labels_revision; return; end if;
  if prediction.labels_revision <> expected_revision then
    return query select 'conflict'::text, prediction.labels_revision; return;
  end if;
  if label_intent = 'confirm' and (prediction.processing_status <> 'ready_for_review'
    or not (prediction.suggested_pet_ids @> selected_ids and prediction.suggested_pet_ids <@ selected_ids)
    or prediction.suggested_unknown <> label_unknown) then
    return query select 'conflict'::text, prediction.labels_revision; return;
  end if;

  next_review := case
    when label_intent = 'clear' then 'pending_review'
    when label_intent = 'skip' then 'skipped'
    when prediction.processing_status = 'ready_for_review'
      and prediction.suggested_pet_ids @> selected_ids and prediction.suggested_pet_ids <@ selected_ids
      and prediction.suggested_unknown = label_unknown then 'confirmed'
    else 'corrected' end;
  update public.photo_pet_predictions set
    confirmed_pet_ids = selected_ids, confirmed_unknown = label_unknown,
    confirmed_by_user = label_intent in ('save','confirm'), review_status = next_review,
    reviewed_at = case when label_intent = 'clear' then null else now() end, updated_at = now()
    where id = prediction.id and user_id = owner_id
    returning labels_revision into prediction.labels_revision;
  update public.photos set ai_status = case
    when label_intent in ('save','confirm') then case when label_unknown then 'unknown' else 'specific_pet' end
    when prediction.processing_status = 'pending' and prediction.classification_started_at is null then 'uploaded'
    else prediction.processing_status end, updated_at = now()
    where id = target_photo_id and user_id = owner_id;
  return query select 'saved'::text, prediction.labels_revision;
end;
$$;

create or replace function public.set_pet_avatar(target_pet_id uuid, expected_revision integer, target_avatar_path text)
returns table(outcome text, revision integer)
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := piggievault_private.request_user_id(); pet public.pets%rowtype;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0 then
    raise exception 'Invalid avatar revision' using errcode = '22023';
  end if;
  if target_avatar_path is not null and (
    split_part(target_avatar_path, '/', 1) <> owner_id::text
    or split_part(target_avatar_path, '/', 2) <> target_pet_id::text
    or target_avatar_path !~ ('^' || owner_id::text || '/' || target_pet_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
  ) then raise exception 'Invalid avatar path' using errcode = '22023'; end if;
  select * into pet from public.pets where id = target_pet_id and user_id = owner_id for update;
  if not found then return query select 'unavailable'::text, 0; return; end if;
  -- Same desired state is idempotent even if its successful response was lost.
  if pet.profile_photo_path is not distinct from target_avatar_path then
    return query select 'saved'::text, pet.avatar_revision; return;
  end if;
  if pet.avatar_revision <> expected_revision then
    return query select 'conflict'::text, pet.avatar_revision; return;
  end if;
  update public.pets set profile_photo_path = target_avatar_path, updated_at = now()
    where id = pet.id and user_id = owner_id returning avatar_revision into pet.avatar_revision;
  return query select 'saved'::text, pet.avatar_revision;
end;
$$;

create or replace function public.start_photo_classification(target_photo_id uuid, attempt_token uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := piggievault_private.request_user_id(); prediction public.photo_pet_predictions%rowtype;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if attempt_token is null then raise exception 'Attempt token required' using errcode = '22023'; end if;
  -- Same lock order as manual labeling: photo, then prediction.
  perform 1 from public.photos where id = target_photo_id and user_id = owner_id for update;
  if not found then return jsonb_build_object('outcome','unavailable'); end if;
  select * into prediction from public.photo_pet_predictions where photo_id = target_photo_id and user_id = owner_id for update;
  if found and prediction.processing_token = attempt_token then
    return jsonb_build_object('outcome','duplicate');
  end if;
  insert into public.photo_pet_predictions(photo_id,user_id,prediction_source,prediction_status,processing_status,processing_token,classification_started_at)
    values (target_photo_id,owner_id,'ai','needs_review','processing',attempt_token,clock_timestamp())
    on conflict (photo_id) do update set
      processing_status = 'processing', processing_token = attempt_token,
      classification_started_at = clock_timestamp(), classification_completed_at = null,
      error_category = null, updated_at = now()
    returning * into prediction;
  if not found then raise exception 'Prediction start was not saved'; end if;
  update public.photos set ai_status = case
    when prediction.review_status in ('confirmed','corrected') then case when prediction.confirmed_unknown then 'unknown' else 'specific_pet' end
    else 'processing' end, updated_at = now()
    where id = target_photo_id and user_id = owner_id;
  if not found then raise exception 'Photo status was not saved'; end if;
  return jsonb_build_object('outcome','started','prediction',jsonb_build_object(
    'id',prediction.id,'review_status',prediction.review_status,'confirmed_pet_ids',prediction.confirmed_pet_ids,
    'confirmed_unknown',prediction.confirmed_unknown,'classification_version',prediction.classification_version));
end;
$$;

create or replace function public.finish_photo_classification(target_photo_id uuid, attempt_token uuid, result_status text, result_error text, machine_result jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := piggievault_private.request_user_id(); prediction public.photo_pet_predictions%rowtype; machine public.photo_pet_predictions%rowtype;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if attempt_token is null or result_status is null or result_status not in ('ready_for_review','failed','insufficient_references')
    or machine_result is null or jsonb_typeof(machine_result) <> 'object' then
    raise exception 'Invalid classification result' using errcode = '22023';
  end if;
  perform 1 from public.photos where id = target_photo_id and user_id = owner_id for update;
  if not found then return jsonb_build_object('outcome','unavailable'); end if;
  select * into prediction from public.photo_pet_predictions where photo_id = target_photo_id and user_id = owner_id for update;
  if not found or prediction.processing_token is distinct from attempt_token then
    return jsonb_build_object('outcome','superseded');
  end if;
  -- Completion is terminal for this token, including a retry after a lost reply.
  if prediction.processing_status <> 'processing' then
    return jsonb_build_object('outcome','saved','status',prediction.processing_status,'category',prediction.error_category);
  end if;
  -- Preserve a reviewed machine snapshot using CURRENT human state, not the
  -- caller's snapshot from before a potentially long inference request.
  machine := prediction;
  if result_status = 'ready_for_review' and not (prediction.review_status in ('confirmed','corrected') and prediction.classification_version is not null) then
    machine := jsonb_populate_record(prediction, machine_result);
  end if;
  -- Explicit allowlist: result payloads cannot mutate identity, tokens or labels.
  update public.photo_pet_predictions set
    candidate_pet_ids = machine.candidate_pet_ids, candidate_scores = machine.candidate_scores,
    candidate_reference_counts = machine.candidate_reference_counts,
    suggested_pet_ids = machine.suggested_pet_ids, suggested_unknown = machine.suggested_unknown,
    classification_strategy = machine.classification_strategy, classification_version = machine.classification_version,
    configuration_version = machine.configuration_version, embedding_dimension = machine.embedding_dimension,
    embedding_model = machine.embedding_model, embedding_version = machine.embedding_version,
    pet_id = machine.pet_id, prediction_status = machine.prediction_status,
    processing_status = result_status, error_category = case when result_status = 'failed' then result_error else null end,
    classification_completed_at = clock_timestamp(), updated_at = now()
    where id = prediction.id and user_id = owner_id;
  if not found then raise exception 'Prediction result was not saved'; end if;
  update public.photos set ai_status = case
    when prediction.review_status in ('confirmed','corrected') then case when prediction.confirmed_unknown then 'unknown' else 'specific_pet' end
    else result_status end, updated_at = now()
    where id = target_photo_id and user_id = owner_id;
  if not found then raise exception 'Photo status was not saved'; end if;
  return jsonb_build_object('outcome','saved','status',result_status,'category',case when result_status = 'failed' then result_error else null end);
end;
$$;
-- Only the five functions that need protected write rights are elevated.
alter function public.set_photo_labels(uuid,integer,uuid[],boolean,text) security definer;
alter function public.set_photo_labels(uuid,integer,uuid[],boolean,text) owner to piggievault_rpc_writer;
alter function public.start_photo_classification(uuid,uuid) security definer;
alter function public.start_photo_classification(uuid,uuid) owner to piggievault_rpc_writer;
alter function public.finish_photo_classification(uuid,uuid,text,text,jsonb) security definer;
alter function public.finish_photo_classification(uuid,uuid,text,text,jsonb) owner to piggievault_rpc_writer;
alter function public.set_pet_avatar(uuid,integer,text) security definer;
alter function public.set_pet_avatar(uuid,integer,text) owner to piggievault_rpc_writer;
alter function public.delete_pet_transaction(uuid,text) security definer;
alter function public.delete_pet_transaction(uuid,text) owner to piggievault_rpc_writer;
-- begin_photo_deletion stays SECURITY INVOKER. Internal triggers unchanged.

-- Keep the current upload payload compatible, but never allow a manufactured
-- initial reviewed/processing state. This enforces input intent, not role names.
create or replace function public.check_initial_photo_state()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.ai_status is distinct from 'uploaded' then
  raise exception 'New photos must start uploaded' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.check_initial_photo_state() from public,anon,authenticated;
drop trigger if exists photo_initial_state on public.photos;
create trigger photo_initial_state before insert on public.photos
 for each row execute function public.check_initial_photo_state();

-- RLS upload gate serializes with 0010's per-owner lifecycle lock. VOLATILE
-- PL/pgSQL obtains a fresh snapshot after waiting at READ COMMITTED.
-- Calling this helper directly grants no write privilege or new capability.
create or replace function public.photo_path_accepts_upload(target_path text)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid();
begin
 if owner_id is null or split_part(target_path,'/',1) is distinct from owner_id::text then return false; end if;
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'Photo uploads require READ COMMITTED isolation';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,10));
 return not exists(select 1 from public.photo_deletions where user_id=owner_id and storage_path=target_path);
end $$;
revoke all on function public.photo_path_accepts_upload(text) from public,anon;
grant execute on function public.photo_path_accepts_upload(text) to authenticated;
drop policy if exists "Retired photo paths cannot be uploaded" on storage.objects;
create policy "Retired photo paths cannot be uploaded" on storage.objects
 as restrictive for insert to authenticated
 with check(bucket_id<>'user-photos' or public.photo_path_accepts_upload(name));
drop policy if exists "Retired photo paths cannot be replaced" on storage.objects;
create policy "Retired photo paths cannot be replaced" on storage.objects
 as restrictive for update to authenticated
 using(bucket_id<>'user-photos' or public.photo_path_accepts_upload(name))
 with check(bucket_id<>'user-photos' or public.photo_path_accepts_upload(name));

create or replace function public.acknowledge_photo_deletion(target_photo_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=piggievault_private.request_user_id(); job public.photo_deletions%rowtype;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'Cleanup acknowledgment requires READ COMMITTED isolation';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,10));
 select * into job from public.photo_deletions where photo_id=target_photo_id and user_id=owner_id for update;
 if not found then return 'unavailable'; end if;
 if exists(select 1 from storage.objects where bucket_id='user-photos' and name=job.storage_path) then
  return 'storage_present';
 end if;
 update public.photo_deletions set storage_deleted_at=coalesce(storage_deleted_at,clock_timestamp())
  where photo_id=target_photo_id and user_id=owner_id;
 return 'acknowledged';
end $$;
alter function public.acknowledge_photo_deletion(uuid) owner to piggievault_rpc_writer;
revoke all on function public.acknowledge_photo_deletion(uuid) from public,anon,authenticated;
grant execute on function public.acknowledge_photo_deletion(uuid) to authenticated;
-- Remove ONLY the grant issued by this migration administrator. The automatic
-- bootstrap ADMIN membership remains SET FALSE / INHERIT FALSE.
revoke create on schema public from piggievault_rpc_writer;
revoke piggievault_rpc_writer from postgres granted by postgres;
do $$ begin
 if (select count(*) from pg_auth_members where roleid='piggievault_rpc_writer'::regrole) <> 1
 or exists(select 1 from pg_auth_members where roleid='piggievault_rpc_writer'::regrole
  and (member<>'postgres'::regrole or not admin_option or inherit_option or set_option)) then
  raise exception 'RPC writer provisioning rights were not removed';
 end if;
 if pg_has_role('authenticated','piggievault_rpc_writer','SET')
 or pg_has_role('anon','piggievault_rpc_writer','SET')
 or pg_has_role('authenticator','piggievault_rpc_writer','SET') then
  raise exception 'API role can become RPC writer';
 end if;
end $$;
-- Explicitly keep inherited anonymous/public CREATE out of the writer role.
-- No blanket schema revoke here: fail closed if platform/legacy grants differ.
do $$ begin
 if has_table_privilege('piggievault_rpc_writer','storage.objects','INSERT,UPDATE,DELETE,TRUNCATE')
  or has_any_column_privilege('piggievault_rpc_writer','storage.objects','INSERT,UPDATE')
  or has_table_privilege('piggievault_rpc_writer','public.photo_deletions','INSERT,DELETE,TRUNCATE')
  or has_column_privilege('piggievault_rpc_writer','public.photo_deletions','storage_path','UPDATE') then
  raise exception 'RPC writer has excess Storage/outbox privileges';
 end if;
 if has_schema_privilege('piggievault_rpc_writer','public','CREATE')
  or has_schema_privilege('piggievault_rpc_writer','storage','CREATE')
  or has_schema_privilege('piggievault_rpc_writer','auth','CREATE')
  or has_schema_privilege('piggievault_rpc_writer','piggievault_private','CREATE') then
  raise exception 'RPC writer unexpectedly has schema CREATE; review inherited ACLs';
 end if;
end $$;

-- GRANT can emit warnings rather than errors when a managed-object grant option
-- is absent. Fail closed instead of deploying RPCs that cannot read dependencies.
do $$ begin
 if not has_schema_privilege('piggievault_rpc_writer','public','USAGE')
 or not has_schema_privilege('piggievault_rpc_writer','storage','USAGE')
 or not has_schema_privilege('piggievault_rpc_writer','piggievault_private','USAGE')
 or not has_function_privilege('piggievault_rpc_writer','piggievault_private.request_user_id()','EXECUTE')
 or not has_table_privilege('piggievault_rpc_writer','storage.objects','SELECT') then
  raise exception 'RPC writer is missing required managed-object access';
 end if;
end $$;
do $$ begin
 if has_schema_privilege('piggievault_rpc_writer','auth','USAGE')
  or has_function_privilege('authenticated','piggievault_private.request_user_id()','EXECUTE')
  or has_function_privilege('anon','piggievault_private.request_user_id()','EXECUTE')
  or exists(
   select 1 from pg_catalog.pg_proc p
   cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   where p.oid='piggievault_private.request_user_id()'::regprocedure
    and a.grantee=0 and a.privilege_type='EXECUTE'
  ) then
  raise exception 'Private identity boundary is broader than reviewed';
 end if;
end $$;
commit;
