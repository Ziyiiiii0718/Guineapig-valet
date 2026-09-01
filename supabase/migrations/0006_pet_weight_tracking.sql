-- Harden existing weight records for private per-pet calendar-date tracking.

alter table public.weight_records
add constraint weight_records_guinea_pig_range_check
check (weight_grams between 100 and 5000);

alter table public.pets
add constraint pets_id_user_id_key unique (id, user_id);

alter table public.weight_records
add constraint weight_records_pet_owner_fkey
foreign key (pet_id, user_id)
references public.pets(id, user_id)
on delete cascade;

create index weight_records_pet_history_idx
on public.weight_records(user_id, pet_id, recorded_at desc, created_at desc, id desc);
