-- Test-only Supabase boundary stand-ins; run only in the disposable container.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (bucket_id text, name text, primary key(bucket_id, name));
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$
  select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'), 1)-1]
$$;
grant usage on schema public, storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
