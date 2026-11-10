-- Apply after 0010 and 0011. No model, threshold or Storage changes.
begin;
alter table public.photo_pet_predictions add column labels_revision integer not null default 0;

-- AI updates leave human columns untouched. Revisions track human changes,
-- including the pet-deletion cleanup from 0011, not background AI progress.
create function public.track_photo_label_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    new.labels_revision := case when new.confirmed_by_user then 1 else 0 end;
  elsif row(new.confirmed_pet_ids, new.confirmed_unknown, new.confirmed_by_user, new.review_status)
    is distinct from row(old.confirmed_pet_ids, old.confirmed_unknown, old.confirmed_by_user, old.review_status) then
    new.labels_revision := old.labels_revision + 1;
  else
    new.labels_revision := old.labels_revision;
  end if;
  return new;
end;
$$;
revoke all on function public.track_photo_label_revision() from public;
create trigger photo_label_revision before insert or update on public.photo_pet_predictions
  for each row execute function public.track_photo_label_revision();

-- An AI request can carry a stale snapshot of the review. Keep the summary
-- consistent with current human truth when that request later updates photos.
create function public.preserve_manual_photo_status()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare prediction public.photo_pet_predictions%rowtype;
begin
  select * into prediction from public.photo_pet_predictions
    where photo_id = new.id and user_id = new.user_id;
  if found then
    if prediction.review_status in ('confirmed', 'corrected') then
      new.ai_status := case when prediction.confirmed_unknown then 'unknown' else 'specific_pet' end;
    elsif new.ai_status in ('specific_pet', 'unknown') then
      new.ai_status := case when prediction.processing_status = 'pending' and prediction.classification_started_at is null
        then 'uploaded' else prediction.processing_status end;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.preserve_manual_photo_status() from public;
create trigger photo_manual_status before update of ai_status on public.photos
  for each row execute function public.preserve_manual_photo_status();

create function public.set_photo_labels(
  target_photo_id uuid, expected_revision integer, label_pet_ids uuid[],
  label_unknown boolean, label_intent text
)
returns table(outcome text, revision integer)
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
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
revoke all on function public.set_photo_labels(uuid, integer, uuid[], boolean, text) from public, anon;
grant execute on function public.set_photo_labels(uuid, integer, uuid[], boolean, text) to authenticated;
commit;
