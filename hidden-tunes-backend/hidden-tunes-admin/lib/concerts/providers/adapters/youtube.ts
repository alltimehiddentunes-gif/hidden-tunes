import type { ConcertProviderAdapter } from "../adapter";

const YT_ID = /^[\w-]{11}$/;

export function extractYouTubeVideoId(urlOrId: string): string | null {
  const raw = String(urlOrId || "").trim();
  if (YT_ID.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0] || "";
      return YT_ID.test(id) ? id : null;
    }
    const v = url.searchParams.get("v");
    if (v && YT_ID.test(v)) return v;
    const parts = url.pathname.split("/").filter(Boolean);
    const embedIdx = parts.indexOf("embed");
    if (embedIdx >= 0 && YT_ID.test(parts[embedIdx + 1] || "")) {
      return parts[embedIdx + 1];
    }
    const shortsIdx = parts.indexOf("shorts");
    if (shortsIdx >= 0 && YT_ID.test(parts[shortsIdx + 1] || "")) {
      return parts[shortsIdx + 1];
    }
    const liveIdx = parts.indexOf("live");
    if (liveIdx >= 0 && YT_ID.test(parts[liveIdx + 1] || "")) {
      return parts[liveIdx + 1];
    }
  } catch {
    return null;
  }
  return null;
}

export const youtubeConcertAdapter: ConcertProviderAdapter = {
  id: "youtube",
  supportsDiscovery: true,
  detect(urlOrId) {
    return Boolean(extractYouTubeVideoId(urlOrId));
  },
  normalizeContentId(urlOrId) {
    return extractYouTubeVideoId(urlOrId);
  },
  resolvePlayback(input) {
    const id =
      extractYouTubeVideoId(input.contentId || "") ||
      extractYouTubeVideoId(input.watchUrl || "") ||
      extractYouTubeVideoId(input.embedUrl || "");
    if (!id) {
      return {
        method: "unsupported",
        embedUrl: null,
        streamUrl: null,
        watchUrl: input.watchUrl || null,
        appCompatible: false,
        reason: "youtube_id_unresolved",
      };
    }
    return {
      method: "youtube_embed",
      embedUrl: `https://www.youtube.com/embed/${id}`,
      streamUrl: null,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
      appCompatible: true,
      reason: "youtube_webview_embed",
    };
  },
};
