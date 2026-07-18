/**
 * Sports Phase 2 playback resolver / validation unit tests (no DB required).
 * Run: npx tsx scripts/test-sports-playback-resolver.ts
 */

import assert from "node:assert/strict";

import {
  SPORTS_PLAYBACK_ALLOWLIST,
  isHostAllowedForProvider,
  isPlaybackKindAllowed,
  normalizePlaybackKind,
} from "../lib/sports/playback/allowlist";
import {
  SPORTS_READY_HEALTH_THRESHOLD,
  computeSportsBroadcastHealthScore,
  isEligibleForReadyPlayback,
} from "../lib/sports/playback/healthScore";
import { validateSportsBroadcast } from "../lib/sports/playback/validateBroadcast";
import { deriveFixtureAvailability } from "../lib/sports/playback/playabilitySync";
import {
  assessScoreBatEntitlement,
  createScoreBatVideoProvider,
} from "../lib/sports/providers/scorebat/videoProvider";
import { hashPlaybackToken, mintPlaybackToken } from "../lib/sports/playback/tokens";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  const result = fn();
  if (result && typeof (result as Promise<void>).then === "function") {
    throw new Error(`Use testAsync for: ${name}`);
  }
  passed += 1;
  console.log(`ok - ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test("allowlist rejects arbitrary hosts", () => {
  assert.equal(isHostAllowedForProvider("scorebat", "evil.example"), false);
  assert.equal(isHostAllowedForProvider("scorebat", "www.scorebat.com"), true);
  assert.equal(isPlaybackKindAllowed("scorebat", "iframe"), true);
  assert.equal(isPlaybackKindAllowed("scorebat", "hls"), false);
  assert.equal(normalizePlaybackKind("embed"), "iframe");
  assert.ok(SPORTS_PLAYBACK_ALLOWLIST.scorebat.contentClass === "highlights");
});

test("health score threshold gate", () => {
  const good = computeSportsBroadcastHealthScore({
    validatedWithinMs: 30_000,
    isOfficial: true,
    mobileInAppConfirmed: true,
    countryEligible: true,
    fixtureIdentityConfirmed: true,
    providerHealthy: true,
  });
  assert.ok(good >= SPORTS_READY_HEALTH_THRESHOLD);
  assert.equal(
    isEligibleForReadyPlayback({
      healthScore: good,
      validationStatus: "validated",
      validationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      providerStatus: "healthy",
    }),
    true
  );
  assert.equal(
    isEligibleForReadyPlayback({
      healthScore: 69,
      validationStatus: "validated",
      providerStatus: "healthy",
    }),
    false
  );
  assert.equal(
    isEligibleForReadyPlayback({
      healthScore: 100,
      validationStatus: "candidate",
      providerStatus: "healthy",
    }),
    false
  );
});

test("health penalties for prohibited host", () => {
  const score = computeSportsBroadcastHealthScore({
    invalidOrProhibitedHost: true,
  });
  assert.ok(score <= -100);
});

test("validateSportsBroadcast rejects HTTP-only proof", () => {
  const result = validateSportsBroadcast({
    providerId: "scorebat",
    providerEnabled: true,
    providerKillSwitch: false,
    providerAssetId: "asset-1",
    playbackKind: "iframe",
    embedUrlOrHtml: "https://www.scorebat.com/embed/g/123/",
    isOfficial: true,
    isEmbeddable: true,
    mobileSupported: true,
    fixtureId: "fix-1",
    expectedFixtureId: "fix-1",
    platform: "ios",
    // Missing assetProof → must fail (HTTP 200 alone insufficient)
  });
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "asset_proof_missing");
});

test("validateSportsBroadcast accepts embed contract proof", () => {
  const result = validateSportsBroadcast({
    providerId: "scorebat",
    providerEnabled: true,
    providerKillSwitch: false,
    providerStatus: "healthy",
    providerAssetId: "asset-1",
    playbackKind: "iframe",
    embedUrlOrHtml: "https://www.scorebat.com/embed/g/123/",
    isOfficial: true,
    isEmbeddable: true,
    mobileSupported: true,
    fixtureId: "fix-1",
    expectedFixtureId: "fix-1",
    platform: "ios",
    countryCode: "US",
    assetProof: { exists: true, embedContractOk: true },
  });
  assert.equal(result.status, "validated");
  assert.ok(result.healthScore >= SPORTS_READY_HEALTH_THRESHOLD);
});

test("validateSportsBroadcast blocks unknown provider", () => {
  const result = validateSportsBroadcast({
    providerId: "random-cdn",
    providerEnabled: true,
    providerKillSwitch: false,
    providerAssetId: "x",
    playbackKind: "iframe",
    embedUrlOrHtml: "https://evil.example/stream",
    platform: "web",
    assetProof: { exists: true, embedContractOk: true },
  });
  assert.equal(result.status, "blocked");
});

test("validateSportsBroadcast blocks subscription for in-app", () => {
  const result = validateSportsBroadcast({
    providerId: "scorebat",
    providerEnabled: true,
    providerKillSwitch: false,
    providerAssetId: "asset-1",
    playbackKind: "iframe",
    embedUrlOrHtml: "https://www.scorebat.com/embed/g/123/",
    requiresSubscription: true,
    platform: "ios",
    assetProof: { exists: true, embedContractOk: true },
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "subscription_required");
});

test("playability: only validation grants playable", () => {
  const metaOnly = deriveFixtureAvailability({
    fixtureStatus: "live",
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    broadcasts: [],
  });
  assert.equal(metaOnly.availabilityState, "live_unavailable");
  assert.equal(metaOnly.playable, false);

  const validatedHighlights = deriveFixtureAvailability({
    fixtureStatus: "completed",
    startsAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    endsAt: new Date(Date.now() - 3600_000).toISOString(),
    broadcasts: [
      {
        id: "b1",
        broadcast_type: "highlights",
        access_type: "free",
        validation_status: "validated",
        health_score: 85,
        validation_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    ],
  });
  assert.equal(validatedHighlights.availabilityState, "highlights_available");
  assert.equal(validatedHighlights.playable, true);

  const unvalidated = deriveFixtureAvailability({
    fixtureStatus: "completed",
    startsAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    broadcasts: [
      {
        id: "b1",
        broadcast_type: "highlights",
        access_type: "free",
        validation_status: "candidate",
        health_score: 0,
      },
    ],
  });
  assert.equal(unvalidated.playable, false);
  assert.equal(unvalidated.availabilityState, "finished");
});

test("playability: live_in_app only with validated live broadcast", () => {
  const live = deriveFixtureAvailability({
    fixtureStatus: "live",
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    broadcasts: [
      {
        id: "b1",
        broadcast_type: "live_match",
        access_type: "free",
        validation_status: "validated",
        health_score: 90,
        validation_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    ],
  });
  assert.equal(live.availabilityState, "live_in_app");
  assert.equal(live.playable, true);
});

test("session token hashing is opaque", () => {
  const token = mintPlaybackToken();
  const hash = hashPlaybackToken(token);
  assert.notEqual(token, hash);
  assert.equal(hash.length, 64);
  assert.equal(hashPlaybackToken(token), hash);
});

test("ScoreBat entitlement defaults to highlights without live confirmation", () => {
  const prev = process.env.SPORTS_SCOREBAT_LIVE_ENTITLEMENT_CONFIRMED;
  delete process.env.SPORTS_SCOREBAT_LIVE_ENTITLEMENT_CONFIRMED;
  const report = assessScoreBatEntitlement();
  assert.equal(report.liveEntitlementConfirmed, false);
  assert.equal(report.contentClass, "highlights");
  if (prev !== undefined) {
    process.env.SPORTS_SCOREBAT_LIVE_ENTITLEMENT_CONFIRMED = prev;
  }
});

async function main() {
  await testAsync("ScoreBat video provider demotes unconfirmed live", async () => {
    const store = new Map();
    const provider = createScoreBatVideoProvider({ assets: store });
    process.env.SPORTS_SCOREBAT_ENABLED = "true";
    process.env.SPORTS_SCOREBAT_DISCOVERY_ENABLED = "true";
    delete process.env.SPORTS_SCOREBAT_LIVE_ENTITLEMENT_CONFIRMED;

    store.set("a1", {
      providerAssetId: "a1",
      fixtureId: "f1",
      title: "Team A vs Team B",
      broadcastType: "live_match",
      playbackKind: "iframe",
      embedUrlOrHtml: "https://www.scorebat.com/embed/g/1/",
      isEmbeddable: true,
      mobileSupported: true,
    });

    const found = await provider.discoverLiveBroadcasts({ fixtureId: "f1" });
    if (found.length > 0) {
      assert.equal(found[0].broadcastType, "highlights");
    }

    const validation = await provider.validatePlayback({
      providerAssetId: "a1",
      fixtureId: "f1",
      platform: "ios",
    });
    assert.ok(
      validation.status === "validated" ||
        validation.reason === "provider_disabled" ||
        validation.status === "blocked"
    );
  });

  console.log(`\n${passed} tests passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
