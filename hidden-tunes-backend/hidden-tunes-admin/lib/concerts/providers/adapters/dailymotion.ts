import type { ConcertProviderAdapter } from "../adapter";

export function extractDailymotionId(urlOrId: string): string | null {
  const raw = String(urlOrId || "").trim();
  if (/^x[\w]+$/i.test(raw)) return raw;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (/dai\.ly/.test(url.hostname)) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }
    if (!/dailymotion\.com/.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const videoIdx = parts.indexOf("video");
    if (videoIdx >= 0) return parts[videoIdx + 1] || null;
    const embedIdx = parts.indexOf("embed");
    if (embedIdx >= 0) return parts[embedIdx + 2] || parts[embedIdx + 1] || null;
  } catch {
    return null;
  }
  return null;
}

export const dailymotionConcertAdapter: ConcertProviderAdapter = {
  id: "dailymotion",
  supportsDiscovery: true,
  detect(urlOrId) {
    return Boolean(extractDailymotionId(urlOrId));
  },
  normalizeContentId(urlOrId) {
    return extractDailymotionId(urlOrId);
  },
  resolvePlayback(input) {
    const id =
      extractDailymotionId(input.contentId || "") ||
      extractDailymotionId(input.watchUrl || "") ||
      extractDailymotionId(input.embedUrl || "");
    if (!id) {
      return {
        method: "unsupported",
        embedUrl: null,
        streamUrl: null,
        watchUrl: input.watchUrl || null,
        appCompatible: false,
        reason: "dailymotion_id_unresolved",
      };
    }
    return {
      method: "dailymotion_embed",
      embedUrl: `https://www.dailymotion.com/embed/video/${id}`,
      streamUrl: null,
      watchUrl: `https://www.dailymotion.com/video/${id}`,
      appCompatible: true,
      reason: "dailymotion_webview_embed",
    };
  },
};
