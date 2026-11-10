-- Apply after 0012. Metadata-only avatar changes; no Storage cleanup.
begin;
alter table public.pets add column avatar_revision integer not null default 0;

create function public.track_pet_avatar_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    new.avatar_revision := 0;
  elsif new.profile_photo_path is distinct from old.profile_photo_path then
    new.avatar_revision := old.avatar_revision + 1;
  else
    new.avatar_revision := old.avatar_revision;
  end if;
  return new;
end;
$$;
revoke all on function public.track_pet_avatar_revision() from public;
create trigger pet_avatar_revision before insert or update on public.pets
  for each row execute function public.track_pet_avatar_revision();

create function public.set_pet_avatar(target_pet_id uuid, expected_revision integer, target_avatar_path text)
returns table(outcome text, revision integer)
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid(); pet public.pets%rowtype;
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
revoke all on function public.set_pet_avatar(uuid, integer, text) from public, anon;
grant execute on function public.set_pet_avatar(uuid, integer, text) to authenticated;
commit;
