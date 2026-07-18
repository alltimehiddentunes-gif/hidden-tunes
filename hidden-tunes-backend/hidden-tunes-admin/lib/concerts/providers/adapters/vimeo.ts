import type { ConcertProviderAdapter } from "../adapter";

export function extractVimeoId(urlOrId: string): string | null {
  const raw = String(urlOrId || "").trim();
  if (/^\d{6,12}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (!/vimeo\.com/.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts.find((p) => /^\d{6,12}$/.test(p));
    return id || null;
  } catch {
    return null;
  }
}

export const vimeoConcertAdapter: ConcertProviderAdapter = {
  id: "vimeo",
  supportsDiscovery: true,
  detect(urlOrId) {
    return Boolean(extractVimeoId(urlOrId));
  },
  normalizeContentId(urlOrId) {
    return extractVimeoId(urlOrId);
  },
  resolvePlayback(input) {
    const id =
      extractVimeoId(input.contentId || "") ||
      extractVimeoId(input.watchUrl || "") ||
      extractVimeoId(input.embedUrl || "");
    if (!id) {
      return {
        method: "unsupported",
        embedUrl: null,
        streamUrl: null,
        watchUrl: input.watchUrl || null,
        appCompatible: false,
        reason: "vimeo_id_unresolved",
      };
    }
    return {
      method: "vimeo_embed",
      embedUrl: `https://player.vimeo.com/video/${id}`,
      streamUrl: null,
      watchUrl: `https://vimeo.com/${id}`,
      appCompatible: true,
      reason: "vimeo_webview_embed",
    };
  },
};
