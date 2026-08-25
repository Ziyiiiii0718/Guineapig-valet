-- Editable user-facing photo names remain separate from original filenames and Storage paths.

alter table public.photos
add column if not exists display_name text;

alter table public.photos
add constraint photos_display_name_check
check (
  display_name is null
  or (
    display_name = trim(display_name)
    and char_length(display_name) between 1 and 80
  )
);
