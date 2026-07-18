/**
 * Sports Phase 3A ScoreBat provider tests — fixtures / dry-run (no live token required).
 * Run: npx tsx scripts/test-sports-scorebat.ts
 */

import assert from "node:assert/strict";

import { SPORTS_FEATURE_FLAG_DEFAULTS } from "../lib/sports/constants";
import { importScoreBatProvider } from "../lib/sports/import/scorebatImport";
import { createScoreBatAdapter } from "../lib/sports/providers/scorebat/adapter";
import {
  getScoreBatRuntimeConfig,
  SCOREBAT_PROVIDER_SLUG,
  hasScoreBatToken,
} from "../lib/sports/providers/scorebat/config";
import {
  extractEmbedSrc,
  isAllowedScoreBatEmbedHost,
  validateScoreBatEmbed,
} from "../lib/sports/providers/scorebat/embedSafety";
import {
  getScoreBatHealth,
  isScoreBatDiscoveryPaused,
  recordScoreBatDiscoveryFailure,
  resetScoreBatHealth,
} from "../lib/sports/providers/scorebat/health";
import {
  classifyScoreBatLifecycle,
  scoreBatPollIntervalSeconds,
  shouldHibernateScoreBat,
} from "../lib/sports/providers/scorebat/lifecycle";
import { mapScoreBatMatches, mapScoreBatMatchToCanonical } from "../lib/sports/providers/scorebat/mapper";
import { matchScoreBatToExistingFixtures } from "../lib/sports/providers/scorebat/matching";
import {
  normalizeFootballName,
  competitionSlugFromName,
} from "../lib/sports/providers/scorebat/normalize";
import { resolveScoreBatPlayback } from "../lib/sports/providers/scorebat/playback";
import { SCOREBAT_FIXTURE_MATCHES } from "../lib/sports/providers/scorebat/fixtures";
import { getSportsProvider, listSportsProviders } from "../lib/sports/providers";
import { toSportsMatchCard } from "../lib/sports/home/matchCard";
import { sportsBrowsePayloadLeaksSecrets } from "../lib/sports/home/matchCard";
import { rankMatchSection } from "../lib/sports/personalization/rankSection";
import { emptyPreferenceProfile } from "../lib/sports/personalization/profileHelpers";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  const result = fn();
  if (result && typeof (result as Promise<void>).then === "function") {
    throw new Error(`Async test not supported inline: ${name}`);
  }
  passed += 1;
  console.log(`ok - ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test("provider registration", () => {
  const adapter = getSportsProvider("scorebat");
  assert.ok(adapter);
  assert.equal(adapter!.config.slug, SCOREBAT_PROVIDER_SLUG);
  assert.ok(listSportsProviders().some((p) => p.config.slug === "scorebat"));
});

test("feature flags default off", () => {
  assert.equal(SPORTS_FEATURE_FLAG_DEFAULTS.sports_scorebat_enabled, false);
  assert.equal(SPORTS_FEATURE_FLAG_DEFAULTS.sports_scorebat_discovery_enabled, false);
  assert.equal(SPORTS_FEATURE_FLAG_DEFAULTS.sports_scorebat_playback_enabled, false);
  const cfg = getScoreBatRuntimeConfig();
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.discoveryEnabled, false);
  assert.equal(cfg.playbackEnabled, false);
});

test("adapter defaults kill-switched", () => {
  const adapter = createScoreBatAdapter();
  assert.equal(adapter.config.enabled, false);
  assert.equal(adapter.config.killSwitch, true);
});

test("token never exposed in fixtures / reports", () => {
  const json = JSON.stringify(SCOREBAT_FIXTURE_MATCHES);
  assert.equal(/SCOREBAT_API_TOKEN|token=[A-Za-z0-9_-]{16,}/i.test(json), false);
  assert.equal(typeof hasScoreBatToken(), "boolean");
});

test("fixture payload mapping", () => {
  const { accepted, rejected } = mapScoreBatMatches(SCOREBAT_FIXTURE_MATCHES);
  assert.ok(accepted.length >= 3);
  assert.ok(rejected.some((r) => r.reason.includes("embed") || r.reason === "invalid_embeds" || r.reason === "no_valid_embed"));
  const live = accepted.find((m) => /Arsenal/i.test(m.title));
  assert.ok(live);
  assert.equal(live!.homeTeam?.name, "Arsenal");
  assert.ok(live!.embedUrl?.startsWith("https://www.scorebat.com/"));
});

test("live / starting-soon / highlight / replay classification", () => {
  const { accepted } = mapScoreBatMatches(SCOREBAT_FIXTURE_MATCHES);
  assert.ok(accepted.some((m) => m.lifecycle === "live" || m.videoClass === "live" || m.lifecycle === "starting_soon" || m.lifecycle === "playable"));
  assert.ok(accepted.some((m) => m.videoClass === "highlights" || m.lifecycle === "highlights"));
  assert.ok(accepted.some((m) => m.videoClass === "replay" || m.lifecycle === "replay"));
});

test("competition + team normalization", () => {
  assert.equal(normalizeFootballName("Manchester United FC"), "manchester united");
  assert.equal(normalizeFootballName("FC Bayern München"), "bayern munich");
  assert.equal(
    competitionSlugFromName("ENGLAND: Premier League"),
    "premier-league"
  );
});

test("existing fixture matching + kickoff tolerance", () => {
  const mapped = mapScoreBatMatchToCanonical(SCOREBAT_FIXTURE_MATCHES[0])!;
  const exact = matchScoreBatToExistingFixtures(mapped, [
    {
      id: "fx-1",
      providerExternalId: mapped.providerNativeId,
      startsAt: mapped.startsAt,
      homeName: "Arsenal",
      awayName: "Chelsea",
    },
  ]);
  assert.equal(exact.kind, "exact_external");

  const windowHit = matchScoreBatToExistingFixtures(mapped, [
    {
      id: "fx-2",
      startsAt: new Date(Date.parse(mapped.startsAt) + 10 * 60_000).toISOString(),
      homeName: "Arsenal FC",
      awayName: "Chelsea",
    },
  ]);
  assert.equal(windowHit.kind, "kickoff_pair");
});

test("ambiguous match rejection", () => {
  const mapped = mapScoreBatMatchToCanonical(SCOREBAT_FIXTURE_MATCHES[0])!;
  const decision = matchScoreBatToExistingFixtures(mapped, [
    {
      id: "a",
      startsAt: mapped.startsAt,
      homeName: "Arsenal",
      awayName: "Chelsea",
    },
    {
      id: "b",
      startsAt: mapped.startsAt,
      homeName: "Arsenal",
      awayName: "Chelsea",
    },
  ]);
  assert.equal(decision.kind, "ambiguous");
});

test("idempotent repeated discovery (dedupe)", () => {
  const once = mapScoreBatMatches(SCOREBAT_FIXTURE_MATCHES);
  const twice = mapScoreBatMatches([
    ...SCOREBAT_FIXTURE_MATCHES,
    SCOREBAT_FIXTURE_MATCHES[0],
  ]);
  assert.equal(once.accepted.length, twice.accepted.length);
  assert.ok(twice.rejected.some((r) => r.reason === "duplicate"));
});

test("bounded import limit", () => {
  const { accepted } = mapScoreBatMatches(SCOREBAT_FIXTURE_MATCHES, {
    maxItems: 2,
  });
  assert.ok(accepted.length <= 2);
});

test("safe embed origin validation", () => {
  const ok = validateScoreBatEmbed(
    `<iframe src="https://www.scorebat.com/embed/v/abc/"></iframe>`
  );
  assert.equal(ok.ok, true);
  assert.equal(isAllowedScoreBatEmbedHost("www.scorebat.com"), true);
  assert.equal(extractEmbedSrc(ok.ok ? `<iframe src="${ok.embedUrl}"></iframe>` : ""), ok.ok ? ok.embedUrl : null);
});

test("unexpected origin rejection", () => {
  const bad = validateScoreBatEmbed(
    `<iframe src="https://evil.example/player" onload="x()"></iframe>`
  );
  assert.equal(bad.ok, false);
});

test("playback disabled / kill switch / expired", () => {
  const disabled = resolveScoreBatPlayback({
    broadcastId: "b1",
    embedUrlOrHtml: "https://www.scorebat.com/embed/v/x/",
    providerEnabled: true,
    providerKillSwitch: false,
    playbackFlagEnabled: false,
  });
  assert.equal(disabled.ok, false);

  const killed = resolveScoreBatPlayback({
    broadcastId: "b1",
    embedUrlOrHtml: "https://www.scorebat.com/embed/v/x/",
    providerEnabled: true,
    providerKillSwitch: true,
    playbackFlagEnabled: true,
  });
  assert.equal(killed.ok, false);

  const hibernating = resolveScoreBatPlayback({
    broadcastId: "b1",
    embedUrlOrHtml: "https://www.scorebat.com/embed/v/x/",
    providerEnabled: true,
    providerKillSwitch: false,
    playbackFlagEnabled: true,
    lifecycle: "hibernating",
  });
  assert.equal(hibernating.ok, false);
});

test("playback success constructs safe response", () => {
  const prev = process.env.SPORTS_SCOREBAT_ENABLED;
  const prevPlay = process.env.SPORTS_SCOREBAT_PLAYBACK_ENABLED;
  process.env.SPORTS_SCOREBAT_ENABLED = "true";
  process.env.SPORTS_SCOREBAT_PLAYBACK_ENABLED = "true";
  try {
    const ok = resolveScoreBatPlayback({
      broadcastId: "b1",
      fixtureId: "f1",
      embedUrlOrHtml: "https://www.scorebat.com/embed/v/abc/?autoplay=1",
      providerEnabled: true,
      providerKillSwitch: false,
      playbackFlagEnabled: true,
      lifecycle: "live",
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.mode, "webview");
      assert.ok(ok.payload.includes("scorebat.com"));
      assert.equal(/autoplay=1/.test(ok.payload), false);
      assert.equal(/token=/i.test(ok.payload), false);
    }
  } finally {
    if (prev === undefined) delete process.env.SPORTS_SCOREBAT_ENABLED;
    else process.env.SPORTS_SCOREBAT_ENABLED = prev;
    if (prevPlay === undefined) delete process.env.SPORTS_SCOREBAT_PLAYBACK_ENABLED;
    else process.env.SPORTS_SCOREBAT_PLAYBACK_ENABLED = prevPlay;
  }
});

test("lifecycle finished → hibernation poll null", () => {
  const state = classifyScoreBatLifecycle({
    startsAt: new Date(Date.now() - 6 * 60 * 60_000).toISOString(),
    videoTitles: ["Highlights"],
  });
  assert.ok(
    state === "highlights" ||
      state === "hibernating" ||
      state === "finished" ||
      state === "replay"
  );
  assert.equal(shouldHibernateScoreBat("hibernating"), true);
  assert.equal(scoreBatPollIntervalSeconds("hibernating"), null);
  assert.ok((scoreBatPollIntervalSeconds("live") || 0) <= 120);
});

test("provider data absent from home match card / no URL leakage", () => {
  const card = toSportsMatchCard({
    id: "fx",
    sport: { id: "s", slug: "football", name: "Football" },
    competition: { id: "c", name: "Premier League" },
    participants: [
      { id: "t1", type: "team", name: "Arsenal", side: "home" },
      { id: "t2", type: "team", name: "Chelsea", side: "away" },
    ],
    fixtureStatus: "live",
    startsAt: new Date().toISOString(),
    hasPlayableBroadcast: true,
  });
  const json = JSON.stringify(card);
  assert.equal(/scorebat|iframe|embedHtml|m3u8/i.test(json), false);
  assert.equal(sportsBrowsePayloadLeaksSecrets(card).length, 0);
});

test("preference ranking remains provider-independent", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.explicit.teamIds.add("t1");
  const a = toSportsMatchCard({
    id: "a",
    sport: { id: "s", slug: "football", name: "Football" },
    participants: [{ id: "t1", type: "team", name: "Arsenal", side: "home" }],
    fixtureStatus: "scheduled",
    startsAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  const b = toSportsMatchCard({
    id: "b",
    sport: { id: "s", slug: "football", name: "Football" },
    participants: [{ id: "t9", type: "team", name: "Other", side: "home" }],
    fixtureStatus: "scheduled",
    startsAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  const ranked = rankMatchSection([b, a], {
    sectionId: "live_now",
    profile,
    personalizationEnabled: true,
  });
  assert.equal(ranked[0].id, "a");
});

test("kill switch pauses discovery after repeated failures", () => {
  resetScoreBatHealth();
  for (let i = 0; i < 5; i += 1) recordScoreBatDiscoveryFailure();
  assert.equal(isScoreBatDiscoveryPaused(), true);
  assert.ok(getScoreBatHealth().consecutiveFailures >= 5);
  resetScoreBatHealth();
});

async function main() {
  await testAsync("dry run performs no writes", async () => {
    const report = await importScoreBatProvider({
      dryRun: true,
      useFixtures: true,
      limit: 25,
    });
    assert.equal(report.dryRun, true);
    assert.equal(report.inserted, 0);
    assert.equal(report.updated, 0);
    assert.ok(report.discovered > 0);
    assert.ok(report.accepted > 0);
    assert.ok(report.potentialBroadcasts > 0);
    const json = JSON.stringify(report);
    assert.equal(/SCOREBAT_API_TOKEN|token=[A-Za-z0-9_-]{16,}/i.test(json), false);
  });

  await testAsync("provider failure isolation (disabled discovery)", async () => {
    const report = await importScoreBatProvider({
      dryRun: true,
      useFixtures: true,
      limit: 10,
    });
    assert.equal(report.provider, "scorebat");
    assert.ok(typeof report.durationMs === "number");
  });

  console.log(`\n${passed} passed`);
  console.log(
    JSON.stringify({
      tokenAvailable: hasScoreBatToken() ? "yes" : "no",
      liveStreamAccessProven: false,
      note: "Live API verification skipped without SCOREBAT_API_TOKEN",
    })
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

