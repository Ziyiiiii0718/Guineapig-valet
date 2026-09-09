-- Evolve the dormant reference-photo table into an owner-safe relationship
-- between existing private photos and pets, with honest embedding state.

alter table public.pet_reference_photos
add column photo_id uuid,
add column embedding_model text,
add column embedding_version text,
add column embedding_dimension integer,
add column embedding_status text,
add column embedding_error_category text,
add column updated_at timestamptz not null default now();

update public.pet_reference_photos as reference
set photo_id = photo.id
from public.photos as photo
where reference.photo_id is null
  and photo.user_id = reference.user_id
  and photo.storage_path = reference.storage_path;

do $$
begin
  if exists (
    select 1
    from public.pet_reference_photos
    where photo_id is null
  ) then
    raise exception 'Cannot link one or more legacy reference rows to an owned photo';
  end if;
end
$$;

update public.pet_reference_photos
set
  embedding_status = case when embedding is null then 'pending' else 'ready' end,
  embedding_dimension = case when embedding is null then null else 512 end;

alter table public.pet_reference_photos
alter column photo_id set not null,
alter column embedding_status set default 'pending',
alter column embedding_status set not null,
alter column storage_path drop not null,
add constraint pet_reference_photos_photo_owner_fkey
  foreign key (photo_id, user_id)
  references public.photos(id, user_id)
  on delete cascade,
add constraint pet_reference_photos_pet_owner_fkey
  foreign key (pet_id, user_id)
  references public.pets(id, user_id)
  on delete cascade,
add constraint pet_reference_photos_pet_photo_key unique (pet_id, photo_id),
add constraint pet_reference_photos_embedding_status_check
  check (embedding_status in ('pending', 'processing', 'ready', 'failed')),
add constraint pet_reference_photos_embedding_dimension_check
  check (embedding_dimension is null or embedding_dimension = 512),
add constraint pet_reference_photos_embedding_error_category_check
  check (
    embedding_error_category is null
    or embedding_error_category in (
      'service_unavailable',
      'model_unavailable',
      'invalid_image',
      'invalid_response',
      'inference_failed'
    )
  );

create index pet_reference_photos_user_photo_idx
on public.pet_reference_photos(user_id, photo_id);

drop policy if exists "Users can insert own reference photos"
on public.pet_reference_photos;
drop policy if exists "Users can update own reference photos"
on public.pet_reference_photos;

create policy "Users can insert own reference photos"
on public.pet_reference_photos
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.pets
    where pets.id = pet_id and pets.user_id = auth.uid()
  )
  and exists (
    select 1 from public.photos
    where photos.id = photo_id and photos.user_id = auth.uid()
  )
);

create policy "Users can update own reference photos"
on public.pet_reference_photos
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.pets
    where pets.id = pet_id and pets.user_id = auth.uid()
  )
  and exists (
    select 1 from public.photos
    where photos.id = photo_id and photos.user_id = auth.uid()
  )
);
