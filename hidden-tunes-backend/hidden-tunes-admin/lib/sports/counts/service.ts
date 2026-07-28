/**
 * Administrative / private-pilot Sports catalog counts.
 * Uses current production schema (no catalog_state dependency).
 * Public sports_enabled remains false — detailed counts require pilot or admin.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveSportsStatusAuthority } from "../status/statusAuthority";
import {
  classifySportsBroadcast,
  isTvBridgeSportsPublisher,
  isUnsafeSportsPublisher,
} from "../broadcasts/classification";

export type SportsCorrectnessCounts = {
  enabled: boolean;
  privatePilot: boolean;
  admin: boolean;
  generatedAt: string;
  total: number;
  publicEligible: number;
  quarantined: number;
  live: number;
  upcoming: number;
  scheduled: number;
  completed: number;
  postponed: number;
  cancelled: number;
  withScores: number;
  withIncidents: number;
  withStats: number;
  withLineups: number;
  withBroadcasts: number;
  withOfficialBroadcasts: number;
  withVerifiedStreams: number;
  withPlayableStreams: number;
  withExternalWatchLinks: number;
  staleLive: number;
  staleProviderData: number;
  broadcastsTotal: number;
  broadcastsIptv: number;
  broadcastsTvBridge: number;
  bySport: Record<string, number>;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  byProvider: Record<string, number>;
  cacheTtlSec: number;
  source: "database" | "empty";
};

type CacheEntry = { at: number; value: SportsCorrectnessCounts };
let memoryCache: CacheEntry | null = null;

export function emptySportsCorrectnessCounts(
  partial?: Partial<SportsCorrectnessCounts>
): SportsCorrectnessCounts {
  return {
    enabled: false,
    privatePilot: false,
    admin: false,
    generatedAt: new Date().toISOString(),
    total: 0,
    publicEligible: 0,
    quarantined: 0,
    live: 0,
    upcoming: 0,
    scheduled: 0,
    completed: 0,
    postponed: 0,
    cancelled: 0,
    withScores: 0,
    withIncidents: 0,
    withStats: 0,
    withLineups: 0,
    withBroadcasts: 0,
    withOfficialBroadcasts: 0,
    withVerifiedStreams: 0,
    withPlayableStreams: 0,
    withExternalWatchLinks: 0,
    staleLive: 0,
    staleProviderData: 0,
    broadcastsTotal: 0,
    broadcastsIptv: 0,
    broadcastsTvBridge: 0,
    bySport: {},
    byStatus: {},
    bySource: {},
    byProvider: {},
    cacheTtlSec: 30,
    source: "empty",
    ...partial,
  };
}

async function countExact(
  table: string,
  filters?: { column: string; value: string }[]
): Promise<number> {
  let q = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  for (const f of filters || []) {
    q = q.eq(f.column, f.value);
  }
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

export async function getSportsCorrectnessCounts(input?: {
  bypassCache?: boolean;
  privatePilot?: boolean;
  admin?: boolean;
}): Promise<SportsCorrectnessCounts> {
  const ttlMs = 30_000;
  if (!input?.bypassCache && memoryCache && Date.now() - memoryCache.at < ttlMs) {
    return {
      ...memoryCache.value,
      privatePilot: Boolean(input?.privatePilot),
      admin: Boolean(input?.admin),
    };
  }

  const now = new Date();
  const [
    total,
    quarantined,
    live,
    scheduled,
    completed,
    postponed,
    cancelled,
    playable,
    withScores,
    withIncidents,
    withStandings,
    broadcastsTotal,
  ] = await Promise.all([
    countExact("sports_fixtures"),
    countExact("sports_fixtures", [{ column: "status", value: "quarantined" }]),
    countExact("sports_fixtures", [{ column: "status", value: "live" }]),
    countExact("sports_fixtures", [{ column: "status", value: "scheduled" }]),
    countExact("sports_fixtures", [{ column: "status", value: "completed" }]),
    countExact("sports_fixtures", [{ column: "status", value: "postponed" }]),
    countExact("sports_fixtures", [{ column: "status", value: "cancelled" }]),
    countExact("sports_fixtures", [{ column: "playable", value: "true" }]),
    countExact("sports_fixture_scores"),
    countExact("sports_fixture_events"),
    countExact("sports_standings"),
    countExact("sports_broadcasts"),
  ]);

  const { data: liveRows } = await supabaseAdmin
    .from("sports_fixtures")
    .select("id, status, starts_at, ends_at, metadata, sport_id, playable, availability_state")
    .eq("status", "live");

  let staleLive = 0;
  for (const row of liveRows || []) {
    const auth = resolveSportsStatusAuthority({
      fixtureStatus: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      metadata: (row.metadata || {}) as Record<string, unknown>,
      now,
    });
    if (auth.staleLiveCandidate) staleLive += 1;
  }

  const { data: sports } = await supabaseAdmin
    .from("sports")
    .select("id, slug");
  const sportMap = new Map((sports || []).map((s) => [s.id, s.slug]));

  const { data: fixtureSample } = await supabaseAdmin
    .from("sports_fixtures")
    .select("id, status, sport_id, starts_at, playable, visible")
    .neq("status", "removed")
    .limit(2000);

  const bySport: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let upcoming = 0;
  let publicEligible = 0;
  for (const row of fixtureSample || []) {
    const slug = sportMap.get(row.sport_id) || "unknown";
    bySport[slug] = (bySport[slug] || 0) + 1;
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    if (
      row.starts_at &&
      Date.parse(row.starts_at) > now.getTime() &&
      row.status !== "quarantined" &&
      row.status !== "completed"
    ) {
      upcoming += 1;
    }
    if (
      row.visible !== false &&
      row.status !== "quarantined" &&
      row.status !== "removed"
    ) {
      publicEligible += 1;
    }
  }

  // Broadcast publisher breakdown (bounded fetch)
  const { data: broadcasts } = await supabaseAdmin
    .from("sports_broadcasts")
    .select(
      "id, publisher_name, publisher_domain, broadcast_type, playback_kind, is_official, verification_status, validation_status, validation_expires_at, metadata, quarantined_at, provider_id"
    )
    .limit(2000);

  let broadcastsIptv = 0;
  let broadcastsTvBridge = 0;
  let withOfficialBroadcasts = 0;
  let withVerifiedStreams = 0;
  let withExternalWatchLinks = 0;
  const bySource: Record<string, number> = {};
  const fixtureBroadcastIds = new Set<string>();

  for (const b of broadcasts || []) {
    const pub = String(b.publisher_name || "unknown");
    bySource[pub] = (bySource[pub] || 0) + 1;
    if (isUnsafeSportsPublisher(pub)) broadcastsIptv += 1;
    if (isTvBridgeSportsPublisher(pub)) broadcastsTvBridge += 1;

    const c = classifySportsBroadcast({
      publisherName: b.publisher_name,
      publisherDomain: b.publisher_domain,
      broadcastType: b.broadcast_type,
      playbackKind: b.playback_kind,
      isOfficial: b.is_official,
      verificationStatus: b.verification_status,
      validationStatus: b.validation_status,
      validationExpiresAt: b.validation_expires_at,
      metadata: (b.metadata || {}) as Record<string, unknown>,
      quarantinedAt: b.quarantined_at,
      now,
    });
    if (c.officialAllowed) withOfficialBroadcasts += 1;
    if (c.verifiedAllowed) withVerifiedStreams += 1;
    if (c.classification === "official_external_watch_link") {
      withExternalWatchLinks += 1;
    }
  }

  const { data: providers } = await supabaseAdmin
    .from("sports_providers")
    .select("id, slug");
  const byProvider: Record<string, number> = {};
  for (const p of providers || []) {
    byProvider[p.slug] = 0;
  }

  const value: SportsCorrectnessCounts = {
    enabled: false,
    privatePilot: Boolean(input?.privatePilot),
    admin: Boolean(input?.admin),
    generatedAt: now.toISOString(),
    total,
    publicEligible,
    quarantined,
    live,
    upcoming,
    scheduled,
    completed,
    postponed,
    cancelled,
    withScores,
    withIncidents,
    withStats: withStandings > 0 ? 0 : 0, // no stats table rows yet
    withLineups: 0,
    withBroadcasts: broadcastsTotal,
    withOfficialBroadcasts,
    withVerifiedStreams,
    withPlayableStreams: playable,
    withExternalWatchLinks,
    staleLive,
    staleProviderData: staleLive,
    broadcastsTotal,
    broadcastsIptv,
    broadcastsTvBridge,
    bySport,
    byStatus,
    bySource,
    byProvider,
    cacheTtlSec: 30,
    source: "database",
  };

  // silence unused
  void fixtureBroadcastIds;

  memoryCache = { at: Date.now(), value };
  return value;
}

export function invalidateSportsCorrectnessCountsCache(): void {
  memoryCache = null;
}
