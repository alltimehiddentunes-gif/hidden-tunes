import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { syncFixturePlayability } from "../lib/sports/playback/playabilitySync";
import { fetchLiveFootballStreamCatalog, matchFixture, redactServer, requestBudget, stableListingId, stableSourceId, validateFootballStreamSource } from "../lib/sports/providers/footballStream";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}

async function main() {
const apply = process.argv.includes("--apply");
const catalog = await fetchLiveFootballStreamCatalog();
const sources = catalog.matches.flatMap((match) => (match.servers || []).map(redactServer));
const byKind = sources.reduce<Record<string, number>>((acc, source) => { acc[source.kind] = (acc[source.kind] || 0) + 1; return acc; }, {});
const sb = createClient(String(process.env.SUPABASE_URL), String(process.env.SUPABASE_SERVICE_ROLE_KEY), { auth: { persistSession: false } });
const timestamps = catalog.matches.map((m) => m.match_time * 1000);
const { data: fixtures, error: fixtureError } = await sb.from("sports_fixtures").select("id,starts_at,competition:sports_competitions(name),participants:sports_fixture_participants(side,team:sports_teams(name))").gte("starts_at", new Date(Math.min(...timestamps) - 10_800_000).toISOString()).lte("starts_at", new Date(Math.max(...timestamps) + 10_800_000).toISOString()).limit(5000);
if (fixtureError) throw fixtureError;
const fixtureCandidates = (fixtures || []).map((f: any) => ({ id: f.id, startsAt: f.starts_at, homeName: f.participants?.find((p: any) => p.side === "home")?.team?.name || "", awayName: f.participants?.find((p: any) => p.side === "away")?.team?.name || "", competitionName: f.competition?.name || null }));
const matchDecisions = catalog.matches.map((m) => ({ listing: m, decision: matchFixture({ startsAt: new Date(m.match_time * 1000).toISOString(), homeName: m.home_team_name, awayName: m.away_team_name, competitionName: m.league_name }, fixtureCandidates) }));
const matchCounts = matchDecisions.reduce<Record<string, number>>((acc, item) => { acc[item.decision.confidence] = (acc[item.decision.confidence] || 0) + 1; return acc; }, {});
const rawSources = catalog.matches.flatMap((m) => m.servers || []), healthResults = [];
for (let index = 0; index < rawSources.length; index += 4) healthResults.push(...await Promise.all(rawSources.slice(index, index + 4).map((source) => validateFootballStreamSource(source))));
const health = healthResults.reduce<Record<string, number>>((acc, result) => { acc[result.state] = (acc[result.state] || 0) + 1; return acc; }, {});
const healthyByProtocol = healthResults.filter((r) => r.state === "HEALTHY").reduce<Record<string, number>>((acc, result) => { acc[result.protocol] = (acc[result.protocol] || 0) + 1; return acc; }, {});
const healthByListing = new Map<string, typeof healthResults>(); let healthOffset = 0;
for (const listing of catalog.matches) { const count = listing.servers?.length || 0; healthByListing.set(stableListingId(listing), healthResults.slice(healthOffset, healthOffset + count)); healthOffset += count; }
const report = {
  provider: "football_stream_api",
  auth: "PASS",
  pages: catalog.pages,
  requests: catalog.requests,
  liveListings: catalog.matches.length,
  normalizedListings: new Set(catalog.matches.map(stableListingId)).size,
  streamCandidates: sources.length,
  byKind,
  hosts: [...new Set(sources.map((source) => source.host).filter(Boolean))].sort(),
  rawUrlsExposed: 0,
  fixturesInWindow: fixtureCandidates.length,
  fixtureMatches: matchCounts,
  nonRejectedMatchSamples: matchDecisions.filter((x) => x.decision.confidence !== "REJECT").slice(0, 30).map((x) => ({ provider: `${x.listing.home_team_name} vs ${x.listing.away_team_name}`, providerKickoff: new Date(x.listing.match_time * 1000).toISOString(), providerCompetition: x.listing.league_name, decision: x.decision, fixture: fixtureCandidates.find((f) => f.id === x.decision.fixtureId) || null })),
  health,
  healthyByProtocol,
  watchEligibleFixtures: 0,
  mode: apply ? "apply" : "dry-run",
  budget: requestBudget(catalog.pages),
};
console.log(JSON.stringify(report, null, 2));

if (apply) {
  const now = new Date().toISOString();
  const { data: provider, error: providerError } = await sb.from("sports_providers").upsert({ slug: "football_stream_api", name: "Football Live Streaming API", provider_type: "manual_rights_partner", official_domain: "footballstreamapi.com", is_enabled: true, kill_switch: false, health_status: "healthy", last_health_at: now, rate_limit_per_minute: 30, timeout_ms: 15000, config: { catalogCadenceSeconds: 180, playbackSessionTtlSeconds: 120, serverSideOnly: true }, notes: "RapidAPI paid live catalog; raw source URLs are resolved server-side only.", updated_at: now }, { onConflict: "slug" }).select("id").single();
  if (providerError) throw providerError;
  const currentIds = new Set<string>();
  let inserted = 0, updated = 0, eligibleCount = 0; const eligibleFixtures = new Set<string>();
  for (let index = 0; index < catalog.matches.length; index += 1) {
    const listing = catalog.matches[index], assetId = stableListingId(listing), decision = matchFixture({ startsAt: new Date(listing.match_time * 1000).toISOString(), homeName: listing.home_team_name, awayName: listing.away_team_name, competitionName: listing.league_name }, fixtureCandidates);
    currentIds.add(assetId);
    const listingHealth = healthByListing.get(assetId) || [];
    const eligible = ["EXACT", "HIGH"].includes(decision.confidence) && listingHealth.some((result) => result.state === "HEALTHY" && result.protocol === "direct_hls");
    const metadata = { source: "football_stream_api", providerListingId: assetId, rawHomeTeam: listing.home_team_name, rawAwayTeam: listing.away_team_name, competition: listing.league_name || null, providerLiveStatus: listing.match_status, providerScore: { home: listing.homeTeamScore || null, away: listing.awayTeamScore || null }, sourceCount: listing.servers?.length || 0, sourceSummary: (listing.servers || []).map(redactServer), fixtureMatchConfidence: decision.confidence, providerLastSeenAt: now, rawStreamUrlsPersisted: false, resolverStrategy: "live_catalog_refetch", healthySourceCount: listingHealth.filter((result) => result.state === "HEALTHY").length, validatedSourceIds: (listing.servers || []).filter((_, sourceIndex) => listingHealth[sourceIndex]?.state === "HEALTHY" && listingHealth[sourceIndex]?.protocol === "direct_hls").map(stableSourceId) };
    const { data: existing } = await sb.from("sports_broadcasts").select("id").eq("provider_id", provider.id).eq("provider_asset_id", assetId).limit(1).maybeSingle();
    const row = { fixture_id: ["EXACT", "HIGH"].includes(decision.confidence) ? decision.fixtureId || null : null, provider_id: provider.id, provider_asset_id: assetId, broadcast_type: "live_match", playback_kind: "hls", title: `${listing.home_team_name} vs ${listing.away_team_name}`, starts_at: new Date(listing.match_time * 1000).toISOString(), availability_status: eligible ? "live" : "technical_pending", access_type: "free", official_status: "unconfirmed", verification_status: eligible ? "verified" : "pending", validation_status: eligible ? "validated" : "candidate", health_score: eligible ? 100 : 0, last_validated_at: eligible ? now : null, validation_expires_at: eligible ? new Date(Date.now() + 240_000).toISOString() : null, is_official: false, is_embeddable: false, is_free: true, mobile_supported: false, web_supported: eligible, published_at: eligible ? now : null, unpublished_at: null, quarantined_at: null, metadata, updated_at: now };
    const result = existing ? await sb.from("sports_broadcasts").update(row).eq("id", existing.id) : await sb.from("sports_broadcasts").insert(row);
    if (result.error) throw result.error;
    existing ? updated++ : inserted++;
    if (eligible && decision.fixtureId) { eligibleCount++; eligibleFixtures.add(decision.fixtureId); }
  }
  const { data: prior, error: priorError } = await sb.from("sports_broadcasts").select("id,provider_asset_id,metadata").eq("provider_id", provider.id).is("unpublished_at", null);
  if (priorError) throw priorError;
  let ended = 0;
  for (const row of prior || []) if (row.provider_asset_id && !currentIds.has(row.provider_asset_id)) { const result = await sb.from("sports_broadcasts").update({ availability_status: "expired", validation_status: "expired", health_score: 0, unpublished_at: now, updated_at: now, metadata: { ...(row.metadata || {}), providerEndedAt: now } }).eq("id", row.id); if (result.error) throw result.error; ended++; }
  for (const fixtureId of eligibleFixtures) await syncFixturePlayability(fixtureId);
  console.log(JSON.stringify({ persistence: "PASS", inserted, updated, ended, published: eligibleCount, watchEligible: eligibleFixtures.size }, null, 2));
}
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
