/** Disposable PostgreSQL proof for Sports fixture capture/mutate/rollback. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

type DisposablePostgres = {
  exec(sql: string): Promise<unknown>;
  query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
};

async function main() {
const moduleArg = process.argv.find((arg) => arg.startsWith("--pglite-module="));
const modulePath = moduleArg?.slice("--pglite-module=".length);
if (!modulePath) {
  throw new Error("--pglite-module=<absolute path to @electric-sql/pglite dist/index.js> is required");
}

const { PGlite } = (await import(pathToFileURL(modulePath).href)) as {
  PGlite: new (location?: string) => {
    exec(sql: string): Promise<unknown>;
    query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
    close(): Promise<void>;
  };
};

const ids = {
  sport: "00000000-0000-4000-8000-000000000001",
  provider: "00000000-0000-4000-8000-000000000002",
  competition: "00000000-0000-4000-8000-000000000003",
  season: "00000000-0000-4000-8000-000000000004",
  home: "00000000-0000-4000-8000-000000000005",
  away: "00000000-0000-4000-8000-000000000006",
  stale: "00000000-0000-4000-8000-000000000010",
  scheduled: "00000000-0000-4000-8000-000000000011",
  finished: "00000000-0000-4000-8000-000000000012",
  newParticipant: "00000000-0000-4000-8000-000000000099",
};

const schema = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table public.sports (id uuid primary key, slug text not null, name text not null);
create table public.sports_providers (
  id uuid primary key, slug text not null unique, name text not null,
  is_enabled boolean not null default false, kill_switch boolean not null default true
);
create table public.sports_worker_checkpoints (
  id uuid primary key default gen_random_uuid(), worker_key text not null unique,
  checkpoint jsonb not null default '{}'::jsonb, locked_until timestamptz,
  last_run_at timestamptz, last_status text, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.sports_competitions (
  id uuid primary key, sport_id uuid not null references public.sports(id),
  provider_id uuid references public.sports_providers(id), provider_external_id text,
  name text not null, slug text not null unique, country_code text,
  status text not null default 'active', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.sports_competition_seasons (
  id uuid primary key, competition_id uuid not null references public.sports_competitions(id),
  name text not null, slug text not null, status text not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (competition_id, slug)
);
create table public.sports_teams (
  id uuid primary key, sport_id uuid not null references public.sports(id),
  provider_id uuid references public.sports_providers(id), provider_external_id text,
  name text not null, slug text not null unique,
  competition_id uuid references public.sports_competitions(id), status text not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.sports_fixtures (
  id uuid primary key, sport_id uuid not null references public.sports(id),
  competition_id uuid references public.sports_competitions(id),
  season_id uuid references public.sports_competition_seasons(id),
  provider_id uuid references public.sports_providers(id), provider_external_id text,
  title text not null, starts_at timestamptz not null, ends_at timestamptz,
  status text not null, metadata jsonb not null default '{}'::jsonb,
  availability_state text, playable boolean not null default false,
  visible boolean not null default true, status_updated_at timestamptz,
  provider_status_fresh_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.sports_fixture_participants (
  id uuid primary key default gen_random_uuid(), fixture_id uuid not null references public.sports_fixtures(id) on delete cascade,
  team_id uuid references public.sports_teams(id), side text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.sports_fixture_scores (
  id uuid primary key default gen_random_uuid(), fixture_id uuid not null references public.sports_fixtures(id) on delete cascade,
  period text not null, home_score numeric, away_score numeric, score_payload jsonb not null default '{}'::jsonb,
  updated_source text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (fixture_id, period)
);
create table public.sports_fixture_provider_ids (
  id uuid primary key default gen_random_uuid(), fixture_id uuid not null references public.sports_fixtures(id) on delete cascade,
  provider_id uuid references public.sports_providers(id), provider_slug text not null,
  provider_external_id text not null, source_priority integer not null default 100,
  last_seen_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (provider_slug, provider_external_id)
);
`;

const seed = `
insert into sports values ('${ids.sport}', 'football', 'Football');
insert into sports_providers values ('${ids.provider}', 'openligadb', 'OpenLigaDB', false, true);
insert into sports_competitions(id,sport_id,provider_id,provider_external_id,name,slug,country_code)
values ('${ids.competition}','${ids.sport}','${ids.provider}','4937','Bundesliga','openligadb-4937','DE');
insert into sports_competition_seasons(id,competition_id,name,slug)
values ('${ids.season}','${ids.competition}','2026','2026');
insert into sports_teams(id,sport_id,provider_id,provider_external_id,name,slug,competition_id) values
('${ids.home}','${ids.sport}','${ids.provider}','40','FC Bayern München','bayern','${ids.competition}'),
('${ids.away}','${ids.sport}','${ids.provider}','16','VfB Stuttgart','stuttgart','${ids.competition}');

insert into sports_fixtures(id,sport_id,provider_id,provider_external_id,title,starts_at,status,metadata,availability_state,playable) values
('${ids.stale}','${ids.sport}','${ids.provider}','old-live','Old Live','2026-08-01T14:00:00Z','live','{"provider_status":"1H"}','live_unavailable',false),
('${ids.scheduled}','${ids.sport}',null,null,'FC Bayern München vs VfB Stuttgart','2026-08-29T13:30:00Z','scheduled','{"source":"legacy"}','upcoming',false),
('${ids.finished}','${ids.sport}','${ids.provider}','finished-1','Finished Match','2026-08-24T14:00:00Z','completed','{"provider_status":"FT"}','finished',false);

insert into sports_fixture_participants(fixture_id,side,metadata) values
('${ids.scheduled}','home','{"name":"FC Bayern München"}'),
('${ids.scheduled}','away','{"name":"VfB Stuttgart"}');
insert into sports_fixture_participants(fixture_id,team_id,side,metadata) values
('${ids.stale}','${ids.home}','home','{}'),
('${ids.stale}','${ids.away}','away','{}');
insert into sports_fixture_scores(fixture_id,period,home_score,away_score,score_payload,updated_source) values
('${ids.stale}','full_time',null,null,'{}','legacy'),
('${ids.finished}','full_time',2,1,'{"status":"finished"}','openligadb');
insert into sports_fixture_provider_ids(fixture_id,provider_id,provider_slug,provider_external_id) values
('${ids.stale}','${ids.provider}','openligadb','old-live'),
('${ids.finished}','${ids.provider}','openligadb','finished-1'),
('${ids.scheduled}','${ids.provider}','openligadb','83156');
`;

async function snapshot(db: DisposablePostgres) {
  const tables = [
    "sports_competitions",
    "sports_competition_seasons",
    "sports_teams",
    "sports_fixtures",
    "sports_fixture_participants",
    "sports_fixture_scores",
    "sports_fixture_provider_ids",
  ];
  const out: Record<string, unknown> = {};
  for (const table of tables) {
    const result = await db.query<{ rows: unknown }>(
      `select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) as rows from public.${table} t`
    );
    out[table] = result.rows[0].rows;
  }
  return out;
}

const db = new PGlite("memory://");
try {
  await db.exec(schema);
  const migration = await readFile(
    path.join(process.cwd(), "supabase/migrations/20260825190000_sports_fixture_recovery.sql"),
    "utf8"
  );
  await db.exec(migration);
  await db.exec(seed);

  const original = await snapshot(db);
  const begin = await db.query<{ id: string }>(
    "select sports_fixture_recovery_begin($1,$2,$3::jsonb) as id",
    ["disposable-recovery-test", "test", JSON.stringify({ disposable: true })]
  );
  const batchId = begin.rows[0].id;
  for (const fixtureId of [ids.stale, ids.scheduled, ids.finished]) {
    await db.query("select sports_fixture_recovery_capture_fixture($1,$2)", [
      batchId,
      fixtureId,
    ]);
  }
  await db.query(
    "select sports_fixture_recovery_capture_entity($1,$2,'participant',$3)",
    [batchId, ids.scheduled, ids.newParticipant]
  );

  await db.exec(`
    update sports_fixtures set status='expired', availability_state='finished', metadata='{"repair":"stale"}' where id='${ids.stale}';
    update sports_fixtures set competition_id='${ids.competition}', season_id='${ids.season}', provider_id='${ids.provider}', provider_external_id='83156' where id='${ids.scheduled}';
    update sports_fixture_participants set team_id='${ids.home}', metadata='{"provider_team_id":"40"}' where fixture_id='${ids.scheduled}' and side='home';
    update sports_fixture_participants set team_id='${ids.away}', metadata='{"provider_team_id":"16"}' where fixture_id='${ids.scheduled}' and side='away';
    update sports_fixture_scores set home_score=9, away_score=9 where fixture_id='${ids.finished}';
    insert into sports_fixture_participants(id,fixture_id,team_id,side,metadata) values ('${ids.newParticipant}','${ids.scheduled}','${ids.home}','other','{}');
    insert into sports_fixture_provider_ids(fixture_id,provider_id,provider_slug,provider_external_id)
      values ('${ids.scheduled}','${ids.provider}','openligadb','83156')
      on conflict(provider_slug,provider_external_id) do update set fixture_id=excluded.fixture_id;
  `);
  await db.query("select sports_fixture_recovery_mark_applied($1)", [batchId]);

  const duplicate = await db.query<{ count: number }>(
    "select count(*)::int as count from sports_fixture_provider_ids where provider_slug='openligadb' and provider_external_id='83156'"
  );
  assert.equal(duplicate.rows[0].count, 1, "provider mapping must remain unique");

  const changed = await snapshot(db);
  assert.notDeepEqual(changed, original, "mutation must alter representative rows");
  await db.query("select sports_fixture_recovery_rollback($1)", [batchId]);
  const restored = await snapshot(db);
  assert.deepEqual(restored, original, "rollback must restore every captured row exactly");

  const security = await db.query<{
    batches_rls: boolean;
    snapshots_rls: boolean;
    anon_write: boolean;
    authenticated_write: boolean;
  }>(`select
    (select relrowsecurity from pg_class where oid='public.sports_fixture_recovery_batches'::regclass) as batches_rls,
    (select relrowsecurity from pg_class where oid='public.sports_fixture_recovery_snapshots'::regclass) as snapshots_rls,
    has_table_privilege('anon','public.sports_fixture_recovery_batches','INSERT') as anon_write,
    has_table_privilege('authenticated','public.sports_fixture_recovery_snapshots','UPDATE') as authenticated_write`);
  assert.equal(security.rows[0].batches_rls, true);
  assert.equal(security.rows[0].snapshots_rls, true);
  assert.equal(security.rows[0].anon_write, false);
  assert.equal(security.rows[0].authenticated_write, false);

  const firstClaim = await db.query<{ claimed: boolean }>(
    "select sports_fixture_scheduler_claim('sports-fixture-scheduler',$1::timestamptz,900) as claimed",
    ["2026-08-25T12:00:00Z"]
  );
  const overlappingClaim = await db.query<{ claimed: boolean }>(
    "select sports_fixture_scheduler_claim('sports-fixture-scheduler',$1::timestamptz,900) as claimed",
    ["2026-08-25T12:01:00Z"]
  );
  assert.equal(firstClaim.rows[0].claimed, true);
  assert.equal(overlappingClaim.rows[0].claimed, false);
  await db.query(
    "select sports_fixture_scheduler_finish('sports-fixture-scheduler','completed',null,'{}'::jsonb,$1::timestamptz)",
    ["2026-08-25T12:02:00Z"]
  );
  const releasedClaim = await db.query<{ claimed: boolean }>(
    "select sports_fixture_scheduler_claim('sports-fixture-scheduler',$1::timestamptz,900) as claimed",
    ["2026-08-25T12:03:00Z"]
  );
  assert.equal(releasedClaim.rows[0].claimed, true);
  const bumped = await db.query<{ version: number }>(
    "select sports_bump_fixture_data_version()::int as version"
  );
  assert.equal(bumped.rows[0].version, 2);

  console.log(
    JSON.stringify({
      exactRecoverability: "PASS",
      staleLiveFixture: "PASS",
      scheduledSyntheticFixture: "PASS",
      finishedFixture: "PASS",
      competitionTeamIdentityCorrection: "PASS",
      duplicateProviderMapping: "PASS",
      newEntityRemoval: "PASS",
      rlsAndClientWriteDenial: "PASS",
      schedulerDatabaseLease: "PASS",
      crossProcessCacheVersion: "PASS",
    })
  );
} finally {
  await db.close();
}
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
