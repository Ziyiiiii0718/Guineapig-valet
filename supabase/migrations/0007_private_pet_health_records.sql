-- Evolve the existing health table into private, categorized pet history.

alter table public.health_records
add column record_type text,
add column notes text;

update public.health_records
set record_type = case
  when vet_visit then 'vet_visit'
  when nullif(trim(medication), '') is not null then 'medication'
  when nullif(trim(treatment_notes), '') is not null then 'treatment'
  when nullif(trim(symptoms), '') is not null then 'symptom'
  else 'general'
end,
notes = nullif(concat_ws(E'\n',
  nullif(trim(symptoms), ''),
  nullif(trim(medication), ''),
  nullif(trim(treatment_notes), ''),
  nullif(trim(additional_notes), '')
), '');

alter table public.health_records
alter column record_type set not null,
add constraint health_records_type_check check (
  record_type in ('symptom', 'vet_visit', 'medication', 'treatment', 'general')
),
add constraint health_records_notes_length_check check (
  notes is null or char_length(notes) <= 4000
),
add constraint health_records_pet_owner_fkey
foreign key (pet_id, user_id)
references public.pets(id, user_id)
on delete cascade;

create index health_records_history_v2_idx
on public.health_records(user_id, pet_id, record_date desc, created_at desc, id desc);
