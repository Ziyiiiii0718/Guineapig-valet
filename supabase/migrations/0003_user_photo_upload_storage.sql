-- Private general photo upload storage and metadata refinements.
-- Objects are stored as: <auth.uid()>/<year>/<month>/<unique-file-name>

alter table public.photos
add column if not exists mime_type text;

alter table public.photos
drop constraint if exists photos_ai_status_check;

alter table public.photos
add constraint photos_ai_status_check
check (
  ai_status in (
    'uploaded',
    'specific_pet',
    'unknown',
    'not_a_guinea_pig',
    'needs_review'
  )
);

alter table public.photos
alter column ai_status set default 'uploaded';

alter table public.photos
add constraint photos_mime_type_check
check (
  mime_type is null
  or mime_type in ('image/jpeg', 'image/png', 'image/webp')
);

alter table public.photos
add constraint photos_storage_path_user_prefix_check
check (storage_path like user_id::text || '/%');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-photos',
  'user-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can read own general photos'
  ) then
    create policy "Users can read own general photos"
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'user-photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload own general photos'
  ) then
    create policy "Users can upload own general photos"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'user-photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can replace own general photos'
  ) then
    create policy "Users can replace own general photos"
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'user-photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
      bucket_id = 'user-photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can delete own general photos'
  ) then
    create policy "Users can delete own general photos"
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'user-photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end
$$;
