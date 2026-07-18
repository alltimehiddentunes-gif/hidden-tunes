import type { ConcertProviderAdapter } from "../adapter";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const hlsConcertAdapter: ConcertProviderAdapter = {
  id: "hls",
  supportsDiscovery: true,
  detect(urlOrId) {
    return /\.m3u8(\?|$)/i.test(String(urlOrId || ""));
  },
  normalizeContentId(urlOrId) {
    const raw = String(urlOrId || "").trim();
    return isHttpUrl(raw) ? raw : null;
  },
  resolvePlayback(input) {
    const url = String(input.streamUrl || input.watchUrl || input.contentId || "").trim();
    if (!isHttpUrl(url) || !/\.m3u8(\?|$)/i.test(url)) {
      return {
        method: "unsupported",
        embedUrl: null,
        streamUrl: null,
        watchUrl: input.watchUrl || null,
        appCompatible: false,
        reason: "hls_url_unresolved",
      };
    }
    return {
      method: "hls",
      embedUrl: null,
      streamUrl: url,
      watchUrl: url,
      appCompatible: true,
      reason: "hls_direct_stream",
    };
  },
};

export const dashConcertAdapter: ConcertProviderAdapter = {
  id: "dash",
  supportsDiscovery: true,
  detect(urlOrId) {
    return /\.mpd(\?|$)/i.test(String(urlOrId || ""));
  },
  normalizeContentId(urlOrId) {
    const raw = String(urlOrId || "").trim();
    return isHttpUrl(raw) ? raw : null;
  },
  resolvePlayback(input) {
    const url = String(input.streamUrl || input.watchUrl || input.contentId || "").trim();
    if (!isHttpUrl(url) || !/\.mpd(\?|$)/i.test(url)) {
      return {
        method: "unsupported",
        embedUrl: null,
        streamUrl: null,
        watchUrl: input.watchUrl || null,
        appCompatible: false,
        reason: "dash_url_unresolved",
      };
    }
    return {
      method: "dash",
      embedUrl: null,
      streamUrl: url,
      watchUrl: url,
      appCompatible: true,
      reason: "dash_direct_stream",
    };
  },
};

export const iframeConcertAdapter: ConcertProviderAdapter = {
  id: "iframe",
  supportsDiscovery: true,
  detect(urlOrId) {
    return isHttpUrl(String(urlOrId || ""));
  },
  normalizeContentId(urlOrId) {
    const raw = String(urlOrId || "").trim();
    return isHttpUrl(raw) ? raw : null;
  },
  resolvePlayback(input) {
    const url = String(
      input.embedUrl || input.watchUrl || input.streamUrl || input.contentId || ""
    ).trim();
    if (!isHttpUrl(url)) {
      return {
        method: "unsupported",
        embedUrl: null,
        streamUrl: null,
        watchUrl: null,
        appCompatible: false,
        reason: "iframe_url_unresolved",
      };
    }
    return {
      method: "iframe_player",
      embedUrl: url,
      streamUrl: null,
      watchUrl: url,
      appCompatible: true,
      reason: "generic_iframe_player",
    };
  },
};
