/**
 * Focused Sports live-state / playability / catalog filter tests.
 * Run: npm run test:sports-live-playability
 */

import assert from "node:assert/strict";

import {
  isPlaceholderSportsUrl,
  isPublicSportsCountryCode,
  isTestOrPlaceholderSportsFixture,
  isTestSportsCompetition,
} from "../lib/sports/catalogFilter";
import {
  computeSportsEffectiveLiveState,
  finishedFixtureStatusForPersist,
} from "../lib/sports/liveState";
import { deriveFixtureAvailability } from "../lib/sports/playback/playabilitySync";
import { mapSportsPublicEventStatus } from "../lib/sports/home/publicStatus";

function hoursFromNow(h: number, base = new Date("2026-07-18T16:00:00.000Z")) {
  return new Date(base.getTime() + h * 3600_000).toISOString();
}

function run() {
  const now = new Date("2026-07-18T16:00:00.000Z");

  // Stale provider live after end
  {
    const state = computeSportsEffectiveLiveState({
      fixtureStatus: "live",
      startsAt: hoursFromNow(-6, now),
      endsAt: hoursFromNow(-4, now),
      now,
    });
    assert.equal(state.effectiveLive, false);
    assert.equal(state.isFinished, true);
    assert.equal(state.reason, "stale_provider_live");
    assert.equal(
      finishedFixtureStatusForPersist({
        fixtureStatus: "live",
        startsAt: hoursFromNow(-6, now),
        endsAt: hoursFromNow(-4, now),
        now,
      }),
      "completed"
    );
    assert.equal(
      mapSportsPublicEventStatus({
        fixtureStatus: "live",
        startsAt: hoursFromNow(-6, now),
        endsAt: hoursFromNow(-4, now),
        now,
      }),
      "finished"
    );
  }

  // Missing endsAt — conservative duration, not infinite live
  {
    const state = computeSportsEffectiveLiveState({
      fixtureStatus: "live",
      startsAt: hoursFromNow(-10, now),
      endsAt: null,
      sportSlug: "football",
      now,
    });
    assert.equal(state.effectiveLive, false);
    assert.equal(state.isFinished, true);
  }

  // Finished / cancelled / upcoming
  {
    assert.equal(
      computeSportsEffectiveLiveState({
        fixtureStatus: "completed",
        startsAt: hoursFromNow(-2, now),
        endsAt: hoursFromNow(-1, now),
        now,
      }).effectiveLive,
      false
    );
    assert.equal(
      computeSportsEffectiveLiveState({
        fixtureStatus: "cancelled",
        startsAt: hoursFromNow(1, now),
        now,
      }).isCancelled,
      true
    );
    assert.equal(
      computeSportsEffectiveLiveState({
        fixtureStatus: "scheduled",
        startsAt: hoursFromNow(2, now),
        now,
      }).isUpcoming,
      true
    );
  }

  // Legitimate current live
  {
    const state = computeSportsEffectiveLiveState({
      fixtureStatus: "live",
      startsAt: hoursFromNow(-1, now),
      endsAt: hoursFromNow(1, now),
      now,
    });
    assert.equal(state.effectiveLive, true);
    assert.equal(
      mapSportsPublicEventStatus({
        fixtureStatus: "live",
        startsAt: hoursFromNow(-1, now),
        endsAt: hoursFromNow(1, now),
        now,
      }),
      "live"
    );
  }

  // Live without broadcasts → not playable
  {
    const derived = deriveFixtureAvailability({
      fixtureStatus: "live",
      startsAt: hoursFromNow(-1, now),
      endsAt: hoursFromNow(1, now),
      broadcasts: [],
      now,
    });
    assert.equal(derived.availabilityState, "live_unavailable");
    assert.equal(derived.playable, false);
  }

  // Live with validated in-app stream
  {
    const derived = deriveFixtureAvailability({
      fixtureStatus: "live",
      startsAt: hoursFromNow(-1, now),
      endsAt: hoursFromNow(1, now),
      broadcasts: [
        {
          id: "b1",
          broadcast_type: "live_match",
          access_type: "free",
          validation_status: "validated",
          health_score: 90,
          validation_expires_at: hoursFromNow(2, now),
          playback_kind: "webview",
          is_embeddable: true,
        },
      ],
      now,
    });
    assert.equal(derived.availabilityState, "live_in_app");
    assert.equal(derived.playable, true);
  }

  // Official external only
  {
    const derived = deriveFixtureAvailability({
      fixtureStatus: "live",
      startsAt: hoursFromNow(-1, now),
      endsAt: hoursFromNow(1, now),
      broadcasts: [
        {
          id: "b2",
          broadcast_type: "external_watch",
          access_type: "external",
          validation_status: "candidate",
          health_score: 0,
          playback_kind: "external",
        },
      ],
      now,
    });
    assert.equal(derived.availabilityState, "live_external");
    assert.equal(derived.playable, false);
  }

  // Placeholder domain rejection
  {
    const derived = deriveFixtureAvailability({
      fixtureStatus: "live",
      startsAt: hoursFromNow(-1, now),
      endsAt: hoursFromNow(1, now),
      broadcasts: [
        {
          id: "b3",
          broadcast_type: "live_match",
          access_type: "free",
          validation_status: "validated",
          health_score: 95,
          validation_expires_at: hoursFromNow(2, now),
          playback_kind: "webview",
          publisher_domain: "example.com",
          metadata: { officialUrl: "https://www.example.com/official-broadcast" },
        },
      ],
      now,
    });
    assert.equal(derived.playable, false);
    assert.equal(isPlaceholderSportsUrl("https://www.example.com/x"), true);
  }

  // Test fixture exclusion
  {
    assert.equal(
      isTestSportsCompetition({ name: "Premier League (Test)", slug: "pilot-premier-league" }),
      true
    );
    assert.equal(
      isTestOrPlaceholderSportsFixture({
        title: "Spurs vs Villa",
        competitionName: "NBA (Test)",
        competitionSlug: "pilot-nba",
      }),
      true
    );
    assert.equal(
      isTestOrPlaceholderSportsFixture({
        title: "Real Match",
        competitionName: "FIBA 3x3 Official",
        competitionSlug: "fiba-3x3",
        metadata: { source: "official_feed" },
      }),
      false
    );
  }

  // ZZ exclusion
  {
    assert.equal(isPublicSportsCountryCode("ZZ"), false);
    assert.equal(isPublicSportsCountryCode("US"), true);
    assert.equal(isPublicSportsCountryCode("GB"), true);
  }

  // Browse/play consistency: past-end never live_in_app
  {
    const derived = deriveFixtureAvailability({
      fixtureStatus: "live",
      startsAt: hoursFromNow(-5, now),
      endsAt: hoursFromNow(-3, now),
      broadcasts: [
        {
          id: "b4",
          broadcast_type: "live_match",
          access_type: "free",
          validation_status: "validated",
          health_score: 99,
          validation_expires_at: hoursFromNow(1, now),
          playback_kind: "hls",
        },
      ],
      now,
    });
    assert.equal(derived.playable, false);
    assert.equal(derived.availabilityState, "finished");
  }

  console.log("test-sports-live-playability: PASS");
}

run();
