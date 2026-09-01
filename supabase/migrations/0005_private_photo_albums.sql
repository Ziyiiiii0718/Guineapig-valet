-- Harden the dormant album tables for private many-to-many photo organization.

alter table public.albums
add constraint albums_title_phase3_check
check (title = trim(title) and char_length(title) between 1 and 80);

alter table public.albums
add constraint albums_description_phase3_check
check (
  description is null
  or (
    description = trim(description)
    and char_length(description) between 1 and 500
  )
);

alter table public.albums
add constraint albums_id_user_id_key unique (id, user_id);

alter table public.photos
add constraint photos_id_user_id_key unique (id, user_id);

alter table public.album_photos
add constraint album_photos_album_owner_fkey
foreign key (album_id, user_id)
references public.albums(id, user_id)
on delete cascade;

alter table public.album_photos
add constraint album_photos_photo_owner_fkey
foreign key (photo_id, user_id)
references public.photos(id, user_id)
on delete cascade;

create index album_photos_album_created_idx
on public.album_photos(album_id, created_at desc, photo_id desc);

create index album_photos_photo_user_idx
on public.album_photos(photo_id, user_id, album_id);

create index albums_user_updated_idx
on public.albums(user_id, updated_at desc, id desc);
