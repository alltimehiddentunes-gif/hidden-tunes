import { evaluateOlympicsVideoRights } from "./rights";
import { buildOlympicsEmbedUrl, buildOlympicsWatchUrl } from "./client";
import type { OlympicsVideoRecord } from "./types";
import { OLYMPICS_PROVIDER_SLUG, OLYMPICS_YOUTUBE_CHANNEL_ID } from "./types";

export type CanonicalOlympicsVideo = {
  providerSlug: typeof OLYMPICS_PROVIDER_SLUG;
  providerEntityType: "video";
  providerNativeId: string;
  canonicalKey: string;
  title: string;
  description: string;
  artworkUrl: string | null;
  videoType: "highlights" | "replay" | "documentary" | "interview" | "other";
  publishedAt: string;
  sourcePayloadHash: string;
  sourceUpdatedAt: string;
  rights: ReturnType<typeof evaluateOlympicsVideoRights>;
  embedUrl: string | null;
  watchUrl: string;
  tags: string[];
  isLive: boolean;
  isFixture: boolean;
};

function hashPayload(video: OlympicsVideoRecord): string {
  // Deterministic fingerprint for upsert skip (Node + Edge safe).
  const raw = JSON.stringify({
    id: video.videoId,
    title: video.title,
    publishedAt: video.publishedAt,
    embeddable: video.embeddable,
    privacy: video.privacyStatus,
    duration: video.durationIso,
  });
  let h = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16)}`;
}

function inferVideoType(
  video: OlympicsVideoRecord
): CanonicalOlympicsVideo["videoType"] {
  const hay = `${video.title} ${video.description}`.toLowerCase();
  if (/documentary|behind the scenes/.test(hay)) return "documentary";
  if (/interview|press conference/.test(hay)) return "interview";
  if (/full replay|full event|replay/.test(hay)) return "replay";
  if (/highlight/.test(hay)) return "highlights";
  return "highlights";
}

/**
 * Deterministic identity: provider + entity + native id.
 * Never use title as database identity.
 */
export function mapOlympicsVideoToCanonical(
  video: OlympicsVideoRecord
): CanonicalOlympicsVideo | null {
  const nativeId = String(video.videoId || "").trim();
  if (!nativeId) return null;

  if (!String(video.title || "").trim()) return null;

  const channelId = String(video.channelId || "").trim();
  if (channelId && channelId !== OLYMPICS_YOUTUBE_CHANNEL_ID) {
    // Reject unofficial re-uploads / foreign channels even if embeddable.
    return null;
  }

  const rights = evaluateOlympicsVideoRights(video);
  const isLive =
    video.liveBroadcastContent === "live" ||
    video.liveBroadcastContent === "upcoming";

  return {
    providerSlug: OLYMPICS_PROVIDER_SLUG,
    providerEntityType: "video",
    providerNativeId: nativeId,
    canonicalKey: `${OLYMPICS_PROVIDER_SLUG}:video:${nativeId}`,
    title: video.title.trim(),
    description: video.description || "",
    artworkUrl: video.thumbnailUrl,
    videoType: inferVideoType(video),
    publishedAt: video.publishedAt,
    sourcePayloadHash: hashPayload(video),
    sourceUpdatedAt: video.publishedAt,
    rights,
    embedUrl:
      rights.playbackMode === "official_embed"
        ? buildOlympicsEmbedUrl(nativeId)
        : null,
    watchUrl: buildOlympicsWatchUrl(nativeId),
    tags: video.tags || [],
    isLive,
    isFixture: nativeId.startsWith("olympics_phase2a_fixture_"),
  };
}

export function mapOlympicsVideos(videos: OlympicsVideoRecord[]): {
  accepted: CanonicalOlympicsVideo[];
  rejected: Array<{ videoId: string; reason: string }>;
} {
  const accepted: CanonicalOlympicsVideo[] = [];
  const rejected: Array<{ videoId: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const video of videos) {
    const mapped = mapOlympicsVideoToCanonical(video);
    if (!mapped) {
      rejected.push({
        videoId: String(video.videoId || ""),
        reason: "malformed_record",
      });
      continue;
    }
    if (seen.has(mapped.canonicalKey)) {
      rejected.push({
        videoId: mapped.providerNativeId,
        reason: "duplicate_in_batch",
      });
      continue;
    }
    if (mapped.rights.classification === "blocked") {
      rejected.push({
        videoId: mapped.providerNativeId,
        reason: mapped.rights.reason,
      });
      continue;
    }
    seen.add(mapped.canonicalKey);
    accepted.push(mapped);
  }

  return { accepted, rejected };
}

/** Strip quality suffixes from display titles only — do not mutate identity fields. */
export function formatOlympicsDisplayTitle(title: string): string {
  return String(title || "")
    .replace(/\s*\((?:4k|2160p|1440p|1080p|720p|480p|360p|240p)\)\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
