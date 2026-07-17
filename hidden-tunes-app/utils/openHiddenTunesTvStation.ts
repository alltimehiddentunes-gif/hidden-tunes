import { router } from "expo-router";

import type { HiddenTunesTvVideo } from "../services/tvCatalogApi";
import { getTvSessionController } from "../services/tv/tvSessionController";
import { HIDDEN_TUNES_VIDEOS_LABEL } from "./launchVideoCategories";

export type TvStationOpenResult =
  | { ok: true }
  | { ok: false; error: string };

const HIDDEN_PROVIDER_PATTERN = /\byoutube\b|youtu\.be|google\s*play/i;

export function sanitizeVideoDiscoveryText(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "";

  if (!HIDDEN_PROVIDER_PATTERN.test(text)) return text;

  return text
    .replace(HIDDEN_PROVIDER_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function videoDiscoveryDisplayName(value?: string | null) {
  const cleaned = sanitizeVideoDiscoveryText(value);
  return cleaned || HIDDEN_TUNES_VIDEOS_LABEL;
}

/**
 * Opens TV catalog playback through the single TV session owner.
 * Resolves the stream once inside TvPlaybackContext — does not mount a
 * second player or re-resolve on `/tv-player`.
 */
export async function openHiddenTunesTvStation(
  video: HiddenTunesTvVideo,
  queueVideos: HiddenTunesTvVideo[],
  options?: { stopPlayback?: () => Promise<void> }
): Promise<TvStationOpenResult> {
  const controller = getTvSessionController();

  if (!controller) {
    return {
      ok: false,
      error: "TV playback is not ready yet. Try again.",
    };
  }

  // stopPlayback is owned by the session starter; optional pre-stop is ignored
  // to avoid double audio teardown races.
  void options;

  const result = await controller.startCatalogSession({
    video,
    queue: queueVideos,
    presentation: "fullPlayer",
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  router.push({
    pathname: "/tv-player",
    params: {
      channelId: video.id,
    },
  } as any);

  return { ok: true };
}

/** @deprecated Use openHiddenTunesTvStation — kept for video category screens. */
export async function openHiddenTunesVideo(
  video: HiddenTunesTvVideo,
  queueVideos: HiddenTunesTvVideo[]
): Promise<TvStationOpenResult> {
  return openHiddenTunesTvStation(video, queueVideos);
}

export function videoDiscoverySubtitle(video: HiddenTunesTvVideo) {
  const parts = [
    ...(video.categories || []),
    video.country,
    video.language,
  ]
    .map((part) => sanitizeVideoDiscoveryText(part))
    .filter(Boolean);

  return parts.slice(0, 3).join(" · ") || HIDDEN_TUNES_VIDEOS_LABEL;
}
