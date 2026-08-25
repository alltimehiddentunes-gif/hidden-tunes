/**
 * Bounded Sports fixture repair. Dry-run by default; pass --apply explicitly.
 * No feature flags, broadcasts, streams, playback, TV, or native configuration.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { sportsCacheInvalidate } from "../../lib/sports/cache";
import { mapApiFootballStatus } from "../../lib/sports/fixtures/apiFootballStatus";
import {
  canonicalSportsTeamName,
  dedupeSportsProviderFixtures,
  extractApiFootballIdentity,
  extractOpenLigaDbIdentity,
  sportsProviderFixtureKey,
} from "../../lib/sports/fixtures/providerIdentity";

const API_BASE = "https://v3.football.api-sports.io";
const OPENLIGA_URL = "https://api.openligadb.de/getmatchdata/bl1/2026";
const PROJECT_REF = "kojcyswxfuikxmqntwye";
const APPLY = process.argv.includes("--apply");
const SMALL_BATCH = process.argv.includes("--small");
const SCHEDULED = process.argv.includes("--scheduled");
const lanesArg = process.argv.find((arg) => arg.startsWith("--lanes="));
const ACTIVE_LANES = new Set(
  (lanesArg?.slice("--lanes=".length) || "live,today,recent,future")
    .split(",")
    .map((lane) => lane.trim())
    .filter(Boolean)
);
const RUN_STALE_RECOVERY = !SCHEDULED && !process.argv.includes("--skip-stale");
const CURRENT_FIXTURE_CAP = 220;
const STALE_FIXTURE_CAP = 500;
const IMPORT_BATCH = `sports-fixture-repair-${new Date().toISOString().slice(0, 10)}`;
let currentPhase = "startup";
let activeRecoveryBatchId: string | null = null;
let activeClient: SupabaseClient | null = null;

type JsonRecord = Record<string, unknown>;
type ProviderTeam = { id: string | null; name: string; logo: string | null };
type ProviderCompetition = {
  id: string;
  name: string;
  country: string | null;
  season: string | null;
  logo: string | null;
};
type ProviderFixture = {
  providerSlug: "api_football" | "openligadb";
  providerFixtureId: string;
  startsAt: string;
  title: string;
  home: ProviderTeam;
  away: ProviderTeam;
  competition: ProviderCompetition;
  statusCode: string;
  fixtureStatus: "scheduled" | "live" | "completed" | "postponed" | "cancelled";
  lifecycle: string;
  publicStatus: string;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
};
type TeamCacheEntry = {
  id: string;
  providerId: string | null;
  providerExternalId: string | null;
};
type RecoveryEntity =
  | "competition"
  | "season"
  | "team"
  | "fixture"
  | "participant"
  | "score"
  | "provider_mapping";
type RecoveryContext = { batchId: string; rootFixtureId: string };

async function captureRecoveryEntity(
  sb: SupabaseClient,
  recovery: RecoveryContext,
  entityType: RecoveryEntity,
  entityId: string
): Promise<void> {
  const { error } = await sb.rpc("sports_fixture_recovery_capture_entity", {
    p_batch_id: recovery.batchId,
    p_root_fixture_id: recovery.rootFixtureId,
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) throw error;
}

async function captureRecoveryFixture(
  sb: SupabaseClient,
  batchId: string,
  fixtureId: string
): Promise<void> {
  const { error } = await sb.rpc("sports_fixture_recovery_capture_fixture", {
    p_batch_id: batchId,
    p_fixture_id: fixtureId,
  });
  if (error) throw error;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function text(value: unknown): string | null {
  if (value == null) return null;
  const result = String(value).trim();
  return result || null;
}

function numberOrNull(value: unknown): number | null {
  const result = Number(value);
  return value != null && Number.isFinite(result) ? result : null;
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56);
}

function availability(status: ProviderFixture["fixtureStatus"]): string {
  if (status === "live") return "live_unavailable";
  if (status === "completed") return "finished";
  if (status === "postponed" || status === "cancelled") return "live_unavailable";
  return "upcoming";
}

function apiKey(): string {
  for (const name of [
    "API_FOOTBALL_KEY",
    "API_SPORTS_KEY",
    "APISPORTS_KEY",
    "API_SPORTS_API_KEY",
  ]) {
    const value = text(process.env[name]);
    if (value) return value;
  }
  throw new Error("API-Football credential is not configured");
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}: ${url}`);
  return response.json();
}

async function fetchApiFootball(path: string, key: string): Promise<JsonRecord[]> {
  const payload = record(
    await fetchJson(`${API_BASE}${path}`, {
      "x-apisports-key": key,
      Accept: "application/json",
    })
  );
  if (Object.keys(record(payload.errors)).length) {
    throw new Error(`API-Football returned provider errors for ${path}`);
  }
  return Array.isArray(payload.response)
    ? payload.response.map(record)
    : [];
}

async function fetchOptionalApiFootball(
  path: string,
  key: string
): Promise<{ rows: JsonRecord[]; providerError: boolean }> {
  try {
    return { rows: await fetchApiFootball(path, key), providerError: false };
  } catch (error) {
    if (error instanceof Error && error.message.includes("returned provider errors")) {
      return { rows: [], providerError: true };
    }
    throw error;
  }
}

function normalizeApiFixture(raw: JsonRecord): ProviderFixture | null {
  const identity = extractApiFootballIdentity(raw);
  const fixture = record(raw.fixture);
  const status = record(fixture.status);
  const teams = record(raw.teams);
  const home = record(teams.home);
  const away = record(teams.away);
  const league = record(raw.league);
  const goals = record(raw.goals);
  const providerFixtureId = identity?.fixtureId || null;
  const startsAt = text(fixture.date);
  const homeName = text(home.name);
  const awayName = text(away.name);
  const competitionId = identity?.competitionId || null;
  if (!providerFixtureId || !startsAt || !homeName || !awayName || !competitionId) {
    return null;
  }
  const mapped = mapApiFootballStatus(text(status.short));
  return {
    providerSlug: "api_football",
    providerFixtureId,
    startsAt,
    title: `${homeName} vs ${awayName}`,
    home: { id: identity?.homeTeamId || null, name: homeName, logo: text(home.logo) },
    away: { id: identity?.awayTeamId || null, name: awayName, logo: text(away.logo) },
    competition: {
      id: competitionId,
      name: text(league.name) || "Unknown competition",
      country: text(league.country),
      season: text(league.season),
      logo: text(league.logo),
    },
    statusCode: mapped.code,
    fixtureStatus: mapped.fixtureStatus,
    lifecycle: mapped.lifecycle,
    publicStatus: mapped.publicStatus,
    homeScore: numberOrNull(goals.home),
    awayScore: numberOrNull(goals.away),
    minute: numberOrNull(status.elapsed),
  };
}

function normalizeOpenLigaFixture(raw: JsonRecord): ProviderFixture | null {
  const identity = extractOpenLigaDbIdentity(raw);
  const home = record(raw.team1);
  const away = record(raw.team2);
  const homeName = text(home.teamName);
  const awayName = text(away.teamName);
  const providerFixtureId = identity?.fixtureId || null;
  const startsAt = text(raw.matchDateTimeUTC);
  const competitionId = identity?.competitionId || null;
  if (!homeName || !awayName || !providerFixtureId || !startsAt || !competitionId) {
    return null;
  }
  const results = Array.isArray(raw.matchResults) ? raw.matchResults.map(record) : [];
  const final =
    results.find((item) => numberOrNull(item.resultTypeID) === 2) ||
    results.at(-1) ||
    {};
  const finished = raw.matchIsFinished === true;
  return {
    providerSlug: "openligadb",
    providerFixtureId,
    startsAt,
    title: `${homeName} vs ${awayName}`,
    home: { id: identity?.homeTeamId || null, name: homeName, logo: null },
    away: { id: identity?.awayTeamId || null, name: awayName, logo: null },
    competition: {
      id: competitionId,
      name: text(raw.leagueName) || "Unknown competition",
      country: "DE",
      season: text(raw.leagueSeason),
      logo: null,
    },
    statusCode: finished ? "FT" : "NS",
    fixtureStatus: finished ? "completed" : "scheduled",
    lifecycle: finished ? "finished" : "scheduled",
    publicStatus: finished ? "finished" : "scheduled",
    homeScore: numberOrNull(final.pointsTeam1),
    awayScore: numberOrNull(final.pointsTeam2),
    minute: null,
  };
}

async function ensureProvider(
  sb: SupabaseClient,
  providerSlug: ProviderFixture["providerSlug"]
): Promise<string> {
  const { data, error } = await sb
    .from("sports_providers")
    .select("id")
    .eq("slug", providerSlug)
    .maybeSingle();
  if (error) throw error;
  if (data?.id) return String(data.id);
  throw new Error(`Required provider registry row is missing: ${providerSlug}`);
}

async function ensureSport(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb
    .from("sports")
    .select("id")
    .eq("slug", "football")
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("Existing football sport row was not found");
  return String(data.id);
}

async function ensureCompetition(
  sb: SupabaseClient,
  fixture: ProviderFixture,
  providerId: string,
  sportId: string,
  cache: Map<string, string>,
  recovery: RecoveryContext
): Promise<string> {
  const key = `${fixture.providerSlug}:${fixture.competition.id}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const query = sb
    .from("sports_competitions")
    .select("id,provider_id,name")
    .eq("provider_external_id", fixture.competition.id);
  const { data, error } = await query.limit(20);
  if (error) throw error;
  const existing = (data || []).find(
    (row) =>
      row.provider_id === providerId ||
      (!row.provider_id && canonicalSportsTeamName(String(row.name)) === canonicalSportsTeamName(fixture.competition.name))
  );
  if (existing?.id) {
    if (!existing.provider_id) {
      await captureRecoveryEntity(sb, recovery, "competition", String(existing.id));
      const { error: updateError } = await sb
        .from("sports_competitions")
        .update({ provider_id: providerId, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .is("provider_id", null);
      if (updateError) throw updateError;
    }
    cache.set(key, String(existing.id));
    return String(existing.id);
  }
  const id = randomUUID();
  await captureRecoveryEntity(sb, recovery, "competition", id);
  const { error: insertError } = await sb.from("sports_competitions").insert({
    id,
    sport_id: sportId,
    provider_id: providerId,
    provider_external_id: fixture.competition.id,
    name: fixture.competition.name,
    slug: `${fixture.providerSlug}-${fixture.competition.id}`,
    country_code: fixture.providerSlug === "openligadb" ? "DE" : null,
    artwork_url: fixture.competition.logo,
    competition_type: "league",
    status: "active",
  });
  if (insertError) throw insertError;
  cache.set(key, id);
  return id;
}

async function ensureSeason(
  sb: SupabaseClient,
  competitionId: string,
  season: string | null,
  cache: Map<string, string>,
  recovery: RecoveryContext
): Promise<string | null> {
  if (!season) return null;
  const seasonSlug = slug(season);
  const key = `${competitionId}:${seasonSlug}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const { data, error } = await sb
    .from("sports_competition_seasons")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("slug", seasonSlug)
    .maybeSingle();
  if (error) throw error;
  if (data?.id) {
    cache.set(key, String(data.id));
    return String(data.id);
  }
  const id = randomUUID();
  await captureRecoveryEntity(sb, recovery, "season", id);
  const { error: insertError } = await sb.from("sports_competition_seasons").insert({
    id,
    competition_id: competitionId,
    name: season,
    slug: seasonSlug,
    status: "active",
  });
  if (insertError) throw insertError;
  cache.set(key, id);
  return id;
}

async function ensureTeam(
  sb: SupabaseClient,
  team: ProviderTeam,
  providerSlug: ProviderFixture["providerSlug"],
  providerId: string,
  sportId: string,
  competitionId: string,
  cache: Map<string, TeamCacheEntry>,
  recovery: RecoveryContext
): Promise<string> {
  const key = `${providerSlug}:${team.id || canonicalSportsTeamName(team.name)}`;
  const nameKey = `name:${canonicalSportsTeamName(team.name)}`;
  const cached = cache.get(key) || cache.get(nameKey);
  if (cached) {
    if (!cached.providerId && team.id) {
      await captureRecoveryEntity(sb, recovery, "team", cached.id);
      const { error: updateError } = await sb
        .from("sports_teams")
        .update({
          provider_id: providerId,
          provider_external_id: team.id,
          competition_id: competitionId,
          artwork_url: team.logo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cached.id)
        .is("provider_id", null);
      if (updateError) throw updateError;
      cached.providerId = providerId;
      cached.providerExternalId = team.id;
      cache.set(key, cached);
    }
    return cached.id;
  }
  const canonical = canonicalSportsTeamName(team.name);
  const id = randomUUID();
  await captureRecoveryEntity(sb, recovery, "team", id);
  const { error: insertError } = await sb.from("sports_teams").insert({
    id,
    sport_id: sportId,
    provider_id: providerId,
    provider_external_id: team.id,
    competition_id: competitionId,
    name: team.name,
    slug: `${slug(team.name) || "team"}-${providerSlug}-${team.id || id.slice(0, 8)}`,
    country_code: providerSlug === "openligadb" ? "DE" : null,
    artwork_url: team.logo,
    status: "active",
  });
  if (insertError) throw insertError;
  const entry = { id, providerId, providerExternalId: team.id };
  cache.set(key, entry);
  cache.set(`name:${canonical}`, entry);
  return id;
}

async function upsertParticipant(
  sb: SupabaseClient,
  fixtureId: string,
  side: "home" | "away",
  teamId: string,
  providerSlug: string,
  team: ProviderTeam,
  recovery: RecoveryContext
): Promise<void> {
  const { data, error } = await sb
    .from("sports_fixture_participants")
    .select("id")
    .eq("fixture_id", fixtureId)
    .eq("side", side)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const row = {
    team_id: teamId,
    metadata: {
      name: team.name,
      logo_url: team.logo,
      provider_slug: providerSlug,
      provider_team_id: team.id,
    },
    updated_at: new Date().toISOString(),
  };
  if (data?.id) {
    await captureRecoveryEntity(sb, recovery, "participant", String(data.id));
    const { error: updateError } = await sb
      .from("sports_fixture_participants")
      .update(row)
      .eq("id", data.id);
    if (updateError) throw updateError;
  } else {
    const id = randomUUID();
    await captureRecoveryEntity(sb, recovery, "participant", id);
    const { error: insertError } = await sb
      .from("sports_fixture_participants")
      .insert({ id, fixture_id: fixtureId, side, ...row });
    if (insertError) throw insertError;
  }
}

async function findLegacyFixtureId(
  sb: SupabaseClient,
  fixture: ProviderFixture
): Promise<string | null> {
  if (fixture.providerSlug !== "openligadb") return null;
  const kickoff = Date.parse(fixture.startsAt);
  if (!Number.isFinite(kickoff)) throw new Error(`Invalid provider kickoff: ${fixture.startsAt}`);
  const { data, error } = await sb
    .from("sports_fixtures")
    .select("id,title,provider_id,provider_external_id")
    .gte("starts_at", new Date(kickoff - 5 * 60_000).toISOString())
    .lte("starts_at", new Date(kickoff + 5 * 60_000).toISOString())
    .limit(10);
  if (error) throw error;
  const expectedTitle = canonicalSportsTeamName(fixture.title);
  const matches = (data || []).filter(
    (row) =>
      canonicalSportsTeamName(String(row.title || "")) === expectedTitle &&
      !row.provider_external_id
  );
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous legacy fixture match for ${fixture.providerSlug}:${fixture.providerFixtureId}`
    );
  }
  return matches[0]?.id ? String(matches[0].id) : null;
}

async function upsertFixture(
  sb: SupabaseClient,
  fixture: ProviderFixture,
  providerId: string,
  sportId: string,
  caches: {
    competitions: Map<string, string>;
    seasons: Map<string, string>;
    teams: Map<string, TeamCacheEntry>;
  },
  refreshedAt: string,
  batchId: string
): Promise<"inserted" | "updated"> {
  const { data: mapping, error: mappingError } = await sb
    .from("sports_fixture_provider_ids")
    .select("id,fixture_id")
    .eq("provider_slug", fixture.providerSlug)
    .eq("provider_external_id", fixture.providerFixtureId)
    .maybeSingle();
  if (mappingError) throw mappingError;
  const legacyFixtureId = mapping?.fixture_id ? null : await findLegacyFixtureId(sb, fixture);
  const fixtureId = mapping?.fixture_id
    ? String(mapping.fixture_id)
    : legacyFixtureId || randomUUID();
  const recovery: RecoveryContext = { batchId, rootFixtureId: fixtureId };
  await captureRecoveryFixture(sb, batchId, fixtureId);
  const competitionId = await ensureCompetition(
    sb,
    fixture,
    providerId,
    sportId,
    caches.competitions,
    recovery
  );
  const seasonId = await ensureSeason(
    sb,
    competitionId,
    fixture.competition.season,
    caches.seasons,
    recovery
  );
  const homeTeamId = await ensureTeam(
    sb,
    fixture.home,
    fixture.providerSlug,
    providerId,
    sportId,
    competitionId,
    caches.teams,
    recovery
  );
  const awayTeamId = await ensureTeam(
    sb,
    fixture.away,
    fixture.providerSlug,
    providerId,
    sportId,
    competitionId,
    caches.teams,
    recovery
  );
  const metadata = {
    canonical_key: `${fixture.providerSlug}:${fixture.providerFixtureId}`,
    competition_name: fixture.competition.name,
    season: fixture.competition.season,
    provider_status_code: fixture.statusCode,
    provider_canonical_status: fixture.lifecycle,
    public_status: fixture.publicStatus,
    period: fixture.publicStatus,
    minute: fixture.minute,
    import_batch: IMPORT_BATCH,
    last_synced_at: refreshedAt,
  };
  let outcome: "inserted" | "updated" = "updated";
  if (!mapping?.fixture_id && !legacyFixtureId) {
    const { error } = await sb.from("sports_fixtures").insert({
      id: fixtureId,
      sport_id: sportId,
      competition_id: competitionId,
      season_id: seasonId,
      provider_id: providerId,
      provider_external_id: fixture.providerFixtureId,
      title: fixture.title,
      starts_at: fixture.startsAt,
      status: fixture.fixtureStatus,
      metadata,
      availability_state: availability(fixture.fixtureStatus),
      playable: false,
      visible: true,
      status_updated_at: refreshedAt,
      provider_status_fresh_at: refreshedAt,
    });
    if (error) throw error;
    outcome = "inserted";
  } else {
    const { error } = await sb
      .from("sports_fixtures")
      .update({
        sport_id: sportId,
        competition_id: competitionId,
        season_id: seasonId,
        provider_id: providerId,
        provider_external_id: fixture.providerFixtureId,
        title: fixture.title,
        starts_at: fixture.startsAt,
        status: fixture.fixtureStatus,
        metadata,
        availability_state: availability(fixture.fixtureStatus),
        playable: false,
        status_updated_at: refreshedAt,
        provider_status_fresh_at: refreshedAt,
        updated_at: refreshedAt,
      })
      .eq("id", fixtureId);
    if (error) throw error;
  }
  await upsertParticipant(sb, fixtureId, "home", homeTeamId, fixture.providerSlug, fixture.home, recovery);
  await upsertParticipant(sb, fixtureId, "away", awayTeamId, fixture.providerSlug, fixture.away, recovery);
  const { data: existingScore, error: existingScoreError } = await sb
    .from("sports_fixture_scores")
    .select("id")
    .eq("fixture_id", fixtureId)
    .eq("period", "full_time")
    .maybeSingle();
  if (existingScoreError) throw existingScoreError;
  const scoreId = existingScore?.id ? String(existingScore.id) : randomUUID();
  await captureRecoveryEntity(sb, recovery, "score", scoreId);
  const { error: scoreError } = await sb.from("sports_fixture_scores").upsert(
    {
      id: scoreId,
      fixture_id: fixtureId,
      period: "full_time",
      home_score: fixture.homeScore,
      away_score: fixture.awayScore,
      score_payload: {
        status: fixture.lifecycle,
        provider_status_code: fixture.statusCode,
        minute: fixture.minute,
      },
      updated_source: fixture.providerSlug,
      updated_at: refreshedAt,
    },
    { onConflict: "fixture_id,period" }
  );
  if (scoreError) throw scoreError;
  const providerMappingId = mapping?.id ? String(mapping.id) : randomUUID();
  await captureRecoveryEntity(sb, recovery, "provider_mapping", providerMappingId);
  const { error: providerMapError } = await sb.from("sports_fixture_provider_ids").upsert(
    {
      id: providerMappingId,
      fixture_id: fixtureId,
      provider_id: providerId,
      provider_slug: fixture.providerSlug,
      provider_external_id: fixture.providerFixtureId,
      source_priority: fixture.providerSlug === "api_football" ? 10 : 30,
      last_seen_at: refreshedAt,
      updated_at: refreshedAt,
    },
    { onConflict: "provider_slug,provider_external_id" }
  );
  if (providerMapError) throw providerMapError;
  return outcome;
}

async function finalizeStaleRows(
  sb: SupabaseClient,
  staleRows: JsonRecord[],
  staleProvider: Map<string, ProviderFixture>,
  refreshedAt: string,
  batchId: string
): Promise<{ updated: number; providerMissing: number }> {
  let updated = 0;
  let providerMissing = 0;
  for (const row of staleRows) {
    const providerFixtureId = text(row.provider_external_id);
    const provider = providerFixtureId ? staleProvider.get(providerFixtureId) : null;
    if (!provider) providerMissing += 1;
    const metadata = record(row.metadata);
    const fixtureId = String(row.id);
    await captureRecoveryFixture(sb, batchId, fixtureId);
    const providerTerminal = provider && provider.fixtureStatus !== "live"
      ? provider.fixtureStatus
      : null;
    const fixtureStatus = providerTerminal || "expired";
    const nextMetadata = {
      ...metadata,
      provider_status_code: provider?.statusCode || null,
      provider_canonical_status: provider?.lifecycle || "unknown",
      public_status: provider?.publicStatus === "cancelled" || provider?.publicStatus === "postponed"
        ? provider.publicStatus
        : fixtureStatus === "completed"
          ? "finished"
          : "unavailable",
      last_synced_at: provider ? refreshedAt : metadata.last_synced_at || null,
      stale_live_safeguard_checked_at: refreshedAt,
      stale_live_finalized_at: refreshedAt,
      stale_live_finalization_reason: provider
        ? "authoritative_provider_refresh"
        : "provider_record_missing_after_bounded_date_refresh",
    };
    const { error } = await sb
      .from("sports_fixtures")
      .update({
        status: fixtureStatus,
        availability_state: fixtureStatus === "completed" ? "finished" : "live_unavailable",
        playable: false,
        metadata: nextMetadata,
        status_updated_at: refreshedAt,
        provider_status_fresh_at: provider
          ? refreshedAt
          : row.provider_status_fresh_at,
        updated_at: refreshedAt,
      })
      .eq("id", fixtureId)
      .eq("status", "live");
    if (error) throw error;
    if (provider && provider.fixtureStatus === "completed") {
      const { data: existingScore, error: existingScoreError } = await sb
        .from("sports_fixture_scores")
        .select("id")
        .eq("fixture_id", fixtureId)
        .eq("period", "full_time")
        .maybeSingle();
      if (existingScoreError) throw existingScoreError;
      const scoreId = existingScore?.id ? String(existingScore.id) : randomUUID();
      await captureRecoveryEntity(
        sb,
        { batchId, rootFixtureId: fixtureId },
        "score",
        scoreId
      );
      const { error: scoreError } = await sb.from("sports_fixture_scores").upsert(
        {
          id: scoreId,
          fixture_id: fixtureId,
          period: "full_time",
          home_score: provider.homeScore,
          away_score: provider.awayScore,
          score_payload: { status: provider.lifecycle, provider_status_code: provider.statusCode },
          updated_source: "api_football",
          updated_at: refreshedAt,
        },
        { onConflict: "fixture_id,period" }
      );
      if (scoreError) throw scoreError;
    }
    updated += 1;
  }
  return { updated, providerMissing };
}

async function main() {
  currentPhase = "configuration";
  const url = text(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url?.includes(PROJECT_REF)) throw new Error("Refusing unrecognized Supabase project");
  if (!serviceKey || serviceKey.length < 80) throw new Error("Supabase service credential missing");
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  activeClient = sb;
  if (APPLY) {
    currentPhase = "preflight_recovery_support";
    const { error: backupTableError } = await sb
      .from("sports_fixture_recovery_batches")
      .select("id")
      .limit(1);
    if (backupTableError) {
      throw new Error(
        "Required stale-live backup table is unavailable; refusing fixture writes"
      );
    }
  }
  if (SCHEDULED) {
    currentPhase = "provider_registry_preflight";
    const requested = [
      ...(ACTIVE_LANES.size ? ["api_football"] : []),
      ...(ACTIVE_LANES.has("future") ? ["openligadb"] : []),
    ];
    const { data: providers, error: providersError } = await sb
      .from("sports_providers")
      .select("slug,is_enabled,kill_switch")
      .in("slug", requested);
    if (providersError) throw providersError;
    for (const providerSlug of requested) {
      const provider = (providers || []).find((row) => row.slug === providerSlug);
      if (!provider?.is_enabled || provider.kill_switch) {
        throw new Error(`Scheduled provider is disabled or kill-switched: ${providerSlug}`);
      }
    }
  }
  const key = apiKey();
  const now = new Date();
  const date = (offset: number) =>
    new Date(now.getTime() + offset * 24 * 60 * 60_000).toISOString().slice(0, 10);
  const refreshedAt = now.toISOString();

  // Sequential requests avoid provider burst throttling and remain well below quota.
  currentPhase = "provider_fetch";
  const liveRaw = ACTIVE_LANES.has("live")
    ? await fetchApiFootball("/fixtures?live=all", key)
    : [];
  const yesterdayRaw = ACTIVE_LANES.has("recent")
    ? await fetchApiFootball(`/fixtures?date=${date(-1)}`, key)
    : [];
  const todayRaw = ACTIVE_LANES.has("today")
    ? await fetchApiFootball(`/fixtures?date=${date(0)}`, key)
    : [];
  const tomorrowRaw = ACTIVE_LANES.has("future")
    ? await fetchApiFootball(`/fixtures?date=${date(1)}`, key)
    : [];
  const staleDate = RUN_STALE_RECOVERY
    ? await fetchOptionalApiFootball("/fixtures?date=2026-08-01", key)
    : { rows: [], providerError: false };
  const staleDateRaw = staleDate.rows;
  const openLigaRaw = ACTIVE_LANES.has("future") ? await fetchJson(OPENLIGA_URL) : [];

  const normalizeMany = (rows: JsonRecord[]) =>
    rows.map(normalizeApiFixture).filter((row): row is ProviderFixture => Boolean(row));
  const live = normalizeMany(liveRaw).filter((row) => row.fixtureStatus === "live").slice(0, 40);
  const recentFinished = normalizeMany(yesterdayRaw)
    .filter((row) => row.fixtureStatus === "completed")
    .slice(-40);
  const today = normalizeMany(todayRaw).slice(0, 80);
  const tomorrow = normalizeMany(tomorrowRaw).slice(0, 60);
  const currentProviderRows = dedupeSportsProviderFixtures([
    ...live,
    ...recentFinished,
    ...today,
    ...tomorrow,
  ]);
  const openLiga = (Array.isArray(openLigaRaw) ? openLigaRaw.map(record) : [])
    .map(normalizeOpenLigaFixture)
    .filter((row): row is ProviderFixture => Boolean(row))
    .filter((row) => Date.parse(row.startsAt) >= now.getTime())
    .slice(0, 40);
  const current = currentProviderRows.slice(
    0,
    CURRENT_FIXTURE_CAP - openLiga.length
  );
  current.push(...openLiga);
  const selectedCurrent = SMALL_BATCH
    ? dedupeSportsProviderFixtures([
        ...current.filter((row) => row.providerSlug === "api_football").slice(0, 6),
        ...current.filter((row) => row.providerSlug === "openligadb").slice(0, 3),
      ])
    : current;
  const staleProvider = new Map(
    normalizeMany(staleDateRaw).map((row) => [row.providerFixtureId, row])
  );

  currentPhase = "database_plan";
  const { data: staleData, error: staleError, count: staleCount } = await sb
    .from("sports_fixtures")
    .select(
      "id,status,starts_at,provider_external_id,availability_state,playable,metadata,provider_status_fresh_at,updated_at",
      { count: "exact" }
    )
    .eq("status", "live")
    .filter("metadata->>import_batch", "eq", "api-football-first-ingest-20260801")
    .order("starts_at")
    .limit(STALE_FIXTURE_CAP);
  if (staleError) throw staleError;
  if ((staleCount || 0) > STALE_FIXTURE_CAP) {
    throw new Error(`Stale fixture count ${staleCount} exceeds safety cap ${STALE_FIXTURE_CAP}`);
  }
  const selectedStaleRows = RUN_STALE_RECOVERY
    ? (staleData || []).slice(0, SMALL_BATCH ? 3 : STALE_FIXTURE_CAP)
    : [];
  const openLigaIdentityPlan = [] as Array<{
    providerFixtureId: string;
    legacyInternalFixtureId: string | null;
    competitionId: string;
    homeTeamId: string | null;
    awayTeamId: string | null;
  }>;
  for (const fixture of selectedCurrent.filter((row) => row.providerSlug === "openligadb").slice(0, 10)) {
    openLigaIdentityPlan.push({
      providerFixtureId: fixture.providerFixtureId,
      legacyInternalFixtureId: await findLegacyFixtureId(sb, fixture),
      competitionId: fixture.competition.id,
      homeTeamId: fixture.home.id,
      awayTeamId: fixture.away.id,
    });
  }

  const report: JsonRecord = {
    mode: APPLY ? "apply" : "dry_run",
    lanes: [...ACTIVE_LANES],
    providerRequests: {
      apiFootball:
        Number(ACTIVE_LANES.has("live")) +
        Number(ACTIVE_LANES.has("recent")) +
        Number(ACTIVE_LANES.has("today")) +
        Number(ACTIVE_LANES.has("future")) +
        Number(RUN_STALE_RECOVERY),
      openLigaDb: Number(ACTIVE_LANES.has("future")),
    },
    staleLive: {
      count: selectedStaleRows.length,
      rawCount: staleCount || 0,
      historicalProviderLookupAvailable: !staleDate.providerError,
      providerRecordsFound: selectedStaleRows.filter((row) =>
        staleProvider.has(String(row.provider_external_id || ""))
      ).length,
      providerRecordsMissing: selectedStaleRows.filter(
        (row) => !staleProvider.has(String(row.provider_external_id || ""))
      ).length,
    },
    currentPlan: {
      total: selectedCurrent.length,
      live: selectedCurrent.filter((row) => row.fixtureStatus === "live").length,
      today: selectedCurrent.filter((row) => row.startsAt.slice(0, 10) === date(0)).length,
      recentFinished: selectedCurrent.filter((row) => row.fixtureStatus === "completed").length,
      upcoming: selectedCurrent.filter((row) => row.fixtureStatus === "scheduled").length,
      openLigaDb: selectedCurrent.filter((row) => row.providerSlug === "openligadb").length,
    },
    openLigaIdentityPlan,
    representative: selectedCurrent.slice(0, 5).map((row) => ({
      provider: row.providerSlug,
      providerFixtureId: row.providerFixtureId,
      title: row.title,
      competitionId: row.competition.id,
      homeTeamId: row.home.id,
      awayTeamId: row.away.id,
      startsAt: row.startsAt,
      status: row.lifecycle,
    })),
  };

  if (!APPLY) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (selectedCurrent.length === 0 && selectedStaleRows.length === 0) {
    report.applied = {
      noOp: true,
      reason: "provider returned no fixtures for requested lanes",
      flagsChanged: 0,
      streamsChanged: 0,
    };
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  currentPhase = "begin_recovery_batch";
  const batchKey = `sports-fixture-recovery-${SMALL_BATCH ? "small" : "full"}-${refreshedAt}-${randomUUID()}`;
  const { data: batchData, error: batchError } = await sb.rpc(
    "sports_fixture_recovery_begin",
    {
      p_batch_key: batchKey,
      p_operation: SMALL_BATCH ? "controlled_small_fixture_repair" : "fixture_sync",
      p_metadata: {
        import_batch: IMPORT_BATCH,
        small_batch: SMALL_BATCH,
        lanes: [...ACTIVE_LANES],
        scheduled: SCHEDULED,
      },
    }
  );
  if (batchError || !batchData) throw batchError || new Error("Recovery batch was not created");
  activeRecoveryBatchId = String(batchData);

  currentPhase = "ensure_catalog_roots";
  const sportId = await ensureSport(sb);
  const providerIds = {} as Record<ProviderFixture["providerSlug"], string>;
  const requiredProviderSlugs = new Set(selectedCurrent.map((fixture) => fixture.providerSlug));
  if (RUN_STALE_RECOVERY) requiredProviderSlugs.add("api_football");
  for (const providerSlug of requiredProviderSlugs) {
    providerIds[providerSlug] = await ensureProvider(sb, providerSlug);
  }
  currentPhase = "load_team_identity_index";
  const { data: existingTeams, error: teamsError, count: teamCount } = await sb
    .from("sports_teams")
    .select("id,name,provider_id,provider_external_id", { count: "exact" })
    .eq("sport_id", sportId)
    .limit(10_000);
  if (teamsError) throw teamsError;
  if ((teamCount || 0) > 10_000) {
    throw new Error(`Football team count ${teamCount} exceeds repair safety cap`);
  }
  const teamCache = new Map<string, TeamCacheEntry>();
  for (const row of existingTeams || []) {
    const entry = {
      id: String(row.id),
      providerId: text(row.provider_id),
      providerExternalId: text(row.provider_external_id),
    };
    teamCache.set(`name:${canonicalSportsTeamName(String(row.name))}`, entry);
    if (entry.providerId && entry.providerExternalId) {
      const providerSlug = Object.entries(providerIds).find(
        ([, id]) => id === entry.providerId
      )?.[0];
      if (providerSlug) {
        teamCache.set(
          sportsProviderFixtureKey(providerSlug, entry.providerExternalId),
          entry
        );
      }
    }
  }
  currentPhase = "finalize_stale_live";
  const staleResult = await finalizeStaleRows(
    sb,
    selectedStaleRows.map(record),
    staleProvider,
    refreshedAt,
    activeRecoveryBatchId
  );
  const caches = {
    competitions: new Map<string, string>(),
    seasons: new Map<string, string>(),
    teams: teamCache,
  };
  let inserted = 0;
  let updated = 0;
  currentPhase = "upsert_current_fixtures";
  for (const fixture of selectedCurrent) {
    const outcome = await upsertFixture(
      sb,
      fixture,
      providerIds[fixture.providerSlug],
      sportId,
      caches,
      refreshedAt,
      activeRecoveryBatchId
    );
    if (outcome === "inserted") inserted += 1;
    else updated += 1;
  }
  sportsCacheInvalidate("sports-home-ia:");
  const { error: markAppliedError } = await sb.rpc(
    "sports_fixture_recovery_mark_applied",
    { p_batch_id: activeRecoveryBatchId }
  );
  if (markAppliedError) throw markAppliedError;
  const { data: cacheVersion, error: cacheVersionError } = await sb.rpc(
    "sports_bump_fixture_data_version"
  );
  if (cacheVersionError) throw cacheVersionError;
  report.applied = {
    recoveryBatchId: activeRecoveryBatchId,
    cacheVersion,
    staleUpdated: staleResult.updated,
    staleProviderMissing: staleResult.providerMissing,
    fixturesInserted: inserted,
    fixturesUpdated: updated,
    flagsChanged: 0,
    streamsChanged: 0,
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch(async (error) => {
  const details = record(error);
  let rollback: "not_required" | "completed" | "failed" = "not_required";
  let rollbackError: string | null = null;
  if (activeClient && activeRecoveryBatchId) {
    const { error: recoveryError } = await activeClient.rpc(
      "sports_fixture_recovery_rollback",
      { p_batch_id: activeRecoveryBatchId }
    );
    rollback = recoveryError ? "failed" : "completed";
    rollbackError = recoveryError?.message || null;
  }
  console.error(
    JSON.stringify({
      phase: currentPhase,
      error: error instanceof Error ? error.message : text(details.message) || "unknown",
      code: text(details.code),
      details: text(details.details),
      hint: text(details.hint),
      recoveryBatchId: activeRecoveryBatchId,
      rollback,
      rollbackError,
    })
  );
  process.exit(1);
});
