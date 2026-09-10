-- Hidden Tunes Global Music Taxonomy
-- Additive only. Existing songs, source, rights, availability, and media columns
-- remain unchanged. The taxonomy is server-owned and clients read it through
-- bounded API routes rather than direct table access.

create table if not exists public.music_taxonomy_terms (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  taxonomy_type text not null,
  parent_id uuid references public.music_taxonomy_terms(id) on delete restrict,
  description text,
  region text,
  status text not null default 'ACTIVE',
  merged_into_term_id uuid references public.music_taxonomy_terms(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint music_taxonomy_terms_type_check check (
    taxonomy_type in (
      'GENRE_FAMILY', 'GENRE', 'SUBGENRE', 'REGIONAL_STYLE',
      'CULTURAL_STYLE', 'MOOD', 'ACTIVITY', 'THEME', 'LANGUAGE',
      'VOCAL_STYLE', 'INSTRUMENT', 'ERA', 'TEMPO_CLASS'
    )
  ),
  constraint music_taxonomy_terms_status_check check (
    status in ('ACTIVE', 'HIDDEN', 'DEPRECATED', 'MERGED')
  ),
  constraint music_taxonomy_terms_merge_check check (
    (status = 'MERGED' and merged_into_term_id is not null)
    or (status <> 'MERGED')
  ),
  constraint music_taxonomy_terms_slug_key unique (taxonomy_type, slug)
);

create index if not exists music_taxonomy_terms_browse_idx
  on public.music_taxonomy_terms (taxonomy_type, status, sort_order, name);
create index if not exists music_taxonomy_terms_parent_idx
  on public.music_taxonomy_terms (parent_id, status, sort_order);
create index if not exists music_taxonomy_terms_merge_idx
  on public.music_taxonomy_terms (merged_into_term_id)
  where merged_into_term_id is not null;

create table if not exists public.music_taxonomy_aliases (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.music_taxonomy_terms(id) on delete cascade,
  taxonomy_type text not null,
  alias text not null,
  normalized_alias text not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint music_taxonomy_aliases_type_check check (
    taxonomy_type in (
      'GENRE_FAMILY', 'GENRE', 'SUBGENRE', 'REGIONAL_STYLE',
      'CULTURAL_STYLE', 'MOOD', 'ACTIVITY', 'THEME', 'LANGUAGE',
      'VOCAL_STYLE', 'INSTRUMENT', 'ERA', 'TEMPO_CLASS'
    )
  ),
  constraint music_taxonomy_aliases_key unique (taxonomy_type, normalized_alias)
);

create index if not exists music_taxonomy_aliases_term_idx
  on public.music_taxonomy_aliases (term_id);

create table if not exists public.music_track_taxonomy (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.songs(id) on delete cascade,
  term_id uuid not null references public.music_taxonomy_terms(id) on delete restrict,
  relationship_type text not null,
  assignment_state text not null default 'ACCEPTED',
  confidence numeric(5,4),
  source text not null default 'OWNER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  actor_id uuid,
  constraint music_track_taxonomy_relationship_check check (
    relationship_type in (
      'PRIMARY_GENRE', 'SECONDARY_GENRE', 'PRIMARY_SUBGENRE', 'SUBGENRE',
      'REGIONAL_STYLE', 'CULTURAL_STYLE', 'MOOD', 'ACTIVITY', 'THEME',
      'LANGUAGE', 'VOCAL_STYLE', 'INSTRUMENT', 'ERA', 'TEMPO_CLASS'
    )
  ),
  constraint music_track_taxonomy_state_check check (
    assignment_state in ('ACCEPTED', 'SUGGESTED', 'REJECTED')
  ),
  constraint music_track_taxonomy_source_check check (
    source in ('OWNER', 'LEGACY', 'IMPORT', 'AUTO', 'SYSTEM')
  ),
  constraint music_track_taxonomy_confidence_check check (
    confidence is null or confidence between 0 and 1
  ),
  constraint music_track_taxonomy_unique_assignment unique
    (track_id, term_id, relationship_type)
);

create index if not exists music_track_taxonomy_track_idx
  on public.music_track_taxonomy (track_id, assignment_state, relationship_type);
create index if not exists music_track_taxonomy_term_idx
  on public.music_track_taxonomy (term_id, assignment_state, relationship_type);
create index if not exists music_track_taxonomy_filter_idx
  on public.music_track_taxonomy (relationship_type, assignment_state, term_id, track_id);

create table if not exists public.music_track_sources (
  track_id uuid primary key references public.songs(id) on delete cascade,
  source_key text not null,
  source_label text not null,
  is_explicit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  actor_id uuid,
  constraint music_track_sources_key_check check (source_key in ('mureka', 'djcity'))
);

create index if not exists music_track_sources_source_idx
  on public.music_track_sources (source_key, track_id);

create table if not exists public.music_track_audio_features (
  track_id uuid primary key references public.songs(id) on delete cascade,
  bpm numeric(6,2),
  musical_key text,
  mode text,
  time_signature text,
  energy numeric(5,4),
  danceability numeric(5,4),
  valence numeric(5,4),
  acousticness numeric(5,4),
  instrumentalness numeric(5,4),
  speechiness numeric(5,4),
  live_feel boolean,
  analysis_status text not null default 'UNANALYZED',
  analysis_source text,
  confidence numeric(5,4),
  analyzed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint music_track_audio_features_range_check check (
    (bpm is null or bpm between 0 and 400)
    and (energy is null or energy between 0 and 1)
    and (danceability is null or danceability between 0 and 1)
    and (valence is null or valence between 0 and 1)
    and (acousticness is null or acousticness between 0 and 1)
    and (instrumentalness is null or instrumentalness between 0 and 1)
    and (speechiness is null or speechiness between 0 and 1)
    and (confidence is null or confidence between 0 and 1)
  )
);

create table if not exists public.music_track_legacy_metadata (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.songs(id) on delete cascade,
  field_name text not null,
  raw_value text not null,
  captured_at timestamptz not null default now(),
  constraint music_track_legacy_metadata_unique unique (track_id, field_name, raw_value)
);

create index if not exists music_track_legacy_metadata_track_idx
  on public.music_track_legacy_metadata (track_id, field_name);

-- Seed the initial global vocabulary. Future terms are managed in Admin. The
-- temporary seed table keeps parent references deterministic without requiring
-- hard-coded UUIDs in migrations.
create temporary table _music_taxonomy_seed (
  taxonomy_type text not null,
  slug text not null,
  name text not null,
  parent_type text,
  parent_slug text,
  region text,
  sort_order integer not null default 0,
  description text
) on commit drop;

insert into _music_taxonomy_seed
  (taxonomy_type, slug, name, parent_type, parent_slug, region, sort_order)
select * from jsonb_to_recordset($seed$
[
  {"taxonomy_type":"GENRE_FAMILY","slug":"pop","name":"Pop","sort_order":10},
  {"taxonomy_type":"GENRE_FAMILY","slug":"hip-hop-rap","name":"Hip-Hop / Rap","sort_order":20},
  {"taxonomy_type":"GENRE_FAMILY","slug":"rnb-soul-funk","name":"R&B / Soul / Funk","sort_order":30},
  {"taxonomy_type":"GENRE_FAMILY","slug":"blues","name":"Blues","sort_order":40},
  {"taxonomy_type":"GENRE_FAMILY","slug":"jazz","name":"Jazz","sort_order":50},
  {"taxonomy_type":"GENRE_FAMILY","slug":"rock","name":"Rock","sort_order":60},
  {"taxonomy_type":"GENRE_FAMILY","slug":"metal","name":"Metal","sort_order":70},
  {"taxonomy_type":"GENRE_FAMILY","slug":"punk-hardcore","name":"Punk / Hardcore","sort_order":80},
  {"taxonomy_type":"GENRE_FAMILY","slug":"electronic-dance","name":"Electronic / Dance","sort_order":90},
  {"taxonomy_type":"GENRE_FAMILY","slug":"house","name":"House","sort_order":100},
  {"taxonomy_type":"GENRE_FAMILY","slug":"techno","name":"Techno","sort_order":110},
  {"taxonomy_type":"GENRE_FAMILY","slug":"trance","name":"Trance","sort_order":120},
  {"taxonomy_type":"GENRE_FAMILY","slug":"drum-bass-jungle","name":"Drum & Bass / Jungle","sort_order":130},
  {"taxonomy_type":"GENRE_FAMILY","slug":"garage","name":"Garage","sort_order":140},
  {"taxonomy_type":"GENRE_FAMILY","slug":"dubstep-bass","name":"Dubstep / Bass","sort_order":150},
  {"taxonomy_type":"GENRE_FAMILY","slug":"ambient-downtempo","name":"Ambient / Downtempo","sort_order":160},
  {"taxonomy_type":"GENRE_FAMILY","slug":"country","name":"Country","sort_order":170},
  {"taxonomy_type":"GENRE_FAMILY","slug":"americana","name":"Americana","sort_order":180},
  {"taxonomy_type":"GENRE_FAMILY","slug":"folk","name":"Folk","sort_order":190},
  {"taxonomy_type":"GENRE_FAMILY","slug":"classical","name":"Classical","sort_order":200},
  {"taxonomy_type":"GENRE_FAMILY","slug":"opera","name":"Opera","sort_order":210},
  {"taxonomy_type":"GENRE_FAMILY","slug":"gospel-christian","name":"Gospel / Christian","sort_order":220},
  {"taxonomy_type":"GENRE_FAMILY","slug":"religious-spiritual","name":"Religious / Spiritual","sort_order":230},
  {"taxonomy_type":"GENRE_FAMILY","slug":"latin","name":"Latin","sort_order":240},
  {"taxonomy_type":"GENRE_FAMILY","slug":"caribbean","name":"Caribbean","sort_order":250},
  {"taxonomy_type":"GENRE_FAMILY","slug":"brazilian","name":"Brazilian","sort_order":260},
  {"taxonomy_type":"GENRE_FAMILY","slug":"african","name":"African","sort_order":270},
  {"taxonomy_type":"GENRE_FAMILY","slug":"middle-eastern-arabic","name":"Middle Eastern / Arabic","sort_order":280},
  {"taxonomy_type":"GENRE_FAMILY","slug":"north-african-maghrebi","name":"North African / Maghrebi","sort_order":290},
  {"taxonomy_type":"GENRE_FAMILY","slug":"south-asian","name":"South Asian","sort_order":300},
  {"taxonomy_type":"GENRE_FAMILY","slug":"east-asian","name":"East Asian","sort_order":310},
  {"taxonomy_type":"GENRE_FAMILY","slug":"southeast-asian","name":"Southeast Asian","sort_order":320},
  {"taxonomy_type":"GENRE_FAMILY","slug":"oceanic-pacific","name":"Oceanic / Pacific","sort_order":330},
  {"taxonomy_type":"GENRE_FAMILY","slug":"indigenous","name":"Indigenous / Diaspora","sort_order":340},
  {"taxonomy_type":"GENRE_FAMILY","slug":"cinematic-soundtrack","name":"Cinematic / Soundtrack","sort_order":350},
  {"taxonomy_type":"GENRE_FAMILY","slug":"children-family","name":"Children / Family","sort_order":360},
  {"taxonomy_type":"GENRE_FAMILY","slug":"experimental","name":"Experimental / Avant-Garde","sort_order":370},
  {"taxonomy_type":"GENRE_FAMILY","slug":"vocal-a-cappella","name":"Vocal / A Cappella","sort_order":380},
  {"taxonomy_type":"GENRE_FAMILY","slug":"instrumental","name":"Instrumental","sort_order":390},
  {"taxonomy_type":"GENRE_FAMILY","slug":"functional-wellness","name":"Functional / Wellness","sort_order":400},

  {"taxonomy_type":"GENRE","slug":"pop","name":"Pop","parent_type":"GENRE_FAMILY","parent_slug":"pop","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"dance-pop","name":"Dance Pop","parent_type":"GENRE_FAMILY","parent_slug":"pop","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"indie-pop","name":"Indie Pop","parent_type":"GENRE_FAMILY","parent_slug":"pop","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"synth-pop","name":"Synth Pop","parent_type":"GENRE_FAMILY","parent_slug":"pop","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"afropop","name":"Afropop","parent_type":"GENRE_FAMILY","parent_slug":"pop","region":"Africa","sort_order":50},
  {"taxonomy_type":"GENRE","slug":"hip-hop","name":"Hip-Hop","parent_type":"GENRE_FAMILY","parent_slug":"hip-hop-rap","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"rap","name":"Rap","parent_type":"GENRE_FAMILY","parent_slug":"hip-hop-rap","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"trap","name":"Trap","parent_type":"GENRE_FAMILY","parent_slug":"hip-hop-rap","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"drill","name":"Drill","parent_type":"GENRE_FAMILY","parent_slug":"hip-hop-rap","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"boom-bap","name":"Boom Bap","parent_type":"GENRE_FAMILY","parent_slug":"hip-hop-rap","sort_order":50},
  {"taxonomy_type":"GENRE","slug":"latin-trap","name":"Latin Trap","parent_type":"GENRE_FAMILY","parent_slug":"hip-hop-rap","region":"Latin America","sort_order":60},
  {"taxonomy_type":"GENRE","slug":"desi-hip-hop","name":"Desi Hip-Hop","parent_type":"GENRE_FAMILY","parent_slug":"hip-hop-rap","region":"South Asia","sort_order":70},
  {"taxonomy_type":"GENRE","slug":"rnb","name":"R&B","parent_type":"GENRE_FAMILY","parent_slug":"rnb-soul-funk","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"soul","name":"Soul","parent_type":"GENRE_FAMILY","parent_slug":"rnb-soul-funk","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"neo-soul","name":"Neo-Soul","parent_type":"GENRE_FAMILY","parent_slug":"rnb-soul-funk","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"funk","name":"Funk","parent_type":"GENRE_FAMILY","parent_slug":"rnb-soul-funk","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"afro-rnb","name":"Afro-R&B","parent_type":"GENRE_FAMILY","parent_slug":"rnb-soul-funk","region":"Africa","sort_order":50},
  {"taxonomy_type":"GENRE","slug":"blues","name":"Blues","parent_type":"GENRE_FAMILY","parent_slug":"blues","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"delta-blues","name":"Delta Blues","parent_type":"GENRE_FAMILY","parent_slug":"blues","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"chicago-blues","name":"Chicago Blues","parent_type":"GENRE_FAMILY","parent_slug":"blues","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"desert-blues","name":"Desert Blues","parent_type":"GENRE_FAMILY","parent_slug":"blues","region":"North Africa","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"jazz","name":"Jazz","parent_type":"GENRE_FAMILY","parent_slug":"jazz","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"bebop","name":"Bebop","parent_type":"GENRE_FAMILY","parent_slug":"jazz","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"smooth-jazz","name":"Smooth Jazz","parent_type":"GENRE_FAMILY","parent_slug":"jazz","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"jazz-fusion","name":"Jazz Fusion","parent_type":"GENRE_FAMILY","parent_slug":"jazz","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"ethio-jazz","name":"Ethio-Jazz","parent_type":"GENRE_FAMILY","parent_slug":"jazz","region":"Ethiopia","sort_order":50},
  {"taxonomy_type":"GENRE","slug":"rock","name":"Rock","parent_type":"GENRE_FAMILY","parent_slug":"rock","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"alternative-rock","name":"Alternative Rock","parent_type":"GENRE_FAMILY","parent_slug":"rock","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"indie-rock","name":"Indie Rock","parent_type":"GENRE_FAMILY","parent_slug":"rock","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"classic-rock","name":"Classic Rock","parent_type":"GENRE_FAMILY","parent_slug":"rock","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"j-rock","name":"J-Rock","parent_type":"GENRE_FAMILY","parent_slug":"rock","region":"Japan","sort_order":50},
  {"taxonomy_type":"GENRE","slug":"anatolian-rock","name":"Anatolian Rock","parent_type":"GENRE_FAMILY","parent_slug":"rock","region":"Turkey","sort_order":60},
  {"taxonomy_type":"GENRE","slug":"metal","name":"Metal","parent_type":"GENRE_FAMILY","parent_slug":"metal","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"heavy-metal","name":"Heavy Metal","parent_type":"GENRE_FAMILY","parent_slug":"metal","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"death-metal","name":"Death Metal","parent_type":"GENRE_FAMILY","parent_slug":"metal","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"black-metal","name":"Black Metal","parent_type":"GENRE_FAMILY","parent_slug":"metal","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"metalcore","name":"Metalcore","parent_type":"GENRE_FAMILY","parent_slug":"metal","sort_order":50},
  {"taxonomy_type":"GENRE","slug":"punk","name":"Punk","parent_type":"GENRE_FAMILY","parent_slug":"punk-hardcore","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"hardcore-punk","name":"Hardcore Punk","parent_type":"GENRE_FAMILY","parent_slug":"punk-hardcore","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"pop-punk","name":"Pop Punk","parent_type":"GENRE_FAMILY","parent_slug":"punk-hardcore","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"electronic","name":"Electronic","parent_type":"GENRE_FAMILY","parent_slug":"electronic-dance","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"edm","name":"EDM","parent_type":"GENRE_FAMILY","parent_slug":"electronic-dance","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"electro","name":"Electro","parent_type":"GENRE_FAMILY","parent_slug":"electronic-dance","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"house","name":"House","parent_type":"GENRE_FAMILY","parent_slug":"house","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"deep-house","name":"Deep House","parent_type":"GENRE_FAMILY","parent_slug":"house","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"tech-house","name":"Tech House","parent_type":"GENRE_FAMILY","parent_slug":"house","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"afro-house","name":"Afro House","parent_type":"GENRE_FAMILY","parent_slug":"house","region":"Africa","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"techno","name":"Techno","parent_type":"GENRE_FAMILY","parent_slug":"techno","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"detroit-techno","name":"Detroit Techno","parent_type":"GENRE_FAMILY","parent_slug":"techno","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"minimal-techno","name":"Minimal Techno","parent_type":"GENRE_FAMILY","parent_slug":"techno","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"trance","name":"Trance","parent_type":"GENRE_FAMILY","parent_slug":"trance","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"psytrance","name":"Psytrance","parent_type":"GENRE_FAMILY","parent_slug":"trance","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"progressive-trance","name":"Progressive Trance","parent_type":"GENRE_FAMILY","parent_slug":"trance","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"drum-and-bass","name":"Drum & Bass","parent_type":"GENRE_FAMILY","parent_slug":"drum-bass-jungle","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"jungle","name":"Jungle","parent_type":"GENRE_FAMILY","parent_slug":"drum-bass-jungle","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"liquid-dnb","name":"Liquid Drum & Bass","parent_type":"GENRE_FAMILY","parent_slug":"drum-bass-jungle","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"uk-garage","name":"UK Garage","parent_type":"GENRE_FAMILY","parent_slug":"garage","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"grime","name":"Grime","parent_type":"GENRE_FAMILY","parent_slug":"garage","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"dubstep","name":"Dubstep","parent_type":"GENRE_FAMILY","parent_slug":"dubstep-bass","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"future-bass","name":"Future Bass","parent_type":"GENRE_FAMILY","parent_slug":"dubstep-bass","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"ambient","name":"Ambient","parent_type":"GENRE_FAMILY","parent_slug":"ambient-downtempo","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"downtempo","name":"Downtempo","parent_type":"GENRE_FAMILY","parent_slug":"ambient-downtempo","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"trip-hop","name":"Trip-Hop","parent_type":"GENRE_FAMILY","parent_slug":"ambient-downtempo","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"country","name":"Country","parent_type":"GENRE_FAMILY","parent_slug":"country","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"country-pop","name":"Country Pop","parent_type":"GENRE_FAMILY","parent_slug":"country","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"bluegrass","name":"Bluegrass","parent_type":"GENRE_FAMILY","parent_slug":"country","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"regional-mexican","name":"Regional Mexican","parent_type":"GENRE_FAMILY","parent_slug":"country","region":"Mexico","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"corridos","name":"Corridos","parent_type":"GENRE_FAMILY","parent_slug":"country","region":"Mexico","sort_order":50},
  {"taxonomy_type":"GENRE","slug":"americana","name":"Americana","parent_type":"GENRE_FAMILY","parent_slug":"americana","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"roots","name":"Roots","parent_type":"GENRE_FAMILY","parent_slug":"americana","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"folk","name":"Folk","parent_type":"GENRE_FAMILY","parent_slug":"folk","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"traditional-folk","name":"Traditional Folk","parent_type":"GENRE_FAMILY","parent_slug":"folk","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"singer-songwriter","name":"Singer-Songwriter","parent_type":"GENRE_FAMILY","parent_slug":"folk","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"classical","name":"Classical","parent_type":"GENRE_FAMILY","parent_slug":"classical","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"orchestral","name":"Orchestral","parent_type":"GENRE_FAMILY","parent_slug":"classical","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"hindustani","name":"Hindustani","parent_type":"GENRE_FAMILY","parent_slug":"classical","region":"South Asia","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"carnatic","name":"Carnatic","parent_type":"GENRE_FAMILY","parent_slug":"classical","region":"South Asia","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"opera","name":"Opera","parent_type":"GENRE_FAMILY","parent_slug":"opera","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"gospel","name":"Gospel","parent_type":"GENRE_FAMILY","parent_slug":"gospel-christian","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"contemporary-christian","name":"Contemporary Christian","parent_type":"GENRE_FAMILY","parent_slug":"gospel-christian","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"worship","name":"Worship","parent_type":"GENRE_FAMILY","parent_slug":"gospel-christian","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"religious","name":"Religious / Spiritual","parent_type":"GENRE_FAMILY","parent_slug":"religious-spiritual","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"reggaeton","name":"Reggaeton","parent_type":"GENRE_FAMILY","parent_slug":"latin","region":"Latin America","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"latin-pop","name":"Latin Pop","parent_type":"GENRE_FAMILY","parent_slug":"latin","region":"Latin America","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"salsa","name":"Salsa","parent_type":"GENRE_FAMILY","parent_slug":"latin","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"bachata","name":"Bachata","parent_type":"GENRE_FAMILY","parent_slug":"latin","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"merengue","name":"Merengue","parent_type":"GENRE_FAMILY","parent_slug":"latin","sort_order":50},
  {"taxonomy_type":"GENRE","slug":"cumbia","name":"Cumbia","parent_type":"GENRE_FAMILY","parent_slug":"latin","sort_order":60},
  {"taxonomy_type":"GENRE","slug":"tango","name":"Tango","parent_type":"GENRE_FAMILY","parent_slug":"latin","sort_order":70},
  {"taxonomy_type":"GENRE","slug":"bolero","name":"Bolero","parent_type":"GENRE_FAMILY","parent_slug":"latin","sort_order":80},
  {"taxonomy_type":"GENRE","slug":"reggae","name":"Reggae","parent_type":"GENRE_FAMILY","parent_slug":"caribbean","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"dancehall","name":"Dancehall","parent_type":"GENRE_FAMILY","parent_slug":"caribbean","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"dub","name":"Dub","parent_type":"GENRE_FAMILY","parent_slug":"caribbean","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"ska","name":"Ska","parent_type":"GENRE_FAMILY","parent_slug":"caribbean","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"calypso","name":"Calypso","parent_type":"GENRE_FAMILY","parent_slug":"caribbean","sort_order":50},
  {"taxonomy_type":"GENRE","slug":"soca","name":"Soca","parent_type":"GENRE_FAMILY","parent_slug":"caribbean","sort_order":60},
  {"taxonomy_type":"GENRE","slug":"zouk","name":"Zouk","parent_type":"GENRE_FAMILY","parent_slug":"caribbean","sort_order":70},
  {"taxonomy_type":"GENRE","slug":"kompa","name":"Kompa","parent_type":"GENRE_FAMILY","parent_slug":"caribbean","sort_order":80},
  {"taxonomy_type":"GENRE","slug":"samba","name":"Samba","parent_type":"GENRE_FAMILY","parent_slug":"brazilian","region":"Brazil","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"pagode","name":"Pagode","parent_type":"GENRE_FAMILY","parent_slug":"brazilian","region":"Brazil","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"bossa-nova","name":"Bossa Nova","parent_type":"GENRE_FAMILY","parent_slug":"brazilian","region":"Brazil","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"mpb","name":"MPB","parent_type":"GENRE_FAMILY","parent_slug":"brazilian","region":"Brazil","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"forro","name":"Forró","parent_type":"GENRE_FAMILY","parent_slug":"brazilian","region":"Brazil","sort_order":50},
  {"taxonomy_type":"GENRE","slug":"baile-funk","name":"Baile Funk","parent_type":"GENRE_FAMILY","parent_slug":"brazilian","region":"Brazil","sort_order":60},
  {"taxonomy_type":"GENRE","slug":"afrobeats","name":"Afrobeats","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"Africa","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"afrobeat","name":"Afrobeat","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"West Africa","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"afro-fusion","name":"Afro-Fusion","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"Africa","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"highlife","name":"Highlife","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"West Africa","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"hiplife","name":"Hiplife","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"Ghana","sort_order":50},
  {"taxonomy_type":"GENRE","slug":"juju","name":"Jùjú","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"Nigeria","sort_order":60},
  {"taxonomy_type":"GENRE","slug":"fuji","name":"Fuji","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"Nigeria","sort_order":70},
  {"taxonomy_type":"GENRE","slug":"soukous","name":"Soukous","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"Central Africa","sort_order":80},
  {"taxonomy_type":"GENRE","slug":"congolese-rumba","name":"Congolese Rumba","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"Central Africa","sort_order":90},
  {"taxonomy_type":"GENRE","slug":"ndombolo","name":"Ndombolo","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"Central Africa","sort_order":100},
  {"taxonomy_type":"GENRE","slug":"amapiano","name":"Amapiano","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"Southern Africa","sort_order":110},
  {"taxonomy_type":"GENRE","slug":"gqom","name":"Gqom","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"South Africa","sort_order":120},
  {"taxonomy_type":"GENRE","slug":"kwaito","name":"Kwaito","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"South Africa","sort_order":130},
  {"taxonomy_type":"GENRE","slug":"makossa","name":"Makossa","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"Cameroon","sort_order":140},
  {"taxonomy_type":"GENRE","slug":"mbalax","name":"Mbalax","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"Senegal","sort_order":150},
  {"taxonomy_type":"GENRE","slug":"bongo-flava","name":"Bongo Flava","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"East Africa","sort_order":160},
  {"taxonomy_type":"GENRE","slug":"singeli","name":"Singeli","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"Tanzania","sort_order":170},
  {"taxonomy_type":"GENRE","slug":"taarab","name":"Taarab","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"East Africa","sort_order":180},
  {"taxonomy_type":"GENRE","slug":"genge","name":"Genge","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"Kenya","sort_order":190},
  {"taxonomy_type":"GENRE","slug":"benga","name":"Benga","parent_type":"GENRE_FAMILY","parent_slug":"african","region":"East Africa","sort_order":200},
  {"taxonomy_type":"GENRE","slug":"rai","name":"Raï","parent_type":"GENRE_FAMILY","parent_slug":"north-african-maghrebi","region":"North Africa","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"chaabi","name":"Chaabi","parent_type":"GENRE_FAMILY","parent_slug":"north-african-maghrebi","region":"North Africa","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"gnawa","name":"Gnawa","parent_type":"GENRE_FAMILY","parent_slug":"north-african-maghrebi","region":"North Africa","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"arabic-pop","name":"Arabic Pop","parent_type":"GENRE_FAMILY","parent_slug":"middle-eastern-arabic","region":"Middle East","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"tarab","name":"Tarab","parent_type":"GENRE_FAMILY","parent_slug":"middle-eastern-arabic","region":"Middle East","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"dabke","name":"Dabke","parent_type":"GENRE_FAMILY","parent_slug":"middle-eastern-arabic","region":"Middle East","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"persian-pop","name":"Persian Pop","parent_type":"GENRE_FAMILY","parent_slug":"middle-eastern-arabic","region":"Persia","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"turkish-pop","name":"Turkish Pop","parent_type":"GENRE_FAMILY","parent_slug":"middle-eastern-arabic","region":"Turkey","sort_order":50},
  {"taxonomy_type":"GENRE","slug":"bollywood","name":"Bollywood","parent_type":"GENRE_FAMILY","parent_slug":"south-asian","region":"India","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"filmi","name":"Filmi","parent_type":"GENRE_FAMILY","parent_slug":"south-asian","region":"South Asia","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"bhangra","name":"Bhangra","parent_type":"GENRE_FAMILY","parent_slug":"south-asian","region":"Punjab","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"ghazal","name":"Ghazal","parent_type":"GENRE_FAMILY","parent_slug":"south-asian","region":"South Asia","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"qawwali","name":"Qawwali","parent_type":"GENRE_FAMILY","parent_slug":"south-asian","region":"South Asia","sort_order":50},
  {"taxonomy_type":"GENRE","slug":"k-pop","name":"K-Pop","parent_type":"GENRE_FAMILY","parent_slug":"east-asian","region":"Korea","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"k-hip-hop","name":"K-Hip-Hop","parent_type":"GENRE_FAMILY","parent_slug":"east-asian","region":"Korea","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"j-pop","name":"J-Pop","parent_type":"GENRE_FAMILY","parent_slug":"east-asian","region":"Japan","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"city-pop","name":"City Pop","parent_type":"GENRE_FAMILY","parent_slug":"east-asian","region":"Japan","sort_order":40},
  {"taxonomy_type":"GENRE","slug":"enka","name":"Enka","parent_type":"GENRE_FAMILY","parent_slug":"east-asian","region":"Japan","sort_order":50},
  {"taxonomy_type":"GENRE","slug":"mandopop","name":"Mandopop","parent_type":"GENRE_FAMILY","parent_slug":"east-asian","region":"China","sort_order":60},
  {"taxonomy_type":"GENRE","slug":"cantopop","name":"Cantopop","parent_type":"GENRE_FAMILY","parent_slug":"east-asian","region":"China","sort_order":70},
  {"taxonomy_type":"GENRE","slug":"dangdut","name":"Dangdut","parent_type":"GENRE_FAMILY","parent_slug":"southeast-asian","region":"Southeast Asia","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"v-pop","name":"V-Pop","parent_type":"GENRE_FAMILY","parent_slug":"southeast-asian","region":"Vietnam","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"pinoy-pop","name":"Pinoy Pop","parent_type":"GENRE_FAMILY","parent_slug":"southeast-asian","region":"Philippines","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"film-score","name":"Film Score","parent_type":"GENRE_FAMILY","parent_slug":"cinematic-soundtrack","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"soundtrack","name":"Soundtrack","parent_type":"GENRE_FAMILY","parent_slug":"cinematic-soundtrack","sort_order":20},
  {"taxonomy_type":"GENRE","slug":"game-music","name":"Game Music","parent_type":"GENRE_FAMILY","parent_slug":"cinematic-soundtrack","sort_order":30},
  {"taxonomy_type":"GENRE","slug":"children-music","name":"Children's Music","parent_type":"GENRE_FAMILY","parent_slug":"children-family","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"experimental","name":"Experimental","parent_type":"GENRE_FAMILY","parent_slug":"experimental","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"a-cappella","name":"A Cappella","parent_type":"GENRE_FAMILY","parent_slug":"vocal-a-cappella","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"instrumental","name":"Instrumental","parent_type":"GENRE_FAMILY","parent_slug":"instrumental","sort_order":10},
  {"taxonomy_type":"GENRE","slug":"wellness","name":"Wellness","parent_type":"GENRE_FAMILY","parent_slug":"functional-wellness","sort_order":10},

  {"taxonomy_type":"SUBGENRE","slug":"afropop","name":"Afropop","parent_type":"GENRE","parent_slug":"afrobeats","region":"Africa","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"afro-fusion","name":"Afro-Fusion","parent_type":"GENRE","parent_slug":"afrobeats","region":"Africa","sort_order":20},
  {"taxonomy_type":"SUBGENRE","slug":"afro-soul","name":"Afro-Soul","parent_type":"GENRE","parent_slug":"afrobeats","region":"Africa","sort_order":30},
  {"taxonomy_type":"SUBGENRE","slug":"afro-hip-hop","name":"Afro-Hip-Hop","parent_type":"GENRE","parent_slug":"afrobeats","region":"Africa","sort_order":40},
  {"taxonomy_type":"SUBGENRE","slug":"afro-rnb","name":"Afro-R&B","parent_type":"GENRE","parent_slug":"afrobeats","region":"Africa","sort_order":50},
  {"taxonomy_type":"SUBGENRE","slug":"private-school-amapiano","name":"Private School Amapiano","parent_type":"GENRE","parent_slug":"amapiano","region":"South Africa","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"vocal-amapiano","name":"Vocal Amapiano","parent_type":"GENRE","parent_slug":"amapiano","region":"South Africa","sort_order":20},
  {"taxonomy_type":"SUBGENRE","slug":"soulful-amapiano","name":"Soulful Amapiano","parent_type":"GENRE","parent_slug":"amapiano","region":"South Africa","sort_order":30},
  {"taxonomy_type":"SUBGENRE","slug":"bacardi","name":"Bacardi","parent_type":"GENRE","parent_slug":"amapiano","region":"South Africa","sort_order":40},
  {"taxonomy_type":"SUBGENRE","slug":"burger-highlife","name":"Burger Highlife","parent_type":"GENRE","parent_slug":"highlife","region":"Ghana","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"palm-wine","name":"Palm-Wine","parent_type":"GENRE","parent_slug":"highlife","region":"West Africa","sort_order":20},
  {"taxonomy_type":"SUBGENRE","slug":"azonto","name":"Azonto","parent_type":"GENRE","parent_slug":"afrobeats","region":"Ghana","sort_order":60},
  {"taxonomy_type":"SUBGENRE","slug":"asakaa","name":"Asakaa","parent_type":"GENRE","parent_slug":"hiplife","region":"Ghana","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"gqom-3-step","name":"3-Step","parent_type":"GENRE","parent_slug":"gqom","region":"South Africa","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"ndombolo-sebene","name":"Sebene","parent_type":"GENRE","parent_slug":"ndombolo","region":"Central Africa","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"corridos-tumbados","name":"Corridos Tumbados","parent_type":"GENRE","parent_slug":"corridos","region":"Mexico","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"roots-reggae","name":"Roots Reggae","parent_type":"GENRE","parent_slug":"reggae","region":"Caribbean","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"lovers-rock","name":"Lovers Rock","parent_type":"GENRE","parent_slug":"reggae","region":"Caribbean","sort_order":20},
  {"taxonomy_type":"SUBGENRE","slug":"baile-funk","name":"Baile Funk","parent_type":"GENRE","parent_slug":"baile-funk","region":"Brazil","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"piseiro","name":"Piseiro","parent_type":"GENRE","parent_slug":"forro","region":"Brazil","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"neo-soul","name":"Neo-Soul","parent_type":"GENRE","parent_slug":"soul","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"contemporary-rnb","name":"Contemporary R&B","parent_type":"GENRE","parent_slug":"rnb","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"deutschrap","name":"Deutschrap","parent_type":"GENRE","parent_slug":"hip-hop","region":"Germany","sort_order":60},
  {"taxonomy_type":"SUBGENRE","slug":"southern-blues","name":"Southern Blues","parent_type":"GENRE","parent_slug":"blues","region":"United States","sort_order":50},
  {"taxonomy_type":"SUBGENRE","slug":"gospel-blues","name":"Gospel Blues","parent_type":"GENRE","parent_slug":"blues","sort_order":60},
  {"taxonomy_type":"SUBGENRE","slug":"liquid-funk","name":"Liquid Funk","parent_type":"GENRE","parent_slug":"liquid-dnb","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"deep-trance","name":"Deep Trance","parent_type":"GENRE","parent_slug":"trance","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"chillout","name":"Chillout","parent_type":"GENRE","parent_slug":"downtempo","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"baroque","name":"Baroque","parent_type":"GENRE","parent_slug":"classical","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"contemporary-worship","name":"Contemporary Worship","parent_type":"GENRE","parent_slug":"worship","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"latin-dembow","name":"Dembow","parent_type":"GENRE","parent_slug":"reggaeton","region":"Caribbean","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"cha-cha-cha","name":"Cha-Cha-Chá","parent_type":"GENRE","parent_slug":"salsa","region":"Caribbean","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"son-cubano","name":"Son Cubano","parent_type":"GENRE","parent_slug":"salsa","region":"Cuba","sort_order":20},
  {"taxonomy_type":"SUBGENRE","slug":"mpb-tropicalia","name":"Tropicália","parent_type":"GENRE","parent_slug":"mpb","region":"Brazil","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"jazz-tizita","name":"Tizita","parent_type":"GENRE","parent_slug":"ethio-jazz","region":"Ethiopia","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"k-rnb","name":"K-R&B","parent_type":"GENRE","parent_slug":"k-pop","region":"Korea","sort_order":10},
  {"taxonomy_type":"SUBGENRE","slug":"trot","name":"Trot","parent_type":"GENRE","parent_slug":"k-pop","region":"Korea","sort_order":20},
  {"taxonomy_type":"SUBGENRE","slug":"visual-kei","name":"Visual Kei","parent_type":"GENRE","parent_slug":"j-rock","region":"Japan","sort_order":10},

  {"taxonomy_type":"REGIONAL_STYLE","slug":"global","name":"Global","sort_order":10},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"africa","name":"Africa","parent_type":"REGIONAL_STYLE","parent_slug":"global","region":"Africa","sort_order":20},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"west-africa","name":"West Africa","parent_type":"REGIONAL_STYLE","parent_slug":"africa","region":"Africa","sort_order":10},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"central-africa","name":"Central Africa","parent_type":"REGIONAL_STYLE","parent_slug":"africa","region":"Africa","sort_order":20},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"east-africa","name":"East Africa","parent_type":"REGIONAL_STYLE","parent_slug":"africa","region":"Africa","sort_order":30},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"southern-africa","name":"Southern Africa","parent_type":"REGIONAL_STYLE","parent_slug":"africa","region":"Africa","sort_order":40},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"north-africa","name":"North Africa","parent_type":"REGIONAL_STYLE","parent_slug":"africa","region":"Africa","sort_order":50},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"caribbean-region","name":"Caribbean","parent_type":"REGIONAL_STYLE","parent_slug":"global","region":"Caribbean","sort_order":30},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"latin-america","name":"Latin America","parent_type":"REGIONAL_STYLE","parent_slug":"global","region":"Latin America","sort_order":40},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"south-america","name":"South America","parent_type":"REGIONAL_STYLE","parent_slug":"latin-america","region":"Latin America","sort_order":10},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"central-america","name":"Central America","parent_type":"REGIONAL_STYLE","parent_slug":"latin-america","region":"Latin America","sort_order":20},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"mexico","name":"Mexico","parent_type":"REGIONAL_STYLE","parent_slug":"latin-america","region":"Latin America","sort_order":30},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"north-america","name":"North America","parent_type":"REGIONAL_STYLE","parent_slug":"global","sort_order":50},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"europe","name":"Europe","parent_type":"REGIONAL_STYLE","parent_slug":"global","sort_order":60},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"middle-east","name":"Middle East","parent_type":"REGIONAL_STYLE","parent_slug":"global","sort_order":70},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"south-asia","name":"South Asia","parent_type":"REGIONAL_STYLE","parent_slug":"global","sort_order":80},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"east-asia","name":"East Asia","parent_type":"REGIONAL_STYLE","parent_slug":"global","sort_order":90},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"southeast-asia","name":"Southeast Asia","parent_type":"REGIONAL_STYLE","parent_slug":"global","sort_order":100},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"oceania-pacific","name":"Oceania / Pacific","parent_type":"REGIONAL_STYLE","parent_slug":"global","sort_order":110},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"indigenous-diaspora","name":"Indigenous / Diaspora","parent_type":"REGIONAL_STYLE","parent_slug":"global","sort_order":120},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"ghana","name":"Ghana","parent_type":"REGIONAL_STYLE","parent_slug":"west-africa","region":"West Africa","sort_order":10},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"nigeria","name":"Nigeria","parent_type":"REGIONAL_STYLE","parent_slug":"west-africa","region":"West Africa","sort_order":20},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"south-africa","name":"South Africa","parent_type":"REGIONAL_STYLE","parent_slug":"southern-africa","region":"Southern Africa","sort_order":10},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"drc","name":"Democratic Republic of the Congo","parent_type":"REGIONAL_STYLE","parent_slug":"central-africa","region":"Central Africa","sort_order":10},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"cameroon","name":"Cameroon","parent_type":"REGIONAL_STYLE","parent_slug":"central-africa","region":"Central Africa","sort_order":20},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"senegal","name":"Senegal","parent_type":"REGIONAL_STYLE","parent_slug":"west-africa","region":"West Africa","sort_order":30},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"jamaica","name":"Jamaica","parent_type":"REGIONAL_STYLE","parent_slug":"caribbean-region","region":"Caribbean","sort_order":10},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"haiti","name":"Haiti","parent_type":"REGIONAL_STYLE","parent_slug":"caribbean-region","region":"Caribbean","sort_order":20},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"cuba","name":"Cuba","parent_type":"REGIONAL_STYLE","parent_slug":"caribbean-region","region":"Caribbean","sort_order":30},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"brazil","name":"Brazil","parent_type":"REGIONAL_STYLE","parent_slug":"south-america","region":"South America","sort_order":10},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"india","name":"India","parent_type":"REGIONAL_STYLE","parent_slug":"south-asia","region":"South Asia","sort_order":10},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"punjab","name":"Punjab","parent_type":"REGIONAL_STYLE","parent_slug":"south-asia","region":"South Asia","sort_order":20},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"korea","name":"Korea","parent_type":"REGIONAL_STYLE","parent_slug":"east-asia","region":"East Asia","sort_order":10},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"japan","name":"Japan","parent_type":"REGIONAL_STYLE","parent_slug":"east-asia","region":"East Asia","sort_order":20},
  {"taxonomy_type":"REGIONAL_STYLE","slug":"china","name":"China","parent_type":"REGIONAL_STYLE","parent_slug":"east-asia","region":"East Asia","sort_order":30},

  {"taxonomy_type":"CULTURAL_STYLE","slug":"afro-diaspora","name":"Afro-Diaspora","sort_order":10},
  {"taxonomy_type":"CULTURAL_STYLE","slug":"pan-african","name":"Pan-African","sort_order":20},
  {"taxonomy_type":"CULTURAL_STYLE","slug":"black-atlantic","name":"Black Atlantic","sort_order":30},
  {"taxonomy_type":"CULTURAL_STYLE","slug":"caribbean-diaspora","name":"Caribbean Diaspora","sort_order":40},
  {"taxonomy_type":"CULTURAL_STYLE","slug":"latin-diaspora","name":"Latin Diaspora","sort_order":50},
  {"taxonomy_type":"CULTURAL_STYLE","slug":"desi-diaspora","name":"Desi Diaspora","sort_order":60},
  {"taxonomy_type":"CULTURAL_STYLE","slug":"arabic-diaspora","name":"Arabic Diaspora","sort_order":70},
  {"taxonomy_type":"CULTURAL_STYLE","slug":"indigenous-traditional","name":"Indigenous / Traditional","sort_order":80},
  {"taxonomy_type":"CULTURAL_STYLE","slug":"spiritual-traditional","name":"Spiritual / Traditional","sort_order":90},
  {"taxonomy_type":"CULTURAL_STYLE","slug":"urban-global","name":"Urban Global","sort_order":100},
  {"taxonomy_type":"CULTURAL_STYLE","slug":"island-culture","name":"Island Culture","sort_order":110},
  {"taxonomy_type":"CULTURAL_STYLE","slug":"east-asian-diaspora","name":"East Asian Diaspora","sort_order":120},
  {"taxonomy_type":"CULTURAL_STYLE","slug":"pacific-island","name":"Pacific Island","sort_order":130},
  {"taxonomy_type":"CULTURAL_STYLE","slug":"global-fusion","name":"Global Fusion","sort_order":140},
  {"taxonomy_type":"CULTURAL_STYLE","slug":"diasporic-club","name":"Diasporic Club","sort_order":150},

  {"taxonomy_type":"MOOD","slug":"happy","name":"Happy","sort_order":10},
  {"taxonomy_type":"MOOD","slug":"joyful","name":"Joyful","sort_order":20},
  {"taxonomy_type":"MOOD","slug":"bright","name":"Bright","sort_order":30},
  {"taxonomy_type":"MOOD","slug":"feel-good","name":"Feel-Good","sort_order":40},
  {"taxonomy_type":"MOOD","slug":"uplifting","name":"Uplifting","sort_order":50},
  {"taxonomy_type":"MOOD","slug":"hopeful","name":"Hopeful","sort_order":60},
  {"taxonomy_type":"MOOD","slug":"celebratory","name":"Celebratory","sort_order":70},
  {"taxonomy_type":"MOOD","slug":"euphoric","name":"Euphoric","sort_order":80},
  {"taxonomy_type":"MOOD","slug":"party","name":"Party","sort_order":100},
  {"taxonomy_type":"MOOD","slug":"club","name":"Club","sort_order":110},
  {"taxonomy_type":"MOOD","slug":"dance","name":"Dance","sort_order":120},
  {"taxonomy_type":"MOOD","slug":"festive","name":"Festive","sort_order":130},
  {"taxonomy_type":"MOOD","slug":"bouncy","name":"Bouncy","sort_order":140},
  {"taxonomy_type":"MOOD","slug":"groovy","name":"Groovy","sort_order":150},
  {"taxonomy_type":"MOOD","slug":"funky","name":"Funky","sort_order":160},
  {"taxonomy_type":"MOOD","slug":"romantic","name":"Romantic","sort_order":200},
  {"taxonomy_type":"MOOD","slug":"loving","name":"Loving","sort_order":210},
  {"taxonomy_type":"MOOD","slug":"passionate","name":"Passionate","sort_order":220},
  {"taxonomy_type":"MOOD","slug":"intimate","name":"Intimate","sort_order":230},
  {"taxonomy_type":"MOOD","slug":"sensual","name":"Sensual","sort_order":240},
  {"taxonomy_type":"MOOD","slug":"tender","name":"Tender","sort_order":250},
  {"taxonomy_type":"MOOD","slug":"sad","name":"Sad","sort_order":300},
  {"taxonomy_type":"MOOD","slug":"melancholic","name":"Melancholic","sort_order":310},
  {"taxonomy_type":"MOOD","slug":"heartbroken","name":"Heartbroken","sort_order":320},
  {"taxonomy_type":"MOOD","slug":"lonely","name":"Lonely","sort_order":330},
  {"taxonomy_type":"MOOD","slug":"bittersweet","name":"Bittersweet","sort_order":340},
  {"taxonomy_type":"MOOD","slug":"nostalgic","name":"Nostalgic","sort_order":350},
  {"taxonomy_type":"MOOD","slug":"somber","name":"Somber","sort_order":360},
  {"taxonomy_type":"MOOD","slug":"grieving","name":"Grieving","sort_order":370},
  {"taxonomy_type":"MOOD","slug":"funeral-mourning","name":"Funeral/Mourning","sort_order":380},
  {"taxonomy_type":"MOOD","slug":"chill","name":"Chill","sort_order":400},
  {"taxonomy_type":"MOOD","slug":"relaxed","name":"Relaxed","sort_order":410},
  {"taxonomy_type":"MOOD","slug":"calm","name":"Calm","sort_order":420},
  {"taxonomy_type":"MOOD","slug":"peaceful","name":"Peaceful","sort_order":430},
  {"taxonomy_type":"MOOD","slug":"mellow","name":"Mellow","sort_order":440},
  {"taxonomy_type":"MOOD","slug":"dreamy","name":"Dreamy","sort_order":450},
  {"taxonomy_type":"MOOD","slug":"atmospheric","name":"Atmospheric","sort_order":460},
  {"taxonomy_type":"MOOD","slug":"energetic","name":"Energetic","sort_order":500},
  {"taxonomy_type":"MOOD","slug":"powerful","name":"Powerful","sort_order":510},
  {"taxonomy_type":"MOOD","slug":"motivational","name":"Motivational","sort_order":520},
  {"taxonomy_type":"MOOD","slug":"inspirational","name":"Inspirational","sort_order":530},
  {"taxonomy_type":"MOOD","slug":"confident","name":"Confident","sort_order":540},
  {"taxonomy_type":"MOOD","slug":"bold","name":"Bold","sort_order":550},
  {"taxonomy_type":"MOOD","slug":"epic","name":"Epic","sort_order":560},
  {"taxonomy_type":"MOOD","slug":"triumphant","name":"Triumphant","sort_order":570},
  {"taxonomy_type":"MOOD","slug":"dark","name":"Dark","sort_order":600},
  {"taxonomy_type":"MOOD","slug":"menacing","name":"Menacing","sort_order":610},
  {"taxonomy_type":"MOOD","slug":"aggressive","name":"Aggressive","sort_order":620},
  {"taxonomy_type":"MOOD","slug":"tense","name":"Tense","sort_order":630},
  {"taxonomy_type":"MOOD","slug":"haunting","name":"Haunting","sort_order":640},
  {"taxonomy_type":"MOOD","slug":"mysterious","name":"Mysterious","sort_order":650},
  {"taxonomy_type":"MOOD","slug":"spiritual","name":"Spiritual","sort_order":700},
  {"taxonomy_type":"MOOD","slug":"worshipful","name":"Worshipful","sort_order":710},
  {"taxonomy_type":"MOOD","slug":"prayerful","name":"Prayerful","sort_order":715},
  {"taxonomy_type":"MOOD","slug":"reflective","name":"Reflective","sort_order":720},
  {"taxonomy_type":"MOOD","slug":"healing","name":"Healing","sort_order":730},
  {"taxonomy_type":"MOOD","slug":"grateful","name":"Grateful","sort_order":740},
  {"taxonomy_type":"MOOD","slug":"soulful","name":"Soulful","sort_order":750},

  {"taxonomy_type":"ACTIVITY","slug":"party","name":"Party","sort_order":10},
  {"taxonomy_type":"ACTIVITY","slug":"dance","name":"Dance","sort_order":20},
  {"taxonomy_type":"ACTIVITY","slug":"workout","name":"Workout","sort_order":30},
  {"taxonomy_type":"ACTIVITY","slug":"running","name":"Running","sort_order":40},
  {"taxonomy_type":"ACTIVITY","slug":"driving","name":"Driving","sort_order":50},
  {"taxonomy_type":"ACTIVITY","slug":"road-trip","name":"Road Trip","sort_order":60},
  {"taxonomy_type":"ACTIVITY","slug":"study","name":"Study","sort_order":70},
  {"taxonomy_type":"ACTIVITY","slug":"focus","name":"Focus","sort_order":80},
  {"taxonomy_type":"ACTIVITY","slug":"work","name":"Work","sort_order":90},
  {"taxonomy_type":"ACTIVITY","slug":"reading","name":"Reading","sort_order":100},
  {"taxonomy_type":"ACTIVITY","slug":"relaxation","name":"Relaxation","sort_order":110},
  {"taxonomy_type":"ACTIVITY","slug":"meditation","name":"Meditation","sort_order":120},
  {"taxonomy_type":"ACTIVITY","slug":"sleep","name":"Sleep","sort_order":130},
  {"taxonomy_type":"ACTIVITY","slug":"morning","name":"Morning","sort_order":140},
  {"taxonomy_type":"ACTIVITY","slug":"night","name":"Night","sort_order":150},
  {"taxonomy_type":"ACTIVITY","slug":"late-night","name":"Late Night","sort_order":160},
  {"taxonomy_type":"ACTIVITY","slug":"dinner","name":"Dinner","sort_order":170},
  {"taxonomy_type":"ACTIVITY","slug":"date-night","name":"Date Night","sort_order":180},
  {"taxonomy_type":"ACTIVITY","slug":"wedding","name":"Wedding","sort_order":190},
  {"taxonomy_type":"ACTIVITY","slug":"celebration","name":"Celebration","sort_order":200},
  {"taxonomy_type":"ACTIVITY","slug":"prayer","name":"Prayer","sort_order":210},
  {"taxonomy_type":"ACTIVITY","slug":"worship","name":"Worship","sort_order":220},
  {"taxonomy_type":"ACTIVITY","slug":"beach","name":"Beach","sort_order":230},
  {"taxonomy_type":"ACTIVITY","slug":"summer","name":"Summer","sort_order":240},
  {"taxonomy_type":"ACTIVITY","slug":"travel","name":"Travel","sort_order":250},
  {"taxonomy_type":"ACTIVITY","slug":"gaming","name":"Gaming","sort_order":260},
  {"taxonomy_type":"ACTIVITY","slug":"pregame","name":"Pregame","sort_order":270},
  {"taxonomy_type":"ACTIVITY","slug":"festival","name":"Festival","sort_order":280},
  {"taxonomy_type":"ACTIVITY","slug":"kids","name":"Kids","sort_order":290},
  {"taxonomy_type":"ACTIVITY","slug":"family","name":"Family","sort_order":300},

  {"taxonomy_type":"THEME","slug":"love","name":"Love","sort_order":10},
  {"taxonomy_type":"THEME","slug":"heartbreak","name":"Heartbreak","sort_order":20},
  {"taxonomy_type":"THEME","slug":"friendship","name":"Friendship","sort_order":30},
  {"taxonomy_type":"THEME","slug":"family","name":"Family","sort_order":40},
  {"taxonomy_type":"THEME","slug":"brotherhood","name":"Brotherhood","sort_order":50},
  {"taxonomy_type":"THEME","slug":"loss","name":"Loss","sort_order":60},
  {"taxonomy_type":"THEME","slug":"grief","name":"Grief","sort_order":70},
  {"taxonomy_type":"THEME","slug":"success","name":"Success","sort_order":80},
  {"taxonomy_type":"THEME","slug":"money","name":"Money","sort_order":90},
  {"taxonomy_type":"THEME","slug":"hustle","name":"Hustle","sort_order":100},
  {"taxonomy_type":"THEME","slug":"street-life","name":"Street Life","sort_order":110},
  {"taxonomy_type":"THEME","slug":"celebration","name":"Celebration","sort_order":120},
  {"taxonomy_type":"THEME","slug":"faith","name":"Faith","sort_order":130},
  {"taxonomy_type":"THEME","slug":"god","name":"God","sort_order":140},
  {"taxonomy_type":"THEME","slug":"hope","name":"Hope","sort_order":150},
  {"taxonomy_type":"THEME","slug":"motivation","name":"Motivation","sort_order":160},
  {"taxonomy_type":"THEME","slug":"freedom","name":"Freedom","sort_order":170},
  {"taxonomy_type":"THEME","slug":"identity","name":"Identity","sort_order":180},
  {"taxonomy_type":"THEME","slug":"culture","name":"Culture","sort_order":190},
  {"taxonomy_type":"THEME","slug":"home","name":"Home","sort_order":200},
  {"taxonomy_type":"THEME","slug":"migration","name":"Migration","sort_order":210},
  {"taxonomy_type":"THEME","slug":"social-commentary","name":"Social Commentary","sort_order":220},
  {"taxonomy_type":"THEME","slug":"mental-wellness","name":"Mental Wellness","sort_order":230},
  {"taxonomy_type":"THEME","slug":"self-love","name":"Self-Love","sort_order":240},
  {"taxonomy_type":"THEME","slug":"nightlife","name":"Nightlife","sort_order":250},
  {"taxonomy_type":"THEME","slug":"life-story","name":"Life Story","sort_order":260},

  {"taxonomy_type":"LANGUAGE","slug":"en","name":"English","sort_order":10},
  {"taxonomy_type":"LANGUAGE","slug":"pcm","name":"Pidgin English","sort_order":20},
  {"taxonomy_type":"LANGUAGE","slug":"twi","name":"Twi","sort_order":30},
  {"taxonomy_type":"LANGUAGE","slug":"gaa","name":"Ga","sort_order":40},
  {"taxonomy_type":"LANGUAGE","slug":"ee","name":"Ewe","sort_order":50},
  {"taxonomy_type":"LANGUAGE","slug":"yo","name":"Yoruba","sort_order":60},
  {"taxonomy_type":"LANGUAGE","slug":"ig","name":"Igbo","sort_order":70},
  {"taxonomy_type":"LANGUAGE","slug":"ha","name":"Hausa","sort_order":80},
  {"taxonomy_type":"LANGUAGE","slug":"ln","name":"Lingala","sort_order":90},
  {"taxonomy_type":"LANGUAGE","slug":"sw","name":"Swahili","sort_order":100},
  {"taxonomy_type":"LANGUAGE","slug":"fr","name":"French","sort_order":110},
  {"taxonomy_type":"LANGUAGE","slug":"pt","name":"Portuguese","sort_order":120},
  {"taxonomy_type":"LANGUAGE","slug":"es","name":"Spanish","sort_order":130},
  {"taxonomy_type":"LANGUAGE","slug":"ar","name":"Arabic","sort_order":140},
  {"taxonomy_type":"LANGUAGE","slug":"de","name":"German","sort_order":150},
  {"taxonomy_type":"LANGUAGE","slug":"jam","name":"Patwa / Jamaican Creole","sort_order":160},
  {"taxonomy_type":"LANGUAGE","slug":"ht","name":"Haitian Creole","sort_order":170},
  {"taxonomy_type":"LANGUAGE","slug":"zu","name":"Zulu","sort_order":180},
  {"taxonomy_type":"LANGUAGE","slug":"xh","name":"Xhosa","sort_order":190},
  {"taxonomy_type":"LANGUAGE","slug":"af","name":"Afrikaans","sort_order":200},
  {"taxonomy_type":"LANGUAGE","slug":"am","name":"Amharic","sort_order":210},
  {"taxonomy_type":"LANGUAGE","slug":"so","name":"Somali","sort_order":220},
  {"taxonomy_type":"LANGUAGE","slug":"hi","name":"Hindi","sort_order":230},
  {"taxonomy_type":"LANGUAGE","slug":"pa","name":"Punjabi","sort_order":240},
  {"taxonomy_type":"LANGUAGE","slug":"ta","name":"Tamil","sort_order":250},
  {"taxonomy_type":"LANGUAGE","slug":"ko","name":"Korean","sort_order":260},
  {"taxonomy_type":"LANGUAGE","slug":"ja","name":"Japanese","sort_order":270},
  {"taxonomy_type":"LANGUAGE","slug":"zh","name":"Mandarin","sort_order":280},
  {"taxonomy_type":"LANGUAGE","slug":"yue","name":"Cantonese","sort_order":290},
  {"taxonomy_type":"LANGUAGE","slug":"tr","name":"Turkish","sort_order":300},
  {"taxonomy_type":"LANGUAGE","slug":"fa","name":"Persian","sort_order":310},

  {"taxonomy_type":"VOCAL_STYLE","slug":"male-vocal","name":"Male Vocal","sort_order":10},
  {"taxonomy_type":"VOCAL_STYLE","slug":"female-vocal","name":"Female Vocal","sort_order":20},
  {"taxonomy_type":"VOCAL_STYLE","slug":"male-female-duet","name":"Male / Female Duet","sort_order":30},
  {"taxonomy_type":"VOCAL_STYLE","slug":"multiple-vocalists","name":"Multiple Vocalists","sort_order":40},
  {"taxonomy_type":"VOCAL_STYLE","slug":"choir","name":"Choir","sort_order":50},
  {"taxonomy_type":"VOCAL_STYLE","slug":"group","name":"Group","sort_order":60},
  {"taxonomy_type":"VOCAL_STYLE","slug":"solo","name":"Solo","sort_order":70},
  {"taxonomy_type":"VOCAL_STYLE","slug":"rap","name":"Rap","sort_order":80},
  {"taxonomy_type":"VOCAL_STYLE","slug":"singing","name":"Singing","sort_order":90},
  {"taxonomy_type":"VOCAL_STYLE","slug":"rap-singing","name":"Rap / Singing","sort_order":100},
  {"taxonomy_type":"VOCAL_STYLE","slug":"spoken-word","name":"Spoken Word","sort_order":110},
  {"taxonomy_type":"VOCAL_STYLE","slug":"instrumental","name":"Instrumental","sort_order":120},
  {"taxonomy_type":"VOCAL_STYLE","slug":"a-cappella","name":"A Cappella","sort_order":130},
  {"taxonomy_type":"VOCAL_STYLE","slug":"falsetto","name":"Falsetto","sort_order":140},
  {"taxonomy_type":"VOCAL_STYLE","slug":"baritone","name":"Baritone","sort_order":150},
  {"taxonomy_type":"VOCAL_STYLE","slug":"tenor","name":"Tenor","sort_order":160},
  {"taxonomy_type":"VOCAL_STYLE","slug":"soprano","name":"Soprano","sort_order":170},
  {"taxonomy_type":"VOCAL_STYLE","slug":"call-and-response","name":"Call-and-Response","sort_order":180},
  {"taxonomy_type":"VOCAL_STYLE","slug":"chant","name":"Chant","sort_order":190},
  {"taxonomy_type":"VOCAL_STYLE","slug":"harmony","name":"Harmony","sort_order":200},
  {"taxonomy_type":"VOCAL_STYLE","slug":"ad-libs","name":"Ad-libs","sort_order":210},

  {"taxonomy_type":"INSTRUMENT","slug":"piano","name":"Piano","sort_order":10},
  {"taxonomy_type":"INSTRUMENT","slug":"electric-piano","name":"Electric Piano","sort_order":20},
  {"taxonomy_type":"INSTRUMENT","slug":"synth","name":"Synth","sort_order":30},
  {"taxonomy_type":"INSTRUMENT","slug":"organ","name":"Organ","sort_order":40},
  {"taxonomy_type":"INSTRUMENT","slug":"hammond","name":"Hammond","sort_order":50},
  {"taxonomy_type":"INSTRUMENT","slug":"acoustic-guitar","name":"Acoustic Guitar","sort_order":60},
  {"taxonomy_type":"INSTRUMENT","slug":"electric-guitar","name":"Electric Guitar","sort_order":70},
  {"taxonomy_type":"INSTRUMENT","slug":"bass","name":"Bass","sort_order":80},
  {"taxonomy_type":"INSTRUMENT","slug":"808","name":"808","sort_order":90},
  {"taxonomy_type":"INSTRUMENT","slug":"drums","name":"Drums","sort_order":100},
  {"taxonomy_type":"INSTRUMENT","slug":"percussion","name":"Percussion","sort_order":110},
  {"taxonomy_type":"INSTRUMENT","slug":"congas","name":"Congas","sort_order":120},
  {"taxonomy_type":"INSTRUMENT","slug":"talking-drum","name":"Talking Drum","sort_order":130},
  {"taxonomy_type":"INSTRUMENT","slug":"djembe","name":"Djembe","sort_order":140},
  {"taxonomy_type":"INSTRUMENT","slug":"shaker","name":"Shaker","sort_order":150},
  {"taxonomy_type":"INSTRUMENT","slug":"saxophone","name":"Saxophone","sort_order":160},
  {"taxonomy_type":"INSTRUMENT","slug":"trumpet","name":"Trumpet","sort_order":170},
  {"taxonomy_type":"INSTRUMENT","slug":"brass","name":"Brass","sort_order":180},
  {"taxonomy_type":"INSTRUMENT","slug":"strings","name":"Strings","sort_order":190},
  {"taxonomy_type":"INSTRUMENT","slug":"violin","name":"Violin","sort_order":200},
  {"taxonomy_type":"INSTRUMENT","slug":"cello","name":"Cello","sort_order":210},
  {"taxonomy_type":"INSTRUMENT","slug":"flute","name":"Flute","sort_order":220},
  {"taxonomy_type":"INSTRUMENT","slug":"harp","name":"Harp","sort_order":230},
  {"taxonomy_type":"INSTRUMENT","slug":"marimba","name":"Marimba","sort_order":240},
  {"taxonomy_type":"INSTRUMENT","slug":"balafon","name":"Balafon","sort_order":250},
  {"taxonomy_type":"INSTRUMENT","slug":"kora","name":"Kora","sort_order":260},
  {"taxonomy_type":"INSTRUMENT","slug":"mbira","name":"Mbira","sort_order":270},
  {"taxonomy_type":"INSTRUMENT","slug":"steelpan","name":"Steelpan","sort_order":280},
  {"taxonomy_type":"INSTRUMENT","slug":"accordion","name":"Accordion","sort_order":290},
  {"taxonomy_type":"INSTRUMENT","slug":"banjo","name":"Banjo","sort_order":300},
  {"taxonomy_type":"INSTRUMENT","slug":"harmonica","name":"Harmonica","sort_order":310},
  {"taxonomy_type":"INSTRUMENT","slug":"orchestra","name":"Orchestra","sort_order":320},
  {"taxonomy_type":"INSTRUMENT","slug":"electronic-drums","name":"Electronic Drums","sort_order":330},

  {"taxonomy_type":"ERA","slug":"traditional","name":"Traditional","sort_order":10},
  {"taxonomy_type":"ERA","slug":"pre-1950","name":"Pre-1950","sort_order":20},
  {"taxonomy_type":"ERA","slug":"1950s","name":"1950s","sort_order":30},
  {"taxonomy_type":"ERA","slug":"1960s","name":"1960s","sort_order":40},
  {"taxonomy_type":"ERA","slug":"1970s","name":"1970s","sort_order":50},
  {"taxonomy_type":"ERA","slug":"1980s","name":"1980s","sort_order":60},
  {"taxonomy_type":"ERA","slug":"1990s","name":"1990s","sort_order":70},
  {"taxonomy_type":"ERA","slug":"2000s","name":"2000s","sort_order":80},
  {"taxonomy_type":"ERA","slug":"2010s","name":"2010s","sort_order":90},
  {"taxonomy_type":"ERA","slug":"2020s","name":"2020s","sort_order":100},
  {"taxonomy_type":"ERA","slug":"contemporary","name":"Contemporary","sort_order":110},
  {"taxonomy_type":"ERA","slug":"retro","name":"Retro","sort_order":120},
  {"taxonomy_type":"ERA","slug":"vintage","name":"Vintage","sort_order":130},
  {"taxonomy_type":"ERA","slug":"modern","name":"Modern","sort_order":140},
  {"taxonomy_type":"ERA","slug":"futuristic","name":"Futuristic","sort_order":150},

  {"taxonomy_type":"TEMPO_CLASS","slug":"very-slow","name":"Very Slow","sort_order":10},
  {"taxonomy_type":"TEMPO_CLASS","slug":"slow","name":"Slow","sort_order":20},
  {"taxonomy_type":"TEMPO_CLASS","slug":"mid-slow","name":"Mid-Slow","sort_order":30},
  {"taxonomy_type":"TEMPO_CLASS","slug":"midtempo","name":"Midtempo","sort_order":40},
  {"taxonomy_type":"TEMPO_CLASS","slug":"upbeat","name":"Upbeat","sort_order":50},
  {"taxonomy_type":"TEMPO_CLASS","slug":"fast","name":"Fast","sort_order":60},
  {"taxonomy_type":"TEMPO_CLASS","slug":"very-fast","name":"Very Fast","sort_order":70}
]$seed$::jsonb)
  as seed(taxonomy_type text, slug text, name text, parent_type text,
          parent_slug text, region text, sort_order integer);

insert into public.music_taxonomy_terms
  (taxonomy_type, slug, name, region, sort_order)
select taxonomy_type, slug, name, region, sort_order
from _music_taxonomy_seed
on conflict (taxonomy_type, slug) do nothing;

update public.music_taxonomy_terms child
set parent_id = parent.id
from _music_taxonomy_seed seed
join public.music_taxonomy_terms parent
  on parent.taxonomy_type = seed.parent_type
 and parent.slug = seed.parent_slug
where child.taxonomy_type = seed.taxonomy_type
  and child.slug = seed.slug
  and seed.parent_type is not null;

insert into public.music_taxonomy_aliases
  (term_id, taxonomy_type, alias, normalized_alias)
select term.id, aliases.taxonomy_type, aliases.alias, aliases.normalized_alias
from (
  values
    ('GENRE','rnb','R&B','r and b'),
    ('GENRE','rnb','RnB','rnb'),
    ('GENRE','drum-and-bass','DnB','dnb'),
    ('GENRE','drum-and-bass','Drum and Bass','drum and bass'),
    ('GENRE','kompa','Compas','compas'),
    ('GENRE','afrobeats','Afro Beats','afro beats'),
    ('GENRE','afrobeats','Afro-pop','afro pop'),
    ('GENRE','afrobeat','Afro Beat','afro beat'),
    ('GENRE','hip-hop','Hip Hop','hip hop'),
    ('GENRE','uk-garage','UKG','ukg'),
    ('GENRE','reggaeton','Reggaetón','reggaeton'),
    ('GENRE','j-pop','JPop','jpop'),
    ('GENRE','k-pop','KPop','kpop'),
    ('LANGUAGE','pcm','Pidgin','pidgin'),
    ('LANGUAGE','jam','Jamaican Creole','jamaican creole'),
    ('REGIONAL_STYLE','drc','DR Congo','dr congo'),
    ('VOCAL_STYLE','male-female-duet','Male/Female Duet','male female duet')
) as aliases(taxonomy_type, slug, alias, normalized_alias)
join public.music_taxonomy_terms term
  on term.taxonomy_type = aliases.taxonomy_type
 and term.slug = aliases.slug
on conflict (taxonomy_type, normalized_alias) do nothing;

-- Keep raw legacy values for traceability. Only exact canonical genre matches
-- are assigned automatically; ambiguous values remain visible for review.
insert into public.music_track_legacy_metadata (track_id, field_name, raw_value)
select id, 'genre', trim(genre)
from public.songs
where nullif(trim(genre), '') is not null
on conflict (track_id, field_name, raw_value) do nothing;

insert into public.music_track_legacy_metadata (track_id, field_name, raw_value)
select id, 'mood', trim(mood)
from public.songs
where nullif(trim(mood), '') is not null
on conflict (track_id, field_name, raw_value) do nothing;

with exact_genres as (
  select distinct on (songs.id)
    songs.id as track_id,
    terms.id as term_id
  from public.songs
  join public.music_taxonomy_terms terms
    on terms.taxonomy_type = 'GENRE'
   and lower(terms.name) = lower(trim(songs.genre))
   and terms.status = 'ACTIVE'
  where nullif(trim(songs.genre), '') is not null
  order by songs.id, terms.sort_order, terms.id
)
insert into public.music_track_taxonomy
  (track_id, term_id, relationship_type, confidence, source)
select track_id, term_id, 'PRIMARY_GENRE', 1, 'LEGACY'
from exact_genres
on conflict (track_id, term_id, relationship_type) do nothing;

with exact_moods as (
  select distinct on (songs.id)
    songs.id as track_id,
    terms.id as term_id
  from public.songs
  join public.music_taxonomy_terms terms
    on terms.taxonomy_type = 'MOOD'
   and lower(terms.name) = lower(trim(songs.mood))
   and terms.status = 'ACTIVE'
  where nullif(trim(songs.mood), '') is not null
  order by songs.id, terms.sort_order, terms.id
)
insert into public.music_track_taxonomy
  (track_id, term_id, relationship_type, confidence, source)
select track_id, term_id, 'MOOD', 1, 'LEGACY'
from exact_moods
on conflict (track_id, term_id, relationship_type) do nothing;

create or replace function public.replace_music_track_classification(
  p_track_id uuid,
  p_assignments jsonb,
  p_features jsonb default '{}'::jsonb,
  p_actor_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.songs where id = p_track_id) then
    raise exception 'track_not_found';
  end if;

  if jsonb_typeof(coalesce(p_assignments, '[]'::jsonb)) <> 'array' then
    raise exception 'assignments_must_be_array';
  end if;

  delete from public.music_track_taxonomy
  where track_id = p_track_id
    and assignment_state = 'ACCEPTED';

  insert into public.music_track_taxonomy
    (track_id, term_id, relationship_type, assignment_state, confidence, source, actor_id)
  select
    p_track_id,
    assignment.term_id,
    assignment.relationship_type,
    coalesce(assignment.assignment_state, 'ACCEPTED'),
    assignment.confidence,
    coalesce(assignment.source, 'OWNER'),
    p_actor_id
  from jsonb_to_recordset(coalesce(p_assignments, '[]'::jsonb)) as assignment(
    term_id uuid,
    relationship_type text,
    assignment_state text,
    confidence numeric,
    source text
  )
  on conflict (track_id, term_id, relationship_type) do update set
    assignment_state = excluded.assignment_state,
    confidence = excluded.confidence,
    source = excluded.source,
    actor_id = excluded.actor_id,
    updated_at = now();

  if jsonb_typeof(coalesce(p_features, '{}'::jsonb)) = 'object'
     and p_features <> '{}'::jsonb then
    insert into public.music_track_audio_features (
      track_id, bpm, musical_key, mode, time_signature, energy, danceability,
      valence, acousticness, instrumentalness, speechiness, live_feel,
      analysis_status, analysis_source, confidence, updated_at
    ) values (
      p_track_id,
      nullif(p_features->>'bpm', '')::numeric,
      nullif(p_features->>'musicalKey', ''),
      nullif(p_features->>'mode', ''),
      nullif(p_features->>'timeSignature', ''),
      nullif(p_features->>'energy', '')::numeric,
      nullif(p_features->>'danceability', '')::numeric,
      nullif(p_features->>'valence', '')::numeric,
      nullif(p_features->>'acousticness', '')::numeric,
      nullif(p_features->>'instrumentalness', '')::numeric,
      nullif(p_features->>'speechiness', '')::numeric,
      case when p_features ? 'liveFeel' then (p_features->>'liveFeel')::boolean else null end,
      coalesce(nullif(p_features->>'analysisStatus', ''), 'MANUAL'),
      nullif(p_features->>'analysisSource', ''),
      nullif(p_features->>'confidence', '')::numeric,
      now()
    )
    on conflict (track_id) do update set
      bpm = excluded.bpm,
      musical_key = excluded.musical_key,
      mode = excluded.mode,
      time_signature = excluded.time_signature,
      energy = excluded.energy,
      danceability = excluded.danceability,
      valence = excluded.valence,
      acousticness = excluded.acousticness,
      instrumentalness = excluded.instrumentalness,
      speechiness = excluded.speechiness,
      live_feel = excluded.live_feel,
      analysis_status = excluded.analysis_status,
      analysis_source = excluded.analysis_source,
      confidence = excluded.confidence,
      updated_at = now();
  end if;
end;
$$;

-- Merging is explicit and non-destructive. Assignments and aliases are
-- redirected to the target, duplicate rows are coalesced, and the source
-- term remains as a history node marked MERGED.
create or replace function public.merge_music_taxonomy_term(
  p_source_term_id uuid,
  p_target_term_id uuid,
  p_actor_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  source_term public.music_taxonomy_terms%rowtype;
  target_term public.music_taxonomy_terms%rowtype;
  would_cycle boolean;
begin
  if p_source_term_id = p_target_term_id then
    raise exception 'taxonomy_merge_same_term';
  end if;

  select * into source_term
  from public.music_taxonomy_terms
  where id = p_source_term_id
  for update;

  select * into target_term
  from public.music_taxonomy_terms
  where id = p_target_term_id
  for update;

  if source_term.id is null or target_term.id is null then
    raise exception 'taxonomy_merge_term_not_found';
  end if;
  if source_term.taxonomy_type <> target_term.taxonomy_type then
    raise exception 'taxonomy_merge_type_mismatch';
  end if;
  if source_term.status = 'MERGED' then
    raise exception 'taxonomy_merge_source_already_merged';
  end if;
  if target_term.status <> 'ACTIVE' then
    raise exception 'taxonomy_merge_target_not_active';
  end if;

  with recursive descendants(id) as (
    select id
    from public.music_taxonomy_terms
    where parent_id = p_source_term_id
    union all
    select child.id
    from public.music_taxonomy_terms child
    join descendants parent on child.parent_id = parent.id
  )
  select exists(select 1 from descendants where id = p_target_term_id)
  into would_cycle;

  if would_cycle then
    raise exception 'taxonomy_merge_would_create_cycle';
  end if;

  delete from public.music_taxonomy_aliases source_alias
  using public.music_taxonomy_aliases target_alias
  where source_alias.term_id = p_source_term_id
    and target_alias.term_id = p_target_term_id
    and source_alias.taxonomy_type = target_alias.taxonomy_type
    and source_alias.normalized_alias = target_alias.normalized_alias;

  update public.music_taxonomy_aliases
  set term_id = p_target_term_id
  where term_id = p_source_term_id;

  delete from public.music_track_taxonomy source_assignment
  using public.music_track_taxonomy target_assignment
  where source_assignment.term_id = p_source_term_id
    and target_assignment.term_id = p_target_term_id
    and source_assignment.track_id = target_assignment.track_id
    and source_assignment.relationship_type = target_assignment.relationship_type;

  update public.music_track_taxonomy
  set term_id = p_target_term_id,
      updated_at = now()
  where term_id = p_source_term_id;

  update public.music_taxonomy_terms
  set parent_id = p_target_term_id,
      updated_at = now()
  where parent_id = p_source_term_id;

  update public.music_taxonomy_terms
  set status = 'MERGED',
      merged_into_term_id = p_target_term_id,
      updated_at = now()
  where id = p_source_term_id;
end;
$$;

revoke all on table public.music_taxonomy_terms from public, anon, authenticated;
revoke all on table public.music_taxonomy_aliases from public, anon, authenticated;
revoke all on table public.music_track_taxonomy from public, anon, authenticated;
revoke all on table public.music_track_sources from public, anon, authenticated;
revoke all on table public.music_track_audio_features from public, anon, authenticated;
revoke all on table public.music_track_legacy_metadata from public, anon, authenticated;

grant select, insert, update on table public.music_taxonomy_terms to service_role;
grant select, insert, update, delete on table public.music_taxonomy_aliases to service_role;
grant select, insert, update, delete on table public.music_track_taxonomy to service_role;
grant select, insert, update, delete on table public.music_track_sources to service_role;
grant select, insert, update, delete on table public.music_track_audio_features to service_role;
grant select, insert, update, delete on table public.music_track_legacy_metadata to service_role;
revoke all on function public.replace_music_track_classification(uuid, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.replace_music_track_classification(uuid, jsonb, jsonb, uuid)
  to service_role;
revoke all on function public.merge_music_taxonomy_term(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.merge_music_taxonomy_term(uuid, uuid, uuid)
  to service_role;

comment on table public.music_taxonomy_terms is
  'Canonical, globally extensible music taxonomy. Terms are disabled or merged, never destructively deleted while assigned.';
comment on table public.music_track_taxonomy is
  'Many-to-many accepted and suggested music classifications. Does not change source, rights, license, or availability.';
comment on table public.music_track_sources is
  'Music provenance only. Separate from songs storage fields and rights/provider cohorts.';
comment on table public.music_track_legacy_metadata is
  'Immutable-at-ingest raw legacy labels retained for audit and deterministic migration review.';
