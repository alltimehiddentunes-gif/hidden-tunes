/** Read-only production report for the Sports fixture recovery gate. */
import { createClient } from "@supabase/supabase-js";

import { listSportsFixturesFiltered } from "../../lib/sports/fixtures/listFixtures";
import { loadSaturdayFootball, loadTodaySchedule } from "../../lib/sports/home/loaders";
import { resolveSportsHomeLimits } from "../../lib/sports/home/limits";
import { oldestPossibleSportsLiveStart } from "../../lib/sports/status/statusAuthority";

const batchArg = process.argv.find((arg) => arg.startsWith("--batch-id="));
const batchId = batchArg?.slice("--batch-id=".length) || null;
const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function assertNoError(label: string, result: { error: { message: string } | null }) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
}

async function main() {
  const now = new Date();
  const recent = new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();
  const future = new Date(now.getTime() + 14 * 24 * 60 * 60_000).toISOString();
  const [stale, currentRawLive, recentFinished, futureFixtures, mappings, providers, knownMapping] = await Promise.all([
    sb.from("sports_fixtures").select("id", { count: "exact", head: true })
      .eq("status", "live").filter("metadata->>import_batch", "eq", "api-football-first-ingest-20260801"),
    sb.from("sports_fixtures").select("id", { count: "exact", head: true })
      .eq("status", "live").gte("starts_at", oldestPossibleSportsLiveStart(now)),
    sb.from("sports_fixtures").select("id", { count: "exact", head: true })
      .eq("status", "completed").gte("starts_at", recent),
    sb.from("sports_fixtures").select("id,competition_id,season_id,provider_id,provider_external_id")
      .in("status", ["scheduled", "verified"]).gte("starts_at", now.toISOString()).lte("starts_at", future).limit(500),
    sb.from("sports_fixture_provider_ids").select("fixture_id,provider_slug,provider_external_id").limit(10_000),
    sb.from("sports_providers").select("slug,is_enabled,kill_switch,health_status")
      .in("slug", ["api_football", "openligadb"]),
    sb.from("sports_fixture_provider_ids").select("fixture_id,provider_slug,provider_external_id")
      .eq("provider_slug", "openligadb").eq("provider_external_id", "83156").maybeSingle(),
  ]);
  for (const [label, result] of [
    ["stale", stale], ["currentRawLive", currentRawLive], ["recentFinished", recentFinished], ["futureFixtures", futureFixtures],
    ["mappings", mappings], ["providers", providers], ["knownMapping", knownMapping],
  ] as const) assertNoError(label, result);

  const futureIds = (futureFixtures.data || []).map((fixture) => fixture.id);
  const participants = futureIds.length
    ? await sb.from("sports_fixture_participants").select("fixture_id,team_id,side").in("fixture_id", futureIds)
    : { data: [], error: null };
  assertNoError("participants", participants);

  let knownIdentity: Record<string, unknown> | null = null;
  if (knownMapping.data?.fixture_id) {
    const [fixture, participantRows] = await Promise.all([
      sb.from("sports_fixtures").select("id,competition_id,season_id,provider_id,provider_external_id,sports_competitions(provider_external_id),sports_competition_seasons(name,slug)")
        .eq("id", knownMapping.data.fixture_id).single(),
      sb.from("sports_fixture_participants").select("side,team_id,sports_teams(provider_external_id,name)")
        .eq("fixture_id", knownMapping.data.fixture_id).order("side"),
    ]);
    assertNoError("known fixture", fixture);
    assertNoError("known participants", participantRows);
    knownIdentity = { fixture: fixture.data, participants: participantRows.data };
  }

  const byProviderKey = new Map<string, number>();
  for (const mapping of mappings.data || []) {
    const key = `${mapping.provider_slug}:${mapping.provider_external_id}`;
    byProviderKey.set(key, (byProviderKey.get(key) || 0) + 1);
  }
  const duplicateProviderMappings = [...byProviderKey.entries()].filter(([, count]) => count > 1);

  let recoveryBatch: Record<string, unknown> | null = null;
  let recoverySnapshotCount = 0;
  let recoveryFixtureSnapshotCount = 0;
  if (batchId) {
    const [batch, snapshots, fixtureSnapshots] = await Promise.all([
      sb.from("sports_fixture_recovery_batches").select("id,batch_key,operation,status,captured_at,applied_at,rolled_back_at,failure_reason")
        .eq("id", batchId).single(),
      sb.from("sports_fixture_recovery_snapshots").select("id", { count: "exact", head: true }).eq("batch_id", batchId),
      sb.from("sports_fixture_recovery_snapshots").select("id", { count: "exact", head: true })
        .eq("batch_id", batchId).eq("entity_type", "fixture"),
    ]);
    assertNoError("recovery batch", batch);
    assertNoError("recovery snapshots", snapshots);
    assertNoError("fixture snapshots", fixtureSnapshots);
    recoveryBatch = batch.data;
    recoverySnapshotCount = snapshots.count || 0;
    recoveryFixtureSnapshotCount = fixtureSnapshots.count || 0;
  }

  const [live, upcoming, finished] = await Promise.all([
    listSportsFixturesFiltered({ live: true, limit: 100, now }),
    listSportsFixturesFiltered({ upcoming: true, limit: 100, now }),
    listSportsFixturesFiltered({ finished: true, limit: 10, now }),
  ]);
  const limits = resolveSportsHomeLimits({ todaysSchedule: 100, sectionTimeoutMs: 15_000 });
  const timeZones = ["Europe/Berlin", "Africa/Accra", "Pacific/Auckland", "America/Los_Angeles"];
  const sections: Record<string, unknown> = {};
  for (const timeZone of timeZones) {
    const [today, saturday] = await Promise.all([
      loadTodaySchedule({ country: "DE", platform: "audit", timeZone, limits, now }),
      loadSaturdayFootball({ country: "DE", platform: "audit", timeZone, limits, now }),
    ]);
    sections[timeZone] = { today: today.items.length, saturday: saturday.items.length };
  }

  const futureRows = futureFixtures.data || [];
  const participantRows = participants.data || [];
  console.log(JSON.stringify({
    auditedAt: now.toISOString(),
    backup: {
      batch: recoveryBatch,
      snapshotCount: recoverySnapshotCount,
      fixtureSnapshotCount: recoveryFixtureSnapshotCount,
    },
    providers: providers.data,
    production: {
      rawStaleLiveRemaining: stale.count || 0,
      currentProviderLiveCount: currentRawLive.count || 0,
      liveNowCount: live.items.length,
      upcomingCount: upcoming.items.length,
      recentFinishedCount: recentFinished.count || 0,
      newestFinishedStartsAt: finished.items.slice(0, 3).map((item) => item.timing.startsAt),
      syntheticParticipantsRemaining: participantRows.filter((row) => !row.team_id).length,
      missingCompetitionIdsRemaining: futureRows.filter((row) => !row.competition_id).length,
      missingSeasonIdsRemaining: futureRows.filter((row) => !row.season_id).length,
      duplicateProviderMappings,
      knownOpenLigaDbIdentity: knownIdentity,
      sections,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
