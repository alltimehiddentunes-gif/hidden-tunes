-- Motivationals category program-summary browse.
-- Additive only: creates RPC + supporting indexes. Does not alter or drop existing data.

begin;

-- Identity lookup when program_identity_key is backfilled later.
create index if not exists motivation_items_program_identity_key_idx
  on public.motivation_items (program_identity_key)
  where program_identity_key is not null and length(trim(program_identity_key)) > 0;

-- Category public browse helper (matches listMotivationItems public filters).
create index if not exists motivation_items_category_program_browse_idx
  on public.motivation_items (
    category_slug,
    is_featured desc,
    sort_order desc,
    published_at desc nulls last,
    id asc
  )
  where status = 'approved'
    and is_active = true
    and is_verified = true
    and playback_status = 'playable'
    and is_mature = false
    and content_classification = 'accept'
    and reliability_score >= 60;

create or replace function public.motivation_program_title_from_item(p_title text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      trim(
        both from
        (regexp_match(coalesce(p_title, ''), E'^(.+?)\\s+[—–-]\\s+'))[1]
      ),
      ''
    ),
    nullif(trim(both from coalesce(p_title, '')), ''),
    'Untitled'
  );
$$;

create or replace function public.motivation_program_key_from_item(
  p_program_id uuid,
  p_program_identity_key text,
  p_title text,
  p_speaker_name text,
  p_channel_name text
)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(p_program_id::text, ''),
    nullif(trim(both from coalesce(p_program_identity_key, '')), ''),
    lower(public.motivation_program_title_from_item(p_title))
      || '|'
      || lower(
        trim(
          both from coalesce(
            nullif(p_speaker_name, ''),
            nullif(p_channel_name, ''),
            ''
          )
        )
      )
  );
$$;

create or replace function public.motivation_list_category_program_summaries(
  p_category_slug text,
  p_page integer default 1,
  p_limit integer default 24
)
returns table (
  program_id text,
  title text,
  speaker text,
  organization text,
  artwork_url text,
  episode_count integer,
  category_slug text,
  first_item_id uuid,
  media_type text,
  source text,
  series_title text,
  volume_count integer,
  is_featured boolean,
  sort_order integer,
  published_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(both from coalesce(p_category_slug, '')));
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_limit integer := least(40, greatest(1, coalesce(p_limit, 24)));
  v_offset integer;
  v_category_name text;
begin
  if v_slug = '' then
    raise exception 'category slug required';
  end if;

  v_offset := (v_page - 1) * v_limit;
  v_category_name := replace(v_slug, '-', ' ');

  return query
  with eligible as (
    select
      mi.id,
      mi.program_id,
      mi.program_identity_key,
      mi.title,
      mi.speaker_name,
      mi.channel_name,
      mi.thumbnail_url,
      mi.media_type,
      mi.source_type,
      mi.category_slug,
      mi.season_number,
      mi.is_featured,
      mi.sort_order,
      mi.published_at,
      public.motivation_program_key_from_item(
        mi.program_id,
        mi.program_identity_key,
        mi.title,
        mi.speaker_name,
        mi.channel_name
      ) as program_key,
      public.motivation_program_title_from_item(mi.title) as program_title
    from public.motivation_items mi
    where mi.status = 'approved'
      and mi.is_active = true
      and mi.is_verified = true
      and mi.playback_status = 'playable'
      and mi.is_mature = false
      and mi.content_classification = 'accept'
      and coalesce(mi.reliability_score, 0) >= 60
      and (
        mi.category_slug = v_slug
        or (
          mi.categories is not null
          and mi.categories @> array[v_slug]::text[]
        )
        or mi.category ilike v_category_name
      )
  ),
  counts as (
    select
      e.program_key,
      count(*)::integer as episode_count,
      greatest(
        1,
        count(distinct e.season_number) filter (where e.season_number is not null)
      )::integer as volume_count,
      bool_or(e.is_featured) as any_featured,
      max(e.sort_order)::integer as max_sort,
      max(e.published_at) as max_published
    from eligible e
    group by e.program_key
  ),
  representatives as (
    select distinct on (e.program_key)
      e.program_key,
      e.program_id,
      e.program_title,
      e.speaker_name,
      e.channel_name,
      e.thumbnail_url,
      e.id as first_item_id,
      e.media_type,
      e.source_type,
      e.category_slug
    from eligible e
    order by
      e.program_key,
      e.sort_order desc nulls last,
      e.published_at desc nulls last,
      e.id asc
  ),
  joined as (
    select
      case
        when r.program_id is not null then r.program_id::text
        else null
      end as program_id,
      r.program_title as title,
      coalesce(nullif(r.speaker_name, ''), nullif(r.channel_name, '')) as speaker,
      null::text as organization,
      r.thumbnail_url as artwork_url,
      c.episode_count,
      coalesce(nullif(r.category_slug, ''), v_slug) as category_slug,
      r.first_item_id,
      coalesce(nullif(r.media_type, ''), 'audio') as media_type,
      r.source_type as source,
      r.program_title as series_title,
      c.volume_count,
      c.any_featured as is_featured,
      c.max_sort as sort_order,
      c.max_published as published_at,
      r.program_key
    from representatives r
    join counts c using (program_key)
  ),
  ordered as (
    select
      j.*,
      count(*) over() as total_count
    from joined j
    order by
      j.is_featured desc,
      j.sort_order desc nulls last,
      j.published_at desc nulls last,
      j.program_key asc
  )
  select
    o.program_id,
    o.title,
    o.speaker,
    o.organization,
    o.artwork_url,
    o.episode_count,
    o.category_slug,
    o.first_item_id,
    o.media_type,
    o.source,
    o.series_title,
    o.volume_count,
    o.is_featured,
    o.sort_order,
    o.published_at,
    o.total_count
  from ordered o
  offset v_offset
  limit v_limit;
end;
$$;

revoke all on function public.motivation_list_category_program_summaries(text, integer, integer) from public;
grant execute on function public.motivation_list_category_program_summaries(text, integer, integer) to service_role;
grant execute on function public.motivation_list_category_program_summaries(text, integer, integer) to authenticated;
grant execute on function public.motivation_list_category_program_summaries(text, integer, integer) to anon;

comment on function public.motivation_list_category_program_summaries(text, integer, integer) is
  'Paginated Motivationals category program summaries for mobile browse (view=programs).';

commit;
