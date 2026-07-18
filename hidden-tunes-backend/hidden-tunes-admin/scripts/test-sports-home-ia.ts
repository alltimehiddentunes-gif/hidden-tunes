/**
 * Sports Phase 2B home IA contract tests — pure domain (no DB).
 * Run: npx tsx scripts/test-sports-home-ia.ts
 */

import assert from "node:assert/strict";

import {
  assembleSportsHomeFromSettled,
  decodeSportsCursor,
  encodeSportsCursor,
  omitEmptyHomeContractSections,
  sortHomeSections,
} from "../lib/sports/home/assemble";
import {
  sanitizeSportsBrowsePayload,
  sportsBrowsePayloadLeaksSecrets,
  toSportsMatchCard,
} from "../lib/sports/home/matchCard";
import {
  describeSportsPublicEventStatus,
  mapSportsPublicEventStatus,
  watchabilityFromPublicStatus,
} from "../lib/sports/home/publicStatus";
import { getCalendarDayBounds } from "../lib/sports/home/timezone";
import { SPORTS_FEATURE_FLAG_DEFAULTS } from "../lib/sports/constants";
import type { SportsHomeSection } from "../lib/sports/home/types";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const baseCardInput = {
  id: "fx-1",
  sport: { id: "s1", slug: "football", name: "Football" },
  competition: {
    id: "c1",
    slug: "epl",
    name: "Premier League",
    shortName: "EPL",
    logoUrl: "https://cdn.example/logo.png",
    countryCode: "GB",
  },
  participants: [
    {
      id: "t1",
      type: "team" as const,
      name: "Home FC",
      side: "home",
      score: 1,
    },
    {
      id: "t2",
      type: "team" as const,
      name: "Away FC",
      side: "away",
      score: 0,
    },
  ],
  startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
};

test("status: scheduled maps to scheduled", () => {
  assert.equal(
    mapSportsPublicEventStatus({ fixtureStatus: "scheduled" }),
    "scheduled"
  );
});

test("status: live maps to live", () => {
  assert.equal(mapSportsPublicEventStatus({ fixtureStatus: "live" }), "live");
});

test("status: starting soon within window", () => {
  const startsAt = new Date(Date.now() + 30 * 60_000).toISOString();
  assert.equal(
    mapSportsPublicEventStatus({
      fixtureStatus: "scheduled",
      startsAt,
      startingSoonWindowMs: 120 * 60_000,
    }),
    "starting_soon"
  );
});

test("status: half_time from metadata period", () => {
  assert.equal(
    mapSportsPublicEventStatus({
      fixtureStatus: "live",
      metadata: { period: "half_time" },
    }),
    "half_time"
  );
});

test("status: finished + replay", () => {
  assert.equal(
    mapSportsPublicEventStatus({
      fixtureStatus: "completed",
      hasReplay: true,
    }),
    "replay_available"
  );
});

test("status: postponed / cancelled", () => {
  assert.equal(
    mapSportsPublicEventStatus({ fixtureStatus: "postponed" }),
    "postponed"
  );
  assert.equal(
    mapSportsPublicEventStatus({ fixtureStatus: "cancelled" }),
    "cancelled"
  );
});

test("status describe live/finished flags", () => {
  const live = describeSportsPublicEventStatus("live");
  assert.equal(live.live, true);
  assert.equal(live.finished, false);
  const finished = describeSportsPublicEventStatus("finished");
  assert.equal(finished.finished, true);
});

test("match-card: canonical shape + no leaks", () => {
  const card = toSportsMatchCard({
    ...baseCardInput,
    fixtureStatus: "live",
    hasPlayableBroadcast: true,
  });
  assert.equal(card.id, "fx-1");
  assert.equal(card.sport.slug, "football");
  assert.equal(card.participants.length, 2);
  assert.equal(card.status.code, "live");
  assert.equal(card.watchability.playable, true);
  assert.equal(card.watchability.state, "watch");
  const leaks = sportsBrowsePayloadLeaksSecrets(card);
  assert.equal(leaks.length, 0, leaks.join(", "));
});

test("match-card: strips provider/playback leak keys", () => {
  const dirty = {
    id: "x",
    streamUrl: "https://cdn.example/live.m3u8",
    embedHtml: "<iframe src='https://evil'></iframe>",
    ok: "safe",
    nested: { source_url_encrypted: "secret", name: "Home" },
  };
  const clean = sanitizeSportsBrowsePayload(dirty);
  assert.equal("streamUrl" in clean, false);
  assert.equal("embedHtml" in clean, false);
  assert.equal("source_url_encrypted" in clean.nested, false);
  assert.equal(clean.ok, "safe");
  assert.equal(clean.nested.name, "Home");
});

test("Live Now requires playable broadcast", () => {
  const noPlay = toSportsMatchCard({
    ...baseCardInput,
    fixtureStatus: "live",
    hasPlayableBroadcast: false,
  });
  assert.equal(noPlay.status.live, true);
  assert.equal(noPlay.watchability.playable, false);

  const play = toSportsMatchCard({
    ...baseCardInput,
    fixtureStatus: "live",
    hasPlayableBroadcast: true,
  });
  assert.equal(play.watchability.playable, true);
});

test("Starting Soon does not falsely claim playback", () => {
  const startsAt = new Date(Date.now() + 20 * 60_000).toISOString();
  const card = toSportsMatchCard({
    ...baseCardInput,
    startsAt,
    fixtureStatus: "scheduled",
    hasPlayableBroadcast: true,
  });
  assert.equal(card.status.code, "starting_soon");
  assert.equal(card.watchability.playable, false);
  assert.notEqual(card.watchability.state, "watch");
});

test("Recently Finished time window + no Watch", () => {
  const card = toSportsMatchCard({
    ...baseCardInput,
    fixtureStatus: "completed",
    startsAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    hasPlayableBroadcast: true,
    hasReplay: true,
  });
  assert.equal(card.status.code, "replay_available");
  assert.equal(card.watchability.playable, false);
  assert.equal(card.watchability.state, "replay");
});

test("watchability helpers", () => {
  const w = watchabilityFromPublicStatus("live", { hasPlayableBroadcast: true });
  assert.equal(w.playable, true);
  const soon = watchabilityFromPublicStatus("starting_soon");
  assert.equal(soon.playable, false);
});

test("Today's Schedule timezone boundaries (not UTC day)", () => {
  // 2026-07-17 22:30 UTC is still 2026-07-17 in America/Los_Angeles (15:30)
  // and already 2026-07-18 in Asia/Tokyo (07:30 next day).
  const utcEvening = new Date("2026-07-17T22:30:00.000Z");
  const la = getCalendarDayBounds(utcEvening, "America/Los_Angeles");
  const tokyo = getCalendarDayBounds(utcEvening, "Asia/Tokyo");
  assert.equal(la.localDate, "2026-07-17");
  assert.equal(tokyo.localDate, "2026-07-18");
  assert.notEqual(la.startIso, tokyo.startIso);
  // Bounds must cover the local midnight→midnight window.
  assert.ok(Date.parse(la.startIso) < utcEvening.getTime());
  assert.ok(Date.parse(la.endIso) > utcEvening.getTime());
});

test("section ordering by rank", () => {
  const sections = sortHomeSections([
    {
      id: "replays",
      type: "videos",
      title: "Replays",
      rank: 130,
      items: [{ id: "1" }],
    },
    {
      id: "live_now",
      type: "live",
      title: "Live Now",
      rank: 10,
      items: [{ id: "2" }],
    },
    {
      id: "featured",
      type: "fixtures",
      title: "Featured",
      rank: 30,
      items: [{ id: "3" }],
    },
  ] as SportsHomeSection[]);
  assert.deepEqual(
    sections.map((s) => s.id),
    ["live_now", "featured", "replays"]
  );
});

test("empty sections omitted", () => {
  const kept = omitEmptyHomeContractSections([
    {
      id: "live_now",
      type: "live",
      title: "Live Now",
      rank: 10,
      items: [],
    },
    {
      id: "featured",
      type: "fixtures",
      title: "Featured",
      rank: 30,
      items: [{ id: "a" }],
    },
  ] as SportsHomeSection[]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, "featured");
});

test("section failure isolation via allSettled assemble", () => {
  const settled: PromiseSettledResult<{
    id: "live_now" | "featured" | "trending";
    type: "live" | "fixtures";
    items: unknown[];
  }>[] = [
    {
      status: "fulfilled",
      value: {
        id: "live_now",
        type: "live",
        items: [{ id: "1" }],
      },
    },
    {
      status: "rejected",
      reason: new Error("featured boom"),
    },
    {
      status: "fulfilled",
      value: { id: "trending", type: "fixtures", items: [] },
    },
  ];
  const { response, sectionErrors } = assembleSportsHomeFromSettled({
    settled: settled as never,
    labels: ["live_now", "featured", "trending"],
  });
  assert.equal(sectionErrors.length, 1);
  assert.equal(sectionErrors[0].section, "featured");
  assert.equal(response.sections.length, 1);
  assert.equal(response.sections[0].id, "live_now");
  assert.ok(!response.sections.some((s) => s.id === "trending"));
});

test("Trending omitted without signals (empty loader result)", () => {
  const { response } = assembleSportsHomeFromSettled({
    settled: [
      {
        status: "fulfilled",
        value: { id: "trending", type: "fixtures", items: [] },
      },
    ] as never,
    labels: ["trending"],
  });
  assert.equal(response.sections.length, 0);
});

test("Anonymous Because You Follow omission", () => {
  const { response } = assembleSportsHomeFromSettled({
    settled: [
      {
        status: "fulfilled",
        value: { id: "because_you_follow", type: "fixtures", items: [] },
      },
    ] as never,
    labels: ["because_you_follow"],
  });
  assert.equal(response.sections.length, 0);
});

test("No-follow Because You Follow omission", () => {
  // Same empty contract as anonymous — loader returns [].
  const { response } = assembleSportsHomeFromSettled({
    settled: [
      {
        status: "fulfilled",
        value: { id: "because_you_follow", type: "fixtures", items: [] },
      },
    ] as never,
    labels: ["because_you_follow"],
  });
  assert.ok(!response.sections.find((s) => s.id === "because_you_follow"));
});

test("Continue Watching isolation (Sports-only section id)", () => {
  const { response } = assembleSportsHomeFromSettled({
    settled: [
      {
        status: "fulfilled",
        value: {
          id: "continue_watching",
          type: "fixtures",
          items: [{ id: "cw-1" }],
        },
      },
    ] as never,
    labels: ["continue_watching"],
  });
  assert.equal(response.sections[0].id, "continue_watching");
  assert.equal(response.sections[0].title, "Continue Watching");
});

test("stable pagination cursors", () => {
  const c0 = encodeSportsCursor(0);
  const c20 = encodeSportsCursor(20);
  assert.equal(decodeSportsCursor(c0), 0);
  assert.equal(decodeSportsCursor(c20), 20);
  assert.notEqual(c0, c20);
  assert.equal(decodeSportsCursor("not-a-cursor"), 0);
});

test("feature flags default off for home IA + mobile pilot", () => {
  assert.equal(SPORTS_FEATURE_FLAG_DEFAULTS.sports_enabled, false);
  assert.equal(SPORTS_FEATURE_FLAG_DEFAULTS.sports_home_ia_enabled, false);
  assert.equal(SPORTS_FEATURE_FLAG_DEFAULTS.sports_mobile_pilot_enabled, false);
});

test("provider playback URLs not in match card", () => {
  const card = toSportsMatchCard({
    ...baseCardInput,
    fixtureStatus: "live",
    hasPlayableBroadcast: true,
  });
  const json = JSON.stringify(card);
  assert.equal(/m3u8|\.mpd|iframe|source_url|api_key|Bearer/i.test(json), false);
  assert.equal("manifestUrl" in card, false);
  assert.equal("embedUrl" in card, false);
});

console.log(`\n${passed} passed`);
