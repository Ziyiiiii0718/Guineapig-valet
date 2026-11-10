-- Apply after 0013. No inference, threshold, Storage, or RLS policy changes.
begin;

create function public.start_photo_classification(target_photo_id uuid, attempt_token uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid(); prediction public.photo_pet_predictions%rowtype;
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

create function public.finish_photo_classification(target_photo_id uuid, attempt_token uuid, result_status text, result_error text, machine_result jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid(); prediction public.photo_pet_predictions%rowtype; machine public.photo_pet_predictions%rowtype;
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
revoke all on function public.start_photo_classification(uuid,uuid) from public, anon;
revoke all on function public.finish_photo_classification(uuid,uuid,text,text,jsonb) from public, anon;
grant execute on function public.start_photo_classification(uuid,uuid) to authenticated;
grant execute on function public.finish_photo_classification(uuid,uuid,text,text,jsonb) to authenticated;
commit;
