-- Apply after 0010. This migration performs no Storage operations.
begin;

-- Array labels lack native foreign keys. Lock every referenced pet until the
-- prediction write commits, so deletion either sees the write or rejects a
-- late writer. Existing RLS is still applied; this function is not privileged.
create function public.guard_prediction_pet_references()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare label_id uuid;
begin
  for label_id in
    select distinct id from unnest(
      new.candidate_pet_ids || new.suggested_pet_ids || new.confirmed_pet_ids
      || case when new.pet_id is null then '{}'::uuid[] else array[new.pet_id] end
    ) as labels(id) order by id
  loop
    perform 1 from public.pets where id = label_id and user_id = new.user_id
      for key share;
    if not found then
      raise exception 'A prediction label pet is unavailable' using errcode = '23503';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.guard_prediction_pet_references() from public;
create trigger prediction_pet_references
  before insert or update on public.photo_pet_predictions
  for each row execute function public.guard_prediction_pet_references();

-- Run for RPC and direct owner-authorized deletes alike. All updates and FK
-- cascades belong to the DELETE transaction; any failure rolls everything back.
create function public.remove_deleted_pet_labels()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  prediction public.photo_pet_predictions%rowtype;
  kept_indexes integer[];
  remaining_suggestions uuid[];
  remaining_confirmations uuid[];
  lost_confirmation boolean;
begin
  -- A fresh snapshot after the pet-row lock is needed to see writers that
  -- committed while deletion waited. Fail closed for custom isolation levels.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Pet deletion requires READ COMMITTED isolation';
  end if;
  for prediction in
    select * from public.photo_pet_predictions
    where user_id = old.user_id and (
      pet_id = old.id or old.id = any(candidate_pet_ids)
      or old.id = any(suggested_pet_ids) or old.id = any(confirmed_pet_ids)
    )
    order by id for update
  loop
    kept_indexes := array(select i from generate_subscripts(prediction.candidate_pet_ids, 1) as i
      where prediction.candidate_pet_ids[i] <> old.id order by i);
    remaining_suggestions := array_remove(prediction.suggested_pet_ids, old.id);
    remaining_confirmations := array_remove(prediction.confirmed_pet_ids, old.id);
    lost_confirmation := prediction.review_status in ('confirmed', 'corrected')
      and not prediction.confirmed_unknown and cardinality(remaining_confirmations) = 0;

    -- Mirrors the existing removePetFromPredictionLabels behavior, preserving
    -- all remaining scores, labels, model metadata, and processing state.
    update public.photo_pet_predictions set
      candidate_pet_ids = array(select prediction.candidate_pet_ids[i] from unnest(kept_indexes) as i),
      candidate_scores = array(select prediction.candidate_scores[i] from unnest(kept_indexes) as i),
      candidate_reference_counts = array(select prediction.candidate_reference_counts[i] from unnest(kept_indexes) as i),
      suggested_pet_ids = remaining_suggestions,
      suggested_unknown = prediction.suggested_unknown
        or (cardinality(prediction.suggested_pet_ids) > 0 and cardinality(remaining_suggestions) = 0),
      confirmed_pet_ids = remaining_confirmations,
      confirmed_by_user = case when lost_confirmation then false else prediction.confirmed_by_user end,
      review_status = case when lost_confirmation then 'pending_review' else prediction.review_status end,
      reviewed_at = case when lost_confirmation then null else prediction.reviewed_at end,
      pet_id = case when prediction.pet_id = old.id then null else prediction.pet_id end,
      updated_at = now()
    where id = prediction.id and user_id = old.user_id;

    -- A photo that lost its sole confirmed identity must no longer advertise a
    -- confirmed pet in the gallery's denormalized status. No reclassification.
    if lost_confirmation then
      update public.photos set ai_status = 'needs_review', updated_at = now()
        where id = prediction.photo_id and user_id = old.user_id;
    end if;
  end loop;
  return old;
end;
$$;
revoke all on function public.remove_deleted_pet_labels() from public;
create trigger pet_delete_labels
  before delete on public.pets
  for each row execute function public.remove_deleted_pet_labels();

create function public.delete_pet_transaction(target_pet_id uuid, confirmation_name text)
returns table (outcome text, avatar_path text)
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
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
revoke all on function public.delete_pet_transaction(uuid, text) from public, anon;
grant execute on function public.delete_pet_transaction(uuid, text) to authenticated;

commit;
