import { Platform } from "react-native";

import type { HiddenTunesTvPlayback, HiddenTunesTvVideo } from "@/services/tvCatalogApi";
import { TV_PUBLIC_RELIABILITY_THRESHOLD } from "@/utils/tvArtwork";
import {
  getTvPlaybackFailureCount,
  isTvChannelLocallyQuarantined,
} from "@/utils/tvPlaybackFailureStore";
import { TV_VALIDATION_FRESHNESS_MS } from "@/utils/tvValidationFreshness";

/** Internal navigation codes - never shown to users. */
export const TV_NAV_STALE = "STALE_RESOLUTION";
export const TV_NAV_EXHAUSTED = "EXHAUSTED";
export const TV_NAV_NO_SESSION = "NO_SESSION";
export const TV_NAV_SKIPPED = "STATION_SKIPPED";

export const TV_VERIFIED_RELIABILITY_THRESHOLD = 95;
export const TV_LOCAL_QUARANTINE_THRESHOLD = 3;
/**
 * Temporary bridge while production still serves legacy TV metadata.
 * Remove only after admin API exposes the full quality contract and catalog backfill is complete.
 */
export const TV_ALLOW_LEGACY_CATALOG_COMPATIBILITY = true;
export type TvStationMetadataMode = "quality_metadata" | "legacy_metadata";

const SUPPORTED_STREAM_PROTOCOLS = new Set(["http:", "https:", "rtmp:", "rtmps:"]);
const PLACEHOLDER_TITLE_MARKERS = ["test channel", "placeholder", "lorem ipsum", "sample tv"];
const PLACEHOLDER_ID_MARKERS = ["placeholder", "fake-", "test-"];

function cleanText(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function readBoolean(value: unknown): boolean | undefined {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return undefined;
}

function isPlaceholderStation(video: HiddenTunesTvVideo) {
  const title = cleanText(video.title).toLowerCase();
  const id = cleanText(video.id).toLowerCase();

  if (!title || title === "untitled") return true;
  if (PLACEHOLDER_TITLE_MARKERS.some((marker) => title.includes(marker))) return true;
  if (PLACEHOLDER_ID_MARKERS.some((marker) => id.includes(marker))) return true;

  return false;
}

function hasRequiredBrowseMetadata(video: HiddenTunesTvVideo) {
  return (
    readBoolean(video.public) !== undefined &&
    readBoolean(video.verified) !== undefined &&
    readBoolean(video.playable) !== undefined &&
    readBoolean(video.disabled) !== undefined &&
    readBoolean(video.ios_playable) !== undefined &&
    readBoolean(video.android_playable) !== undefined &&
    readBoolean(video.stream_is_https) !== undefined &&
    Boolean(cleanText(video.stream_protocol)) &&
    Boolean(cleanText(video.last_validated_at)) &&
    Boolean(cleanText(video.playback_status)) &&
    Boolean(cleanText(video.last_health_checked_at)) &&
    (typeof video.failure_count === "number" || Number.isFinite(Number(video.failure_count)))
  );
}

export function getTvStationMetadataMode(
  station: HiddenTunesTvVideo
): TvStationMetadataMode {
  return hasRequiredBrowseMetadata(station) ? "quality_metadata" : "legacy_metadata";
}

export function detectTvCatalogMetadataMode(
  stations: HiddenTunesTvVideo[]
): TvStationMetadataMode {
  const firstStation = stations.find((station) => Boolean(station?.id));
  return firstStation ? getTvStationMetadataMode(firstStation) : "quality_metadata";
}

function isValidationFresh(lastValidatedAt: string | null | undefined, now = Date.now()) {
  if (!lastValidatedAt) return false;
  const checkedAt = new Date(lastValidatedAt).getTime();
  if (!Number.isFinite(checkedAt)) return false;
  return now - checkedAt <= TV_VALIDATION_FRESHNESS_MS;
}

function browsePlatformStreamHintBlocks(
  video: HiddenTunesTvVideo,
  platform: "ios" | "android"
) {
  if (platform === "ios") {
    if (video.ios_playable !== true) return true;
    if (cleanText(video.stream_protocol).toLowerCase() === "http") return true;
    if (video.stream_is_https !== true) return true;
    return false;
  }

  if (video.android_playable !== true) return true;
  if (cleanText(video.stream_protocol).toLowerCase() === "http") return true;
  if (video.stream_is_https !== true) return true;
  return false;
}

function hasAcceptedLegacyArtwork(video: HiddenTunesTvVideo) {
  if (cleanText(video.logo, 2000) || cleanText(video.thumbnail_url, 2000)) return true;
  return Boolean(cleanText(video.title) && (video.categories?.length || cleanText(video.category)));
}

function isExplicitlyInactive(video: HiddenTunesTvVideo) {
  if (readBoolean(video.disabled) === true) return true;
  if (readBoolean(video.is_active) === false) return true;

  const status = cleanText(video.status).toLowerCase();
  return ["disabled", "inactive", "blocked", "quarantined", "removed"].includes(status);
}

function hasExplicitFailedPlaybackStatus(video: HiddenTunesTvVideo) {
  const playbackStatus = cleanText(video.playback_status).toLowerCase();
  if (!playbackStatus) return false;
  return ["failed", "dead", "offline", "blocked", "unplayable", "disabled"].includes(playbackStatus);
}

function isLegacyStationEligible(station: HiddenTunesTvVideo) {
  if (!TV_ALLOW_LEGACY_CATALOG_COMPATIBILITY) return false;
  if (!station?.id || !cleanText(station.title)) return false;
  if (isPlaceholderStation(station)) return false;
  if (!hasAcceptedLegacyArtwork(station)) return false;
  if (isExplicitlyInactive(station)) return false;
  if (hasExplicitFailedPlaybackStatus(station)) return false;

  const score = Number(station.reliability_score ?? 0);
  if (!Number.isFinite(score) || score < TV_PUBLIC_RELIABILITY_THRESHOLD) {
    return false;
  }

  if (isTvChannelLocallyQuarantined(station.id)) return false;

  return true;
}

function isQualityStationEligible(
  station: HiddenTunesTvVideo,
  platform: "ios" | "android"
) {
  if (!hasRequiredBrowseMetadata(station)) return false;
  if (station.public !== true) return false;
  if (station.verified !== true) return false;
  if (station.playable !== true) return false;
  if (station.disabled === true) return false;
  if (station.is_active === false) return false;
  if (cleanText(station.playback_status).toLowerCase() !== "playable") return false;
  if (cleanText(station.quarantined_at)) return false;
  if (!isValidationFresh(station.last_validated_at || station.last_health_checked_at)) {
    return false;
  }

  const score = Number(station.reliability_score ?? 100);
  if (Number.isFinite(score) && score < TV_PUBLIC_RELIABILITY_THRESHOLD) {
    return false;
  }

  if (isTvChannelLocallyQuarantined(station.id)) return false;
  if (browsePlatformStreamHintBlocks(station, platform)) return false;

  return true;
}

/** Canonical shared eligibility gate - use everywhere for browse, search, queue, favorites, related. */
export function isStationEligible(
  station: HiddenTunesTvVideo,
  platform: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android",
  metadataMode: TvStationMetadataMode = getTvStationMetadataMode(station)
) {
  if (!station?.id || !cleanText(station.title)) return false;
  if (isPlaceholderStation(station)) return false;
  if (metadataMode === "legacy_metadata") return isLegacyStationEligible(station);
  return isQualityStationEligible(station, platform);
}

/** @deprecated Use isStationEligible - kept for internal callers during migration. */
export function isBrowsePlayableTvVideo(
  video: HiddenTunesTvVideo,
  metadataMode?: TvStationMetadataMode
) {
  return isStationEligible(video, Platform.OS === "ios" ? "ios" : "android", metadataMode);
}

export function isMalformedStreamUrl(url: string) {
  const cleaned = cleanText(url, 2000);
  if (!cleaned) return true;

  try {
    const parsed = new URL(cleaned);
    if (!SUPPORTED_STREAM_PROTOCOLS.has(parsed.protocol)) return true;
    if (!parsed.hostname) return true;
    return false;
  } catch {
    return true;
  }
}

export function isHttpOnlyStreamUrl(url: string) {
  try {
    return new URL(url).protocol === "http:";
  } catch {
    return false;
  }
}

export function isPlatformBlockedStreamUrl(url: string) {
  if (!url) return true;
  if (isMalformedStreamUrl(url)) return true;
  if (Platform.OS === "ios" && isHttpOnlyStreamUrl(url)) return true;
  if (Platform.OS === "android" && isHttpOnlyStreamUrl(url)) return true;
  return false;
}

export function isResolvedStreamPlayable(
  playback: HiddenTunesTvPlayback | null | undefined
) {
  if (!playback?.stream_url) return false;
  return !isPlatformBlockedStreamUrl(playback.stream_url);
}

export async function isBrowsePlayableTvVideoAsync(video: HiddenTunesTvVideo) {
  if (!isBrowsePlayableTvVideo(video)) return false;

  const failures = await getTvPlaybackFailureCount(video.id);
  return failures < TV_LOCAL_QUARANTINE_THRESHOLD;
}

export function filterBrowsePlayableTvVideos(
  videos: HiddenTunesTvVideo[],
  metadataMode?: TvStationMetadataMode
) {
  const seen = new Set<string>();
  const output: HiddenTunesTvVideo[] = [];

  for (const video of videos) {
    const id = cleanText(video.id);
    if (!id || seen.has(id)) continue;
    if (!isBrowsePlayableTvVideo(video, metadataMode)) continue;
    seen.add(id);
    output.push(video);
  }

  return output;
}

export async function filterBrowsePlayableTvVideosAsync(videos: HiddenTunesTvVideo[]) {
  const deduped = filterBrowsePlayableTvVideos(videos);
  const output: HiddenTunesTvVideo[] = [];

  for (const video of deduped) {
    if (await isBrowsePlayableTvVideoAsync(video)) {
      output.push(video);
    }
  }

  return output;
}

/** Fields the production public TV API must expose for client-side platform gating without probing. */
export const TV_BACKEND_REQUIRED_FIELDS = [
  "public",
  "verified",
  "playable",
  "disabled",
  "ios_playable",
  "android_playable",
  "stream_protocol",
  "stream_is_https",
  "last_validated_at",
  "last_validation_result",
  "failure_count",
  "playback_status",
  "last_health_checked_at",
  "quarantined_at",
] as const;
