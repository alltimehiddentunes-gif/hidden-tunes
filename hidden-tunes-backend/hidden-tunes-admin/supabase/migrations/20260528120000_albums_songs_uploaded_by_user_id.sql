-- Hidden Tunes uploader ownership columns (albums + songs)
-- Safe additive migration: nullable UUID columns, optional FK to uploader_profiles.

alter table public.albums
  add column if not exists uploaded_by_user_id uuid;

alter table public.songs
  add column if not exists uploaded_by_user_id uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'uploader_profiles'
  ) then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'albums_uploaded_by_user_id_fkey'
    ) then
      alter table public.albums
        add constraint albums_uploaded_by_user_id_fkey
        foreign key (uploaded_by_user_id)
        references public.uploader_profiles (id)
        on delete set null;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'songs_uploaded_by_user_id_fkey'
    ) then
      alter table public.songs
        add constraint songs_uploaded_by_user_id_fkey
        foreign key (uploaded_by_user_id)
        references public.uploader_profiles (id)
        on delete set null;
    end if;
  end if;
end
$$;

create index if not exists albums_uploaded_by_user_id_idx
  on public.albums (uploaded_by_user_id);

create index if not exists songs_uploaded_by_user_id_idx
  on public.songs (uploaded_by_user_id);

comment on column public.albums.uploaded_by_user_id is
  'Uploader profile that owns this release row. Nullable for legacy catalog rows.';

comment on column public.songs.uploaded_by_user_id is
  'Uploader profile that owns this track row. Nullable for legacy catalog rows.';

notify pgrst, 'reload schema';
