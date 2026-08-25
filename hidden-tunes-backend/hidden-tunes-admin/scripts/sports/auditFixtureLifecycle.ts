/** Read-only, bounded production fixture lifecycle/identity audit. */
import { createClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60_000).toISOString();
  const recent = new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();

  const [live, upcoming, finished, checkpoints] = await Promise.all([
    sb.from("sports_fixtures").select("id,title,status,starts_at,ends_at,provider_id,provider_external_id,competition_id,season_id,sport_id,metadata,status_updated_at,provider_status_fresh_at,created_at,updated_at").eq("status", "live").order("starts_at").limit(20),
    sb.from("sports_fixtures").select("id,title,status,starts_at,ends_at,provider_id,provider_external_id,competition_id,season_id,sport_id,metadata,status_updated_at,provider_status_fresh_at,created_at,updated_at").in("status", ["scheduled", "verified"]).gte("starts_at", now.toISOString()).lte("starts_at", horizon).order("starts_at").limit(100),
    sb.from("sports_fixtures").select("id,title,status,starts_at,ends_at,provider_id,provider_external_id,competition_id,season_id,sport_id,metadata,status_updated_at,provider_status_fresh_at,created_at,updated_at").in("status", ["completed", "expired"]).gte("starts_at", recent).order("starts_at", { ascending: false }).limit(100),
    sb.from("sports_worker_checkpoints").select("worker_key,last_run_at,last_status,last_error,updated_at,checkpoint").order("updated_at", { ascending: false }).limit(50),
  ]);
  for (const result of [live, upcoming, finished, checkpoints]) {
    if (result.error) throw result.error;
  }

  const fixtures = [...(live.data || []), ...(upcoming.data || []), ...(finished.data || [])];
  const identityFixtures = upcoming.data || [];
  const fixtureIds = [...new Set(identityFixtures.map((row) => row.id))];
  const competitionIds = [...new Set(fixtures.map((row) => row.competition_id).filter(Boolean))];
  const providerIds = [...new Set(fixtures.map((row) => row.provider_id).filter(Boolean))];

  const [providerMap, participants, competitions, providers, scores] = await Promise.all([
    fixtureIds.length ? sb.from("sports_fixture_provider_ids").select("fixture_id,provider_id,provider_slug,provider_external_id,last_seen_at,updated_at").in("fixture_id", fixtureIds) : Promise.resolve({ data: [], error: null }),
    fixtureIds.length ? sb.from("sports_fixture_participants").select("fixture_id,team_id,side,metadata,updated_at,sports_teams(id,name,slug,provider_id,provider_external_id,competition_id,country_code,updated_at)").in("fixture_id", fixtureIds) : Promise.resolve({ data: [], error: null }),
    competitionIds.length ? sb.from("sports_competitions").select("id,name,slug,sport_id,provider_id,provider_external_id,country_code,competition_type,status,updated_at").in("id", competitionIds) : Promise.resolve({ data: [], error: null }),
    providerIds.length ? sb.from("sports_providers").select("id,slug,name,is_enabled,kill_switch,health_status,last_health_at,updated_at").in("id", providerIds) : Promise.resolve({ data: [], error: null }),
    fixtureIds.length ? sb.from("sports_fixture_scores").select("fixture_id,period,home_score,away_score,updated_source,updated_at").in("fixture_id", fixtureIds) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [providerMap, participants, competitions, providers, scores]) {
    if (result.error) throw result.error;
  }

  const [repairProviders, repairFixtures] = await Promise.all([
    sb.from("sports_providers").select("id,slug,is_enabled,kill_switch,updated_at").in("slug", ["api_football", "openligadb"]),
    sb.from("sports_fixtures").select("id", { count: "exact", head: true }).filter("metadata->>import_batch", "like", "sports-fixture-repair-%"),
  ]);
  for (const result of [repairProviders, repairFixtures]) {
    if (result.error) throw result.error;
  }

  const compactFixture = (row: JsonRecord) => {
    const metadata = record(row.metadata);
    return {
    id: row.id,
    title: row.title,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    providerId: row.provider_id,
    providerExternalId: row.provider_external_id,
    competitionId: row.competition_id,
    seasonId: row.season_id,
    statusUpdatedAt: row.status_updated_at,
    providerStatusFreshAt: row.provider_status_fresh_at,
    updatedAt: row.updated_at,
    providerStatus: metadata.status_label || metadata.provider_status || null,
    lastSyncedAt: metadata.last_synced_at || null,
    importBatch: metadata.import_batch || null,
    competitionName: metadata.competition_name || null,
    };
  };
  const report = {
    auditedAt: now.toISOString(),
    counts: { live: live.data?.length || 0, upcoming: upcoming.data?.length || 0, recentFinished: finished.data?.length || 0 },
    live: (live.data || []).map(compactFixture),
    upcoming: (upcoming.data || []).map(compactFixture),
    recentFinished: (finished.data || []).map(compactFixture),
    fixtureProviderIds: providerMap.data,
    participants: (participants.data || []).map((row: JsonRecord) => {
      const metadata = record(row.metadata);
      const team = record(row.sports_teams);
      return {
      fixtureId: row.fixture_id,
      side: row.side,
      teamId: row.team_id,
      fallbackName: metadata.name || null,
      providerTeamId:
        metadata.provider_team_id ||
        metadata.providerTeamId ||
        metadata.team_id ||
        null,
      providerSlug: metadata.provider_slug || metadata.provider || null,
      team: Object.keys(team).length
        ? {
            id: team.id,
            name: team.name,
            providerId: team.provider_id,
            providerExternalId: team.provider_external_id,
            competitionId: team.competition_id,
          }
        : null,
      };
    }),
    competitions: competitions.data,
    providers: providers.data,
    repairState: {
      providers: repairProviders.data,
      staleBackupTable: "unavailable_or_unproven",
      repairFixtureCount: repairFixtures.count || 0,
    },
    scores: scores.data,
    checkpoints: (checkpoints.data || []).map((row: JsonRecord) => {
      const checkpoint = record(row.checkpoint);
      return {
        workerKey: row.worker_key,
        lastRunAt: row.last_run_at,
        lastStatus: row.last_status,
        lastError: row.last_error,
        updatedAt: row.updated_at,
        checkpointUpdatedAt: checkpoint.updatedAt || null,
        providersSeen: checkpoint.providersSeen || [],
      };
    }),
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
