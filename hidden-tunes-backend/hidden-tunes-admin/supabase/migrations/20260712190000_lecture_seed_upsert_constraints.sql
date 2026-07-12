begin;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lecture_items_source_key_unique'
      and conrelid = 'public.lecture_items'::regclass
  ) then
    alter table public.lecture_items
      add constraint lecture_items_source_key_unique
      unique (source_key);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lecture_files_source_key_unique'
      and conrelid = 'public.lecture_files'::regclass
  ) then
    alter table public.lecture_files
      add constraint lecture_files_source_key_unique
      unique (source_key);
  end if;
end $$;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

commit;
