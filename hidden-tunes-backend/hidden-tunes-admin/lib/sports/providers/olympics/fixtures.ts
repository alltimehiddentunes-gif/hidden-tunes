/**
 * Conservative fixtures for offline dry-run / tests.
 * These are structural samples — import live data only via YouTube Data API.
 * Do not treat fixture video IDs as production-published inventory unless verified.
 */

import type { OlympicsVideoRecord } from "./types";
import { OLYMPICS_YOUTUBE_CHANNEL_ID } from "./types";

/** Clearly marked PHASE2A_TEST fixtures — not auto-published. */
export const OLYMPICS_FIXTURE_VIDEOS: OlympicsVideoRecord[] = [
  {
    videoId: "olympics_phase2a_fixture_001",
    title: "[PHASE2A_TEST] Olympic Highlights Sample A",
    description:
      "PHASE2A_TEST_ONLY — synthetic fixture for mapper/rights tests. Not a real stream.",
    publishedAt: "2024-08-01T12:00:00Z",
    channelId: OLYMPICS_YOUTUBE_CHANNEL_ID,
    channelTitle: "Olympics",
    thumbnailUrl: null,
    durationIso: "PT3M12S",
    embeddable: true,
    privacyStatus: "public",
    liveBroadcastContent: "none",
    tags: ["athletics", "highlights", "PHASE2A_TEST"],
  },
  {
    videoId: "olympics_phase2a_fixture_002",
    title: "[PHASE2A_TEST] Olympic Highlights Sample B (embed disabled)",
    description:
      "PHASE2A_TEST_ONLY — embeddable=false path must become external_only / metadata.",
    publishedAt: "2024-08-02T12:00:00Z",
    channelId: OLYMPICS_YOUTUBE_CHANNEL_ID,
    channelTitle: "Olympics",
    thumbnailUrl: null,
    durationIso: "PT5M01S",
    embeddable: false,
    privacyStatus: "public",
    liveBroadcastContent: "none",
    tags: ["swimming", "PHASE2A_TEST"],
  },
  {
    videoId: "olympics_phase2a_fixture_003",
    title: "[PHASE2A_TEST] Private video must be rejected",
    description: "PHASE2A_TEST_ONLY — privacy private must not import as public.",
    publishedAt: "2024-08-03T12:00:00Z",
    channelId: OLYMPICS_YOUTUBE_CHANNEL_ID,
    channelTitle: "Olympics",
    thumbnailUrl: null,
    durationIso: "PT1M00S",
    embeddable: true,
    privacyStatus: "private",
    liveBroadcastContent: "none",
    tags: ["PHASE2A_TEST"],
  },
];
