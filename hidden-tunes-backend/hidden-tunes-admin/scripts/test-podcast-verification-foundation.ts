import assert from "node:assert/strict";

import {
  computePodcastReliabilityScore,
  computeRetryDelayMs,
  isPublicVerifiedPodcastEpisode,
  isPublicVerifiedPodcastShow,
  PODCAST_AUTO_DISABLE_THRESHOLD,
} from "../lib/podcastVerification";

const success = computePodcastReliabilityScore({
  previousScore: 70,
  consecutiveFailures: 2,
  probeSucceeded: true,
  lastSuccessAt: new Date().toISOString(),
});
assert.equal(success.consecutive_failures, 0);
assert.ok(success.reliability_score >= 76);

const failure = computePodcastReliabilityScore({
  previousScore: 70,
  consecutiveFailures: 2,
  probeSucceeded: false,
});
assert.equal(failure.consecutive_failures, 3);
assert.ok(failure.reliability_score <= 58);

assert.equal(computeRetryDelayMs(1), 60_000);
assert.equal(computeRetryDelayMs(3), 240_000);

assert.equal(
  isPublicVerifiedPodcastShow({
    status: "approved",
    is_active: true,
    feed_status: "active",
    is_verified: true,
    quarantined_at: null,
    reliability_score: 80,
  }, { verifiedPlayableEpisodeCount: 1 }),
  true
);

assert.equal(
  isPublicVerifiedPodcastEpisode({
    status: "approved",
    is_active: true,
    playback_status: "playable",
    is_verified: true,
    quarantined_at: null,
    last_play_verified_at: new Date().toISOString(),
    reliability_score: 80,
    audio_url: "https://cdn.example.com/a.mp3",
  }),
  true
);

assert.equal(
  isPublicVerifiedPodcastEpisode({
    status: "approved",
    is_active: true,
    playback_status: "playable",
    is_verified: false,
    quarantined_at: null,
    last_play_verified_at: null,
    reliability_score: 100,
    audio_url: "https://cdn.example.com/a.mp3",
  }),
  false
);

console.log("test-podcast-verification-foundation passed");
