-- Additive Artist Profile release taxonomy.
-- Safe to run once (IF NOT EXISTS). Does not drop or rewrite existing album rows.

begin;

alter table public.albums
  add column if not exists release_type text;

update public.albums
set release_type = 'unknown'
where release_type is null;

alter table public.albums
  alter column release_type set default 'unknown';

alter table public.albums
  alter column release_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'albums_release_type_check'
  ) then
    alter table public.albums
      add constraint albums_release_type_check
      check (
        release_type in (
          'album',
          'single',
          'ep',
          'compilation',
          'live',
          'soundtrack',
          'appearance',
          'unknown'
        )
      );
  end if;
end $$;

create index if not exists albums_artist_release_type_idx
  on public.albums (artist_id, release_type, created_at desc);

notify pgrst, 'reload schema';

commit;
