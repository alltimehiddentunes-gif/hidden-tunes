-- Additive canonical geography / delivery fields for worldwide radio expansion.
-- Idempotent: safe to re-run. Non-destructive. No backfill of city/coordinates.
-- Does not alter public API response shape. Unknown geography remains null.
--
-- ROLLBACK (manual, only if required):
--   alter table public.radio_stations
--     drop column if exists city,
--     drop column if exists latitude,
--     drop column if exists longitude,
--     drop column if exists timezone,
--     drop column if exists delivery_mode,
--     drop column if exists consecutive_successes,
--     drop column if exists metadata_confidence,
--     drop column if exists aliases,
--     drop column if exists broadcaster_name,
--     drop column if exists resolved_stream_url,
--     drop column if exists sample_rate,
--     drop column if exists is_hls,
--     drop column if exists last_verified_at,
--     drop column if exists final_resolved_host,
--     drop column if exists latency_ms,
--     drop column if exists geography_confidence,
--     drop column if exists geography_provenance;
--   drop index if exists radio_stations_city_idx;
--   drop index if exists radio_stations_country_state_city_idx;
--   alter table public.radio_stations drop constraint if exists radio_stations_delivery_mode_check;
--   alter table public.radio_stations drop constraint if exists radio_stations_geography_confidence_check;

alter table if exists public.radio_stations
  add column if not exists city text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists timezone text,
  add column if not exists delivery_mode text,
  add column if not exists consecutive_successes integer not null default 0,
  add column if not exists metadata_confidence numeric,
  add column if not exists aliases text[] not null default '{}'::text[],
  add column if not exists broadcaster_name text,
  add column if not exists resolved_stream_url text,
  add column if not exists sample_rate integer,
  add column if not exists is_hls boolean,
  add column if not exists last_verified_at timestamptz,
  add column if not exists final_resolved_host text,
  add column if not exists latency_ms integer,
  add column if not exists geography_confidence numeric,
  add column if not exists geography_provenance text;

-- Partial index: only rows that actually have a city (avoids full-table rewrite cost on empty column).
create index if not exists radio_stations_city_idx
  on public.radio_stations (city)
  where city is not null and city <> '';

create index if not exists radio_stations_country_state_city_idx
  on public.radio_stations (country_code, state, city);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'radio_stations_delivery_mode_check'
      and conrelid = 'public.radio_stations'::regclass
  ) then
    alter table public.radio_stations
      add constraint radio_stations_delivery_mode_check
      check (
        delivery_mode is null
        or delivery_mode in ('direct_https', 'backend_relay', 'hls', 'unsupported')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'radio_stations_geography_confidence_check'
      and conrelid = 'public.radio_stations'::regclass
  ) then
    alter table public.radio_stations
      add constraint radio_stations_geography_confidence_check
      check (
        geography_confidence is null
        or (geography_confidence >= 0 and geography_confidence <= 1)
      );
  end if;
end $$;
