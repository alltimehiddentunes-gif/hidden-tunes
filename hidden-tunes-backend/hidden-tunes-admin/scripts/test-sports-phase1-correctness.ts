/**
 * Focused Phase 1 Sports correctness tests.
 * Run: npx tsx scripts/test-sports-phase1-correctness.ts
 */

import assert from "node:assert/strict";

import { classifySportsBroadcast } from "../lib/sports/broadcasts/classification";
import { mapApiFootballStatus } from "../lib/sports/fixtures/apiFootballStatus";
import {
  canonicalSportsTeamName,
  dedupeSportsProviderFixtures,
  extractApiFootballIdentity,
  extractOpenLigaDbIdentity,
} from "../lib/sports/fixtures/providerIdentity";
import { deriveFixtureAvailability } from "../lib/sports/playback/playabilitySync";
import {
  oldestPossibleSportsLiveStart,
  resolveSportsStatusAuthority,
} from "../lib/sports/status/statusAuthority";
import {
  sportsCacheGet,
  sportsCacheInvalidate,
  sportsCacheSet,
} from "../lib/sports/cache";
import { verifySportsStreamContract } from "../lib/sports/verification/streamContract";

function section(name: string) {
  console.log(`\n== ${name} ==`);
}

async function main() {
  section("no time-only transition to live");
  {
    const now = new Date("2026-07-25T12:00:00.000Z");
    const auth = resolveSportsStatusAuthority({
      fixtureStatus: "scheduled",
      startsAt: "2026-07-25T10:00:00.000Z",
      endsAt: "2026-07-25T13:00:00.000Z",
      now,
    });
    assert.equal(auth.providerConfirmedLive, false);
    assert.equal(auth.canonical, "scheduled");

    const avail = deriveFixtureAvailability({
      fixtureStatus: "scheduled",
      startsAt: "2026-07-25T10:00:00.000Z",
      endsAt: "2026-07-25T13:00:00.000Z",
      broadcasts: [],
      now,
    });
    assert.equal(avail.availabilityState, "upcoming");
    assert.equal(avail.playable, false);
  }

  section("provider-confirmed live still live");
  {
    const now = new Date("2026-07-25T12:00:00.000Z");
    const auth = resolveSportsStatusAuthority({
      fixtureStatus: "live",
      startsAt: "2026-07-25T11:00:00.000Z",
      endsAt: "2026-07-25T14:00:00.000Z",
      now,
    });
    assert.equal(auth.providerConfirmedLive, true);
    assert.equal(auth.staleLiveCandidate, false);
  }

  section("fresh provider status wins beyond scheduled duration");
  {
    const now = new Date("2026-07-25T15:00:00.000Z");
    const auth = resolveSportsStatusAuthority({
      fixtureStatus: "live",
      startsAt: "2026-07-25T11:00:00.000Z",
      endsAt: "2026-07-25T13:00:00.000Z",
      sportSlug: "football",
      providerStatusFreshAt: "2026-07-25T14:55:00.000Z",
      now,
    });
    assert.equal(auth.providerConfirmedLive, true);
    assert.equal(auth.staleLiveCandidate, false);
  }

  section("stale provider status cannot outlive hard sport duration");
  {
    const now = new Date("2026-07-25T15:00:00.000Z");
    const auth = resolveSportsStatusAuthority({
      fixtureStatus: "live",
      startsAt: "2026-07-25T11:00:00.000Z",
      // A bad far-future provider end must not defeat the football safeguard.
      endsAt: "2026-07-26T11:00:00.000Z",
      sportSlug: "football",
      providerStatusFreshAt: "2026-07-25T11:15:00.000Z",
      now,
    });
    assert.equal(auth.providerConfirmedLive, false);
    assert.equal(auth.staleLiveCandidate, true);
    assert.equal(auth.canonical, "ended_stream_unavailable");
  }

  section("unknown sports retain conservative twelve-hour window");
  {
    const now = new Date("2026-07-25T15:00:00.000Z");
    assert.equal(
      oldestPossibleSportsLiveStart(now),
      "2026-07-25T03:00:00.000Z"
    );
    const auth = resolveSportsStatusAuthority({
      fixtureStatus: "live",
      startsAt: "2026-07-25T04:00:00.000Z",
      sportSlug: "unknown-long-sport",
      now,
    });
    assert.equal(auth.providerConfirmedLive, true);
    assert.equal(auth.staleLiveCandidate, false);
  }

  section("stale-live past ends_at");
  {
    const now = new Date("2026-07-25T12:00:00.000Z");
    const auth = resolveSportsStatusAuthority({
      fixtureStatus: "live",
      startsAt: "2026-07-18T17:00:00.000Z",
      endsAt: "2026-07-18T21:00:00.000Z",
      now,
    });
    assert.equal(auth.staleLiveCandidate, true);
    assert.equal(auth.providerConfirmedLive, false);
    assert.equal(auth.canonical, "ended_stream_unavailable");

    const avail = deriveFixtureAvailability({
      fixtureStatus: "live",
      startsAt: "2026-07-18T17:00:00.000Z",
      endsAt: "2026-07-18T21:00:00.000Z",
      broadcasts: [],
      now,
    });
    assert.equal(avail.availabilityState, "finished");
    assert.equal(avail.playable, false);
  }

  section("postponed / cancelled");
  {
    for (const status of ["postponed", "cancelled", "suspended", "abandoned"]) {
      const avail = deriveFixtureAvailability({
        fixtureStatus: status,
        startsAt: "2026-07-25T18:00:00.000Z",
        broadcasts: [],
      });
      assert.equal(avail.availabilityState, "live_unavailable");
      assert.equal(avail.playable, false);
    }
  }

  section("terminal lifecycle authority");
  {
    const expected = new Map([
      ["finished", "completed"],
      ["postponed", "postponed"],
      ["cancelled", "cancelled"],
      ["abandoned", "abandoned"],
      ["suspended", "suspended"],
      ["delayed", "delayed"],
    ]);
    for (const [fixtureStatus, canonical] of expected) {
      const auth = resolveSportsStatusAuthority({ fixtureStatus });
      assert.equal(auth.canonical, canonical, fixtureStatus);
      assert.equal(auth.providerConfirmedLive, false, fixtureStatus);
    }
  }

  section("API-Football lifecycle normalization");
  {
    const expected = new Map([
      ["NS", ["scheduled", "scheduled"]],
      ["1H", ["live", "live"]],
      ["HT", ["halftime", "live"]],
      ["ET", ["extra_time", "live"]],
      ["P", ["penalties", "live"]],
      ["FT", ["finished", "completed"]],
      ["PST", ["postponed", "postponed"]],
      ["CANC", ["cancelled", "cancelled"]],
      ["ABD", ["abandoned", "cancelled"]],
      ["SUSP", ["suspended", "postponed"]],
      ["INT", ["delayed", "postponed"]],
    ]);
    for (const [code, [lifecycle, fixtureStatus]] of expected) {
      const mapped = mapApiFootballStatus(code);
      assert.equal(mapped.lifecycle, lifecycle, code);
      assert.equal(mapped.fixtureStatus, fixtureStatus, code);
      assert.equal(mapped.known, true, code);
    }
    assert.equal(mapApiFootballStatus("new-code").known, false);
  }

  section("authoritative provider identity preservation");
  {
    assert.deepEqual(
      extractOpenLigaDbIdentity({
        matchID: 83156,
        leagueId: 4937,
        team1: { teamId: 40, teamName: "FC Bayern München" },
        team2: { teamId: 16, teamName: "VfB Stuttgart" },
      }),
      {
        fixtureId: "83156",
        competitionId: "4937",
        homeTeamId: "40",
        awayTeamId: "16",
      }
    );
    assert.deepEqual(
      extractApiFootballIdentity({
        fixture: { id: 1497669 },
        league: { id: 114 },
        teams: { home: { id: 365 }, away: { id: 2171 } },
      }),
      {
        fixtureId: "1497669",
        competitionId: "114",
        homeTeamId: "365",
        awayTeamId: "2171",
      }
    );
    assert.equal(
      canonicalSportsTeamName("FC Bayern München"),
      canonicalSportsTeamName("FC Bayern Munchen")
    );
  }

  section("duplicate provider fixture prevention");
  {
    const rows = dedupeSportsProviderFixtures([
      { providerSlug: "openligadb", providerFixtureId: "83156", version: 1 },
      { providerSlug: "openligadb", providerFixtureId: "83156", version: 2 },
      { providerSlug: "api_football", providerFixtureId: "83156", version: 3 },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].version, 2);
    assert.equal(rows[1].version, 3);
  }

  section("cache invalidation after lifecycle transition");
  {
    const liveKey = "sports-home-ia:DE:mobile:Europe/Berlin";
    const otherKey = "sports-taxonomy:v1";
    sportsCacheSet(liveKey, { live: ["stale-fixture"] }, 20_000);
    sportsCacheSet(otherKey, { sports: ["football"] }, 20_000);
    assert.ok(sportsCacheGet(liveKey));
    sportsCacheInvalidate("sports-home-ia:");
    assert.equal(sportsCacheGet(liveKey), null);
    assert.ok(sportsCacheGet(otherKey));
    sportsCacheInvalidate();
  }

  section("IPTV source quarantine classification");
  {
    const c = classifySportsBroadcast({
      publisherName: "iptv-org Sports",
      broadcastType: "live_channel",
      isOfficial: true,
      verificationStatus: "verified",
      validationStatus: "validated",
    });
    assert.equal(c.classification, "rejected");
    assert.equal(c.publicStreamEligible, false);
    assert.equal(c.officialAllowed, false);
    assert.equal(c.verifiedAllowed, false);
  }

  section("TV-bridge generic rejection");
  {
    const c = classifySportsBroadcast({
      publisherName: "TV Catalog Sports Bridge",
      broadcastType: "live_channel",
      isOfficial: true,
      metadata: { source: "sports_worldwide_expansion_2026_07_18" },
    });
    assert.equal(c.classification, "generic_sports_channel");
    assert.equal(c.publicStreamEligible, false);
  }

  section("false official without evidence");
  {
    const c = classifySportsBroadcast({
      publisherName: "Mystery Stream Co",
      broadcastType: "live_match",
      isOfficial: true,
      metadata: {},
    });
    assert.equal(c.officialAllowed, false);
    assert.equal(c.classification, "unverified_channel_mapping");
  }

  section("generic channel cannot become live_in_app");
  {
    const avail = deriveFixtureAvailability({
      fixtureStatus: "live",
      startsAt: "2026-07-25T11:00:00.000Z",
      endsAt: "2026-07-25T14:00:00.000Z",
      broadcasts: [
        {
          id: "1",
          broadcast_type: "live_channel",
          access_type: "free",
          validation_status: "validated",
          health_score: 95,
          validation_expires_at: "2026-07-25T15:00:00.000Z",
          playback_kind: "hls",
          is_official: true,
          publisher_name: "TV Catalog Sports Bridge",
        },
      ],
      now: new Date("2026-07-25T12:00:00.000Z"),
    });
    assert.notEqual(avail.availabilityState, "live_in_app");
    assert.equal(avail.playable, false);
  }

  section("stream contract blocks IPTV and requires identity");
  {
    const blocked = await verifySportsStreamContract({
      url: "https://example.com/x.m3u8",
      publisherName: "iptv-org Sports M3U",
      allowNetworkProbe: false,
    });
    assert.equal(blocked.verification_status, "blocked");

    const noId = await verifySportsStreamContract({
      url: "https://example.com/x.m3u8",
      publisherName: "FIBA Basketball",
      officialOrganization: "",
      eventIdentityEvidence: false,
      allowNetworkProbe: false,
    });
    assert.equal(noId.verification_status, "failed");
    assert.match(String(noId.failure_reason), /identity/);
  }

  section("completed finalization path");
  {
    const avail = deriveFixtureAvailability({
      fixtureStatus: "completed",
      startsAt: "2026-07-18T17:00:00.000Z",
      endsAt: "2026-07-18T21:00:00.000Z",
      broadcasts: [],
    });
    assert.equal(avail.availabilityState, "finished");
  }

  console.log("\nALL PHASE1 CORRECTNESS TESTS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
