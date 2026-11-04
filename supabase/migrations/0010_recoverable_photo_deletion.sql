-- Apply separately after 0009. No Storage objects are removed by this migration.
-- A durable outbox also serves as a permanent path/ID tombstone. Do not purge it.
begin;

create table public.photo_deletions (
  photo_id uuid primary key,
  -- Keep the cleanup path even if the auth account is later removed.
  user_id uuid not null,
  storage_path text not null unique,
  requested_at timestamptz not null default now(),
  storage_deleted_at timestamptz,
  constraint photo_deletions_owner_path_check
    check (split_part(storage_path, '/', 1) = user_id::text)
);
create index photo_deletions_pending_idx
  on public.photo_deletions(user_id, requested_at)
  where storage_deleted_at is null;
alter table public.photo_deletions enable row level security;
revoke all on public.photo_deletions from anon, authenticated;
grant select on public.photo_deletions to authenticated;
grant update (storage_deleted_at) on public.photo_deletions to authenticated;
create policy "Users can read own photo deletions" on public.photo_deletions
  for select to authenticated using (user_id = auth.uid());
create policy "Users can complete own photo deletions" on public.photo_deletions
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and storage_deleted_at is not null);

-- All photo identity changes and deletion serialize per owner. This also guards
-- direct table writes, not just calls from the Next.js action. Hash collisions
-- only serialize extra users; they cannot weaken ownership checks.
create function public.guard_photo_storage_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.storage_path is distinct from old.storage_path then
      raise exception 'Photo identity and Storage path are immutable' using errcode = '23514';
    end if;
    return new;
  end if;

  -- The fresh snapshot after waiting on the lock is required for the guard.
  -- Supabase/PostgREST uses READ COMMITTED. Fail closed for custom sessions.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Photo lifecycle writes require READ COMMITTED isolation';
  end if;

  if TG_OP = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 10));
    if exists (select 1 from public.photo_deletions
      where storage_path = new.storage_path or photo_id = new.id) then
      raise exception 'This photo has been deleted; use a new upload path' using errcode = '23514';
    end if;
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.user_id::text, 10));
  -- Fail closed for legacy inconsistent path references. Current reference
  -- rows use photo_id; their cascade is part of this same transaction.
  if exists (select 1 from public.photos
    where storage_path = old.storage_path and id <> old.id)
    or exists (select 1 from public.pet_reference_photos
      where storage_path = old.storage_path and photo_id <> old.id) then
    raise exception 'Storage object is still referenced by another photo' using errcode = '23503';
  end if;
  insert into public.photo_deletions(photo_id, user_id, storage_path)
    values (old.id, old.user_id, old.storage_path);
  return old;
end;
$$;
revoke all on function public.guard_photo_storage_lifecycle() from public;
create trigger photos_storage_lifecycle
  before insert or delete or update of id, user_id, storage_path on public.photos
  for each row execute function public.guard_photo_storage_lifecycle();

-- The legacy path column must not create an independent reference to another
-- image. KEY SHARE synchronizes this check with photo deletion; the FK then
-- either cascades the reference or rejects a late insert.
create function public.guard_reference_photo_storage_path()
returns trigger language plpgsql security definer set search_path = '' as $$
declare canonical_path text;
begin
  select storage_path into canonical_path from public.photos
    where id = new.photo_id and user_id = new.user_id for key share;
  if not found or (new.storage_path is not null and new.storage_path <> canonical_path) then
    raise exception 'Reference must use its owned photo Storage path' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_reference_photo_storage_path() from public;
create trigger reference_photo_storage_path
  before insert or update of photo_id, user_id, storage_path on public.pet_reference_photos
  for each row execute function public.guard_reference_photo_storage_path();

-- SECURITY INVOKER deliberately retains the caller's table privileges and RLS.
-- Trigger-generated outbox entry and all FK cascades commit with the delete.
create function public.begin_photo_deletion(target_photo_id uuid)
returns setof public.photo_deletions
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 10));
  delete from public.photos where id = target_photo_id and user_id = owner_id;
  return query select * from public.photo_deletions
    where photo_id = target_photo_id and user_id = owner_id;
end;
$$;
revoke all on function public.begin_photo_deletion(uuid) from public, anon;
grant execute on function public.begin_photo_deletion(uuid) to authenticated;

-- Keep the existing owner policy, but require a committed tombstone as well.
-- A stale client cannot delete bytes while the live photo still exists.
create policy "General photo deletion requires retired metadata"
  on storage.objects as restrictive for delete to authenticated
  using (
    bucket_id <> 'user-photos'
    or (
      exists (select 1 from public.photo_deletions
        where user_id = auth.uid() and storage_path = name)
      and not exists (select 1 from public.photos where storage_path = name)
      and not exists (select 1 from public.pet_reference_photos where storage_path = name)
    )
  );

commit;
