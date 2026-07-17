import type { OlympicsRightsClassification, OlympicsVideoRecord } from "./types";

export type OlympicsRightsDecision = {
  classification: OlympicsRightsClassification;
  playbackMode: "official_embed" | "external_only" | "none";
  rightsBasis: string;
  evidenceUrl: string;
  reviewConfidence: "high" | "medium" | "low";
  publishable: boolean;
  playablePublic: boolean;
  reason: string;
};

/**
 * Rights evaluation for Olympics YouTube pilot.
 * Conservative: never DIRECT_PLAY. Embed only when YouTube marks embeddable.
 */
export function evaluateOlympicsVideoRights(
  video: OlympicsVideoRecord
): OlympicsRightsDecision {
  const evidenceUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;

  if (video.privacyStatus !== "public" && video.privacyStatus !== "unlisted") {
    return {
      classification: "blocked",
      playbackMode: "none",
      rightsBasis: "youtube_privacy_not_public",
      evidenceUrl,
      reviewConfidence: "high",
      publishable: false,
      playablePublic: false,
      reason: `Privacy status ${video.privacyStatus} is not publicly importable.`,
    };
  }

  if (String(video.videoId).startsWith("olympics_phase2a_fixture_")) {
    // Fixtures are never production-public.
    if (!video.embeddable) {
      return {
        classification: "metadata_only",
        playbackMode: "external_only",
        rightsBasis: "phase2a_fixture_embed_disabled",
        evidenceUrl,
        reviewConfidence: "high",
        publishable: false,
        playablePublic: false,
        reason: "PHASE2A_TEST fixture with embed disabled — not public.",
      };
    }
    return {
      classification: "official_embed_only",
      playbackMode: "official_embed",
      rightsBasis: "phase2a_fixture_official_embed",
      evidenceUrl,
      reviewConfidence: "high",
      publishable: false,
      playablePublic: false,
      reason: "PHASE2A_TEST fixture — importable for pipeline tests, not public.",
    };
  }

  if (video.embeddable) {
    return {
      classification: "official_embed_only",
      playbackMode: "official_embed",
      rightsBasis: "ioc_youtube_official_embed",
      evidenceUrl,
      reviewConfidence: "high",
      publishable: true,
      playablePublic: true,
      reason:
        "Official Olympics YouTube video marked embeddable — official embed only.",
    };
  }

  return {
    classification: "metadata_only",
    playbackMode: "external_only",
    rightsBasis: "ioc_youtube_watch_page_only",
    evidenceUrl,
    reviewConfidence: "medium",
    publishable: true,
    playablePublic: false,
    reason:
      "Video is public but not embeddable — metadata + external YouTube link only.",
  };
}
