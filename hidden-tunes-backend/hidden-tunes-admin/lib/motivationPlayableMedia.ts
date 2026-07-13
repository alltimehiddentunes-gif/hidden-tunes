import { detectTvStreamPayload, validatePublicTvUrl } from "@/lib/tvStationHealth";

export const SUPPORTED_VIDEO_MIME_PREFIXES = [
  "video/",
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/octet-stream",
];

export const SUPPORTED_AUDIO_MIME_PREFIXES = ["audio/"];

export type PlayableMediaProbeOptions = {
  connectTimeoutMs?: number;
  responseTimeoutMs?: number;
  retryLimit?: number;
  redirectLimit?: number;
};

export type PlayableMediaProbeResult = {
  ok: boolean;
  playable: boolean;
  playback_status: "playable" | "failed" | "blocked";
  mime_type: string | null;
  media_size_bytes: number | null;
  media_kind: "audio" | "video" | "stream" | null;
  reason: string;
  probed_url: string;
  probed_at: string;
};

const REJECTED_URL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /archive\.org\/details\//i, reason: "Archive item page is not direct media." },
  { pattern: /archive\.org\/embed\//i, reason: "Archive embed page is not direct media." },
  { pattern: /youtube\.com\/watch/i, reason: "YouTube watch page is not direct media." },
  { pattern: /youtu\.be\//i, reason: "YouTube short link is not direct media." },
  { pattern: /\.(?:jpe?g|png|gif|webp|bmp|svg)(?:\?|$)/i, reason: "Image URL is not playable media." },
  { pattern: /\.(?:xml|json)(?:\?|$)/i, reason: "Metadata file is not playable media." },
  { pattern: /\.torrent(?:\?|$)/i, reason: "Torrent file is not playable media." },
  { pattern: /\.(?:srt|vtt|ass)(?:\?|$)/i, reason: "Subtitle file is not playable media." },
  { pattern: /\.pdf(?:\?|$)/i, reason: "PDF file is not playable media." },
  { pattern: /\/playlist(?:\?|$|\/)/i, reason: "Playlist URL is not direct media." },
];

const DIRECT_MEDIA_EXTENSIONS =
  /\.(?:mp4|webm|m4v|mov|mp3|m4a|aac|ogg|opus|flac|wav|m3u8)(?:\?|$)/i;

export function classifyRejectedMediaUrl(url: string) {
  const normalized = String(url || "").trim();
  if (!normalized) {
    return { rejected: true, reason: "Missing media URL." };
  }

  for (const rule of REJECTED_URL_PATTERNS) {
    if (rule.pattern.test(normalized)) {
      return { rejected: true, reason: rule.reason };
    }
  }

  if (!DIRECT_MEDIA_EXTENSIONS.test(normalized) && !normalized.includes("archive.org/download/")) {
    return { rejected: true, reason: "URL does not look like direct audio or video media." };
  }

  return { rejected: false, reason: "" };
}

function mimeIsSupported(contentType: string | null, url: string) {
  const normalized = String(contentType || "").toLowerCase().split(";")[0].trim();
  if (normalized === "text/html" || normalized === "application/xhtml+xml") return false;
  if (SUPPORTED_VIDEO_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  if (SUPPORTED_AUDIO_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  if (DIRECT_MEDIA_EXTENSIONS.test(url)) return true;
  return false;
}

function inferMediaKind(contentType: string | null, url: string): "audio" | "video" | "stream" | null {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized.includes("mpegurl") || /\.m3u8(?:\?|$)/i.test(url)) return "stream";
  if (normalized.startsWith("audio/") || /\.(?:mp3|m4a|aac|ogg|opus|flac|wav)(?:\?|$)/i.test(url)) {
    return "audio";
  }
  if (
    normalized.startsWith("video/") ||
    detectTvStreamPayload(contentType, "").isVideoLike ||
    /\.(?:mp4|webm|m4v|mov)(?:\?|$)/i.test(url)
  ) {
    return "video";
  }
  return null;
}

function parseContentLength(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function fetchWithRedirects(
  url: string,
  options: PlayableMediaProbeOptions
): Promise<Response> {
  const redirectLimit = Math.max(0, Number(options.redirectLimit ?? 3));
  const responseTimeoutMs = Math.max(3_000, Number(options.responseTimeoutMs ?? 15_000));
  let currentUrl = url;

  for (let redirect = 0; redirect <= redirectLimit; redirect += 1) {
    const response = await fetch(currentUrl, {
      method: "GET",
      headers: {
        Accept: "audio/*,video/*,application/vnd.apple.mpegurl,application/octet-stream,*/*",
        Range: "bytes=0-8191",
      },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(responseTimeoutMs),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Redirect without location (HTTP ${response.status}).`);
      currentUrl = new URL(location, currentUrl).toString();
      const redirectedReject = classifyRejectedMediaUrl(currentUrl);
      if (redirectedReject.rejected) {
        throw new Error(redirectedReject.reason);
      }
      continue;
    }

    return response;
  }

  throw new Error("Redirect limit exceeded.");
}

export async function probeDirectPlayableMedia(
  rawUrl: string,
  options: PlayableMediaProbeOptions = {}
): Promise<PlayableMediaProbeResult> {
  const probedAt = new Date().toISOString();
  const urlReject = classifyRejectedMediaUrl(rawUrl);
  if (urlReject.rejected) {
    return {
      ok: false,
      playable: false,
      playback_status: "blocked",
      mime_type: null,
      media_size_bytes: null,
      media_kind: null,
      reason: urlReject.reason,
      probed_url: rawUrl,
      probed_at: probedAt,
    };
  }

  const urlCheck = validatePublicTvUrl(rawUrl);
  if (!urlCheck.ok) {
    return {
      ok: false,
      playable: false,
      playback_status: "blocked",
      mime_type: null,
      media_size_bytes: null,
      media_kind: null,
      reason: urlCheck.reason,
      probed_url: rawUrl,
      probed_at: probedAt,
    };
  }

  const retryLimit = Math.max(0, Number(options.retryLimit ?? 2));
  let lastError = "Media probe failed.";

  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    try {
      const response = await fetchWithRedirects(urlCheck.url, options);
      if (!response.ok && response.status !== 206) {
        lastError = `Media probe returned HTTP ${response.status}.`;
        continue;
      }

      const contentType = response.headers.get("content-type");
      const contentLength = parseContentLength(response.headers.get("content-length"));
      const bodySample = await response.text();

      if (String(contentType || "").toLowerCase().includes("text/html") || bodySample.trim().startsWith("<!")) {
        return {
          ok: false,
          playable: false,
          playback_status: "blocked",
          mime_type: contentType,
          media_size_bytes: contentLength,
          media_kind: null,
          reason: "Response is HTML, not direct media.",
          probed_url: urlCheck.url,
          probed_at: probedAt,
        };
      }

      if (!mimeIsSupported(contentType, urlCheck.url)) {
        return {
          ok: false,
          playable: false,
          playback_status: "failed",
          mime_type: contentType,
          media_size_bytes: contentLength,
          media_kind: null,
          reason: `Unsupported media MIME type: ${contentType || "unknown"}.`,
          probed_url: urlCheck.url,
          probed_at: probedAt,
        };
      }

      const mediaKind = inferMediaKind(contentType, urlCheck.url);
      if (!mediaKind) {
        return {
          ok: false,
          playable: false,
          playback_status: "failed",
          mime_type: contentType,
          media_size_bytes: contentLength,
          media_kind: null,
          reason: "Could not determine supported audio or video media kind.",
          probed_url: urlCheck.url,
          probed_at: probedAt,
        };
      }

      const streamDetails = detectTvStreamPayload(contentType, bodySample);
      if (contentLength === 0) {
        return {
          ok: false,
          playable: false,
          playback_status: "failed",
          mime_type: contentType,
          media_size_bytes: 0,
          media_kind: mediaKind,
          reason: "Zero-byte media response.",
          probed_url: urlCheck.url,
          probed_at: probedAt,
        };
      }

      return {
        ok: true,
        playable: true,
        playback_status: "playable",
        mime_type: contentType,
        media_size_bytes: contentLength,
        media_kind: streamDetails.isHlsManifest ? "stream" : mediaKind,
        reason: "Direct playable media verified.",
        probed_url: urlCheck.url,
        probed_at: probedAt,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < retryLimit) continue;
    }
  }

  return {
    ok: false,
    playable: false,
    playback_status: "failed",
    mime_type: null,
    media_size_bytes: null,
    media_kind: null,
    reason: lastError,
    probed_url: urlCheck.url,
    probed_at: probedAt,
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => runWorker());
  await Promise.all(workers);
  return results;
}
