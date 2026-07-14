-- PiggieVault initial schema for Supabase PostgreSQL.
-- Run this in the Supabase SQL editor or through the Supabase CLI after creating a project.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  sex text not null check (sex in ('female', 'male', 'unknown')),
  birth_date date,
  favorite_foods text,
  disliked_foods text,
  personality_notes text,
  general_notes text,
  profile_photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  taken_at timestamptz,
  uploaded_at timestamptz not null default now(),
  file_name text not null,
  file_size integer not null check (file_size > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  ai_status text not null default 'needs_review' check (ai_status in ('specific_pet', 'unknown', 'not_a_guinea_pig', 'needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, storage_path)
);

create table public.pet_reference_photos (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  embedding vector(512),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, storage_path)
);

create table public.photo_pet_predictions (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  pet_id uuid references public.pets(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  prediction_status text not null check (prediction_status in ('specific_pet', 'unknown', 'not_a_guinea_pig', 'needs_review')),
  prediction_source text not null check (prediction_source in ('ai', 'manual')),
  confirmed_by_user boolean not null default false,
  model_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.albums (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text,
  cover_photo_id uuid references public.photos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, title)
);

create table public.album_photos (
  album_id uuid not null references public.albums(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (album_id, photo_id)
);

create table public.weight_records (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_grams integer not null check (weight_grams between 1 and 5000),
  recorded_at date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.health_records (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  symptoms text,
  vet_visit boolean not null default false,
  medication text,
  treatment_notes text,
  additional_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_created_at_idx on public.profiles(created_at);
create index pets_user_id_idx on public.pets(user_id);
create index photos_user_taken_at_idx on public.photos(user_id, coalesce(taken_at, uploaded_at) desc);
create index pet_reference_photos_user_pet_idx on public.pet_reference_photos(user_id, pet_id);
create index photo_pet_predictions_user_photo_idx on public.photo_pet_predictions(user_id, photo_id);
create index albums_user_id_idx on public.albums(user_id);
create index album_photos_user_album_idx on public.album_photos(user_id, album_id);
create index weight_records_user_pet_recorded_idx on public.weight_records(user_id, pet_id, recorded_at desc);
create index health_records_user_pet_date_idx on public.health_records(user_id, pet_id, record_date desc);

alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.photos enable row level security;
alter table public.pet_reference_photos enable row level security;
alter table public.photo_pet_predictions enable row level security;
alter table public.albums enable row level security;
alter table public.album_photos enable row level security;
alter table public.weight_records enable row level security;
alter table public.health_records enable row level security;

create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users can read own pets" on public.pets for select using (auth.uid() = user_id);
create policy "Users can insert own pets" on public.pets for insert with check (auth.uid() = user_id);
create policy "Users can update own pets" on public.pets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own pets" on public.pets for delete using (auth.uid() = user_id);

create policy "Users can read own photos" on public.photos for select using (auth.uid() = user_id);
create policy "Users can insert own photos" on public.photos for insert with check (auth.uid() = user_id);
create policy "Users can update own photos" on public.photos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own photos" on public.photos for delete using (auth.uid() = user_id);

create policy "Users can read own reference photos" on public.pet_reference_photos for select using (auth.uid() = user_id);
create policy "Users can insert own reference photos" on public.pet_reference_photos for insert with check (
  auth.uid() = user_id and exists (select 1 from public.pets where pets.id = pet_id and pets.user_id = auth.uid())
);
create policy "Users can update own reference photos" on public.pet_reference_photos for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (select 1 from public.pets where pets.id = pet_id and pets.user_id = auth.uid())
);
create policy "Users can delete own reference photos" on public.pet_reference_photos for delete using (auth.uid() = user_id);

create policy "Users can read own predictions" on public.photo_pet_predictions for select using (auth.uid() = user_id);
create policy "Users can insert own predictions" on public.photo_pet_predictions for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.photos where photos.id = photo_id and photos.user_id = auth.uid())
  and (pet_id is null or exists (select 1 from public.pets where pets.id = pet_id and pets.user_id = auth.uid()))
);
create policy "Users can update own predictions" on public.photo_pet_predictions for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and exists (select 1 from public.photos where photos.id = photo_id and photos.user_id = auth.uid())
  and (pet_id is null or exists (select 1 from public.pets where pets.id = pet_id and pets.user_id = auth.uid()))
);
create policy "Users can delete own predictions" on public.photo_pet_predictions for delete using (auth.uid() = user_id);

create policy "Users can read own albums" on public.albums for select using (auth.uid() = user_id);
create policy "Users can insert own albums" on public.albums for insert with check (auth.uid() = user_id);
create policy "Users can update own albums" on public.albums for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and (cover_photo_id is null or exists (select 1 from public.photos where photos.id = cover_photo_id and photos.user_id = auth.uid()))
);
create policy "Users can delete own albums" on public.albums for delete using (auth.uid() = user_id);

create policy "Users can read own album photos" on public.album_photos for select using (auth.uid() = user_id);
create policy "Users can insert own album photos" on public.album_photos for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.albums where albums.id = album_id and albums.user_id = auth.uid())
  and exists (select 1 from public.photos where photos.id = photo_id and photos.user_id = auth.uid())
);
create policy "Users can delete own album photos" on public.album_photos for delete using (auth.uid() = user_id);

create policy "Users can read own weight records" on public.weight_records for select using (auth.uid() = user_id);
create policy "Users can insert own weight records" on public.weight_records for insert with check (
  auth.uid() = user_id and exists (select 1 from public.pets where pets.id = pet_id and pets.user_id = auth.uid())
);
create policy "Users can update own weight records" on public.weight_records for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (select 1 from public.pets where pets.id = pet_id and pets.user_id = auth.uid())
);
create policy "Users can delete own weight records" on public.weight_records for delete using (auth.uid() = user_id);

create policy "Users can read own health records" on public.health_records for select using (auth.uid() = user_id);
create policy "Users can insert own health records" on public.health_records for insert with check (
  auth.uid() = user_id and exists (select 1 from public.pets where pets.id = pet_id and pets.user_id = auth.uid())
);
create policy "Users can update own health records" on public.health_records for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (select 1 from public.pets where pets.id = pet_id and pets.user_id = auth.uid())
);
create policy "Users can delete own health records" on public.health_records for delete using (auth.uid() = user_id);
