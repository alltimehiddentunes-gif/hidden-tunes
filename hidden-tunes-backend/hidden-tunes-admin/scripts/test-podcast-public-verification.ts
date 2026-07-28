import assert from "node:assert/strict";

import {
  PODCAST_PUBLIC_EPISODE_LIST_SELECT,
  PODCAST_PUBLIC_SHOW_SELECT,
} from "../lib/podcastCatalog";
import { isPublicVerifiedPodcastEpisode } from "../lib/podcastVerification";

assert.ok(!PODCAST_PUBLIC_EPISODE_LIST_SELECT.includes("audio_url"));
assert.ok(!PODCAST_PUBLIC_SHOW_SELECT.includes("feed_url"));

assert.equal(
  isPublicVerifiedPodcastEpisode({
    status: "approved",
    is_active: true,
    playback_status: "unchecked",
    is_verified: false,
    quarantined_at: null,
    last_play_verified_at: null,
    audio_url: "https://cdn.example.com/a.mp3",
  }),
  false
);

assert.equal(
  isPublicVerifiedPodcastEpisode({
    status: "approved",
    is_active: true,
    playback_status: "failed",
    is_verified: false,
    quarantined_at: "2026-01-01T00:00:00.000Z",
    last_play_verified_at: null,
    audio_url: "https://cdn.example.com/a.mp3",
  }),
  false
);

console.log("test-podcast-public-verification passed");
