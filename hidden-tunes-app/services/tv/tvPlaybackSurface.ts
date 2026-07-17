import type { HiddenTunesTvPlayback } from "../tvCatalogApi";

export type TvPlaybackSurface = "native" | "webview";

function isHlsOrDirectVideoSource(sourceType: string, streamUrl: string) {
  const normalized = sourceType.trim().toLowerCase();
  if (
    normalized === "hls_stream" ||
    normalized === "m3u_playlist" ||
    normalized === "official_stream" ||
    normalized === "mp4" ||
    normalized.endsWith("_stream")
  ) {
    return true;
  }

  return /\.m3u8(?:\?|$)/i.test(streamUrl) || /\.mp4(?:\?|$)/i.test(streamUrl);
}

function isYouTubeSource(sourceType: string, sourceId: string, streamUrl: string) {
  const normalized = sourceType.trim().toLowerCase();
  if (normalized.includes("youtube")) return true;
  if (/^[a-zA-Z0-9_-]{11}$/.test(sourceId)) return true;
  return /youtube\.com|youtu\.be/i.test(streamUrl);
}

/**
 * Exclusive surface selection for the single TV session.
 * Native and WebView must never be active together.
 */
export function resolveTvPlaybackSurface(
  playback: HiddenTunesTvPlayback
): TvPlaybackSurface {
  const sourceType = String(playback.source_type || "");
  const sourceId = String(playback.source_id || "");
  const streamUrl = String(playback.stream_url || "");

  if (isYouTubeSource(sourceType, sourceId, streamUrl)) {
    // YouTube remains on the exclusive WebView path.
    return "webview";
  }

  if (isHlsOrDirectVideoSource(sourceType, streamUrl)) {
    return "native";
  }

  // Prefer native for unknown direct HTTP streams; fail safely in the player.
  if (/^https?:\/\//i.test(streamUrl)) {
    return "native";
  }

  return "webview";
}
