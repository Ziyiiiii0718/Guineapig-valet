-- Private pet profile avatar storage.
-- Objects are stored as: <auth.uid()>/<pet-id>/<unique-file-name>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pet-avatars',
  'pet-avatars',
  false,
  5242880,
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
      and policyname = 'Users can read own pet avatars'
  ) then
    create policy "Users can read own pet avatars"
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'pet-avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload own pet avatars'
  ) then
    create policy "Users can upload own pet avatars"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'pet-avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can replace own pet avatars'
  ) then
    create policy "Users can replace own pet avatars"
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'pet-avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
      bucket_id = 'pet-avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can delete own pet avatars'
  ) then
    create policy "Users can delete own pet avatars"
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'pet-avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end
$$;
