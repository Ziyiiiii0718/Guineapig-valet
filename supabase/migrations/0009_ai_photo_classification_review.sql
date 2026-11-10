-- Add an owner-scoped, human-reviewable classification lifecycle to the
-- existing prediction table. AI suggestions and user-confirmed labels remain
-- separate so retries never erase a correction.

alter table public.photo_pet_predictions
add column processing_status text,
add column review_status text,
add column candidate_pet_ids uuid[],
add column candidate_scores double precision[],
add column candidate_reference_counts integer[],
add column suggested_pet_ids uuid[],
add column suggested_unknown boolean,
add column confirmed_pet_ids uuid[],
add column confirmed_unknown boolean,
add column embedding_model text,
add column embedding_version text,
add column embedding_dimension integer,
add column classification_strategy text,
add column classification_version text,
add column configuration_version text,
add column error_category text,
add column processing_token uuid,
add column classification_started_at timestamptz,
add column classification_completed_at timestamptz,
add column reviewed_at timestamptz;

update public.photo_pet_predictions
set
  processing_status = 'ready_for_review',
  review_status = case
    when confirmed_by_user then 'confirmed'
    else 'pending_review'
  end,
  candidate_pet_ids = case
    when pet_id is null then '{}'::uuid[]
    else array[pet_id]
  end,
  candidate_scores = case
    when pet_id is null then '{}'::double precision[]
    else array[coalesce(confidence::double precision, 0)]
  end,
  candidate_reference_counts = case
    when pet_id is null then '{}'::integer[]
    else array[0]
  end,
  suggested_pet_ids = case
    when pet_id is null then '{}'::uuid[]
    else array[pet_id]
  end,
  suggested_unknown = prediction_status = 'unknown',
  confirmed_pet_ids = case
    when confirmed_by_user and pet_id is not null then array[pet_id]
    else '{}'::uuid[]
  end,
  confirmed_unknown = confirmed_by_user and prediction_status = 'unknown',
  classification_strategy = 'legacy',
  classification_version = coalesce(model_version, 'legacy'),
  configuration_version = 'legacy',
  classification_completed_at = updated_at,
  reviewed_at = case when confirmed_by_user then updated_at else null end;

alter table public.photo_pet_predictions
alter column processing_status set default 'pending',
alter column processing_status set not null,
alter column review_status set default 'pending_review',
alter column review_status set not null,
alter column candidate_pet_ids set default '{}'::uuid[],
alter column candidate_pet_ids set not null,
alter column candidate_scores set default '{}'::double precision[],
alter column candidate_scores set not null,
alter column candidate_reference_counts set default '{}'::integer[],
alter column candidate_reference_counts set not null,
alter column suggested_pet_ids set default '{}'::uuid[],
alter column suggested_pet_ids set not null,
alter column suggested_unknown set default false,
alter column suggested_unknown set not null,
alter column confirmed_pet_ids set default '{}'::uuid[],
alter column confirmed_pet_ids set not null,
alter column confirmed_unknown set default false,
alter column confirmed_unknown set not null,
add constraint photo_pet_predictions_photo_key unique (photo_id),
add constraint photo_pet_predictions_id_user_key unique (id, user_id),
add constraint photo_pet_predictions_photo_owner_fkey
  foreign key (photo_id, user_id)
  references public.photos(id, user_id)
  on delete cascade,
add constraint photo_pet_predictions_processing_status_check
  check (
    processing_status in (
      'pending',
      'processing',
      'ready_for_review',
      'failed',
      'insufficient_references'
    )
  ),
add constraint photo_pet_predictions_review_status_check
  check (review_status in ('pending_review', 'confirmed', 'corrected', 'skipped')),
add constraint photo_pet_predictions_candidate_lengths_check
  check (
    cardinality(candidate_pet_ids) = cardinality(candidate_scores)
    and cardinality(candidate_pet_ids) = cardinality(candidate_reference_counts)
  ),
add constraint photo_pet_predictions_candidate_values_check
  check (
    array_position(candidate_pet_ids, null) is null
    and array_position(candidate_scores, null) is null
    and array_position(candidate_reference_counts, null) is null
    and 0 <= all(candidate_reference_counts)
    and -1 <= all(candidate_scores)
    and 1 >= all(candidate_scores)
  ),
add constraint photo_pet_predictions_suggestion_check
  check (
    array_position(suggested_pet_ids, null) is null
    and suggested_pet_ids <@ candidate_pet_ids
    and not (suggested_unknown and cardinality(suggested_pet_ids) > 0)
  ),
add constraint photo_pet_predictions_confirmation_check
  check (
    array_position(confirmed_pet_ids, null) is null
    and not (confirmed_unknown and cardinality(confirmed_pet_ids) > 0)
    and (
      review_status not in ('confirmed', 'corrected')
      or confirmed_unknown
      or cardinality(confirmed_pet_ids) > 0
    )
  ),
add constraint photo_pet_predictions_embedding_dimension_check
  check (embedding_dimension is null or embedding_dimension = 512),
add constraint photo_pet_predictions_error_category_check
  check (
    error_category is null
    or error_category in (
      'service_unavailable',
      'model_unavailable',
      'invalid_image',
      'invalid_response',
      'inference_failed',
      'model_mismatch',
      'database_failure'
    )
  );

alter table public.photos
drop constraint if exists photos_ai_status_check;

alter table public.photos
add constraint photos_ai_status_check
check (
  ai_status in (
    'uploaded',
    'pending',
    'processing',
    'ready_for_review',
    'failed',
    'insufficient_references',
    'specific_pet',
    'unknown',
    'not_a_guinea_pig',
    'needs_review'
  )
);

create index photo_pet_predictions_user_processing_idx
on public.photo_pet_predictions(user_id, processing_status, review_status, updated_at desc);

drop policy if exists "Users can insert own predictions"
on public.photo_pet_predictions;
drop policy if exists "Users can update own predictions"
on public.photo_pet_predictions;

create policy "Users can insert own predictions"
on public.photo_pet_predictions
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.photos
    where photos.id = photo_id and photos.user_id = auth.uid()
  )
  and (pet_id is null or exists (
    select 1 from public.pets
    where pets.id = pet_id and pets.user_id = auth.uid()
  ))
  and not exists (
    select 1
    from unnest(candidate_pet_ids || suggested_pet_ids || confirmed_pet_ids) as label_pet_id
    where not exists (
      select 1 from public.pets
      where pets.id = label_pet_id and pets.user_id = auth.uid()
    )
  )
);

create policy "Users can update own predictions"
on public.photo_pet_predictions
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.photos
    where photos.id = photo_id and photos.user_id = auth.uid()
  )
  and (pet_id is null or exists (
    select 1 from public.pets
    where pets.id = pet_id and pets.user_id = auth.uid()
  ))
  and not exists (
    select 1
    from unnest(candidate_pet_ids || suggested_pet_ids || confirmed_pet_ids) as label_pet_id
    where not exists (
      select 1 from public.pets
      where pets.id = label_pet_id and pets.user_id = auth.uid()
    )
  )
);
