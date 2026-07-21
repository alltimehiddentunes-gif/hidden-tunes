export const TV_MAX_REDIRECTS = 5;
export const TV_PROBE_TIMEOUT_MS = 12_000;
export const TV_PROBE_MAX_BODY_BYTES = 65_536;

export type StreamProtocolClass =
  | "https"
  | "http"
  | "hls"
  | "dash"
  | "rtmp"
  | "rtsp"
  | "youtube"
  | "unknown";

export type StreamUrlClassification = {
  ok: boolean;
  protocol: StreamProtocolClass;
  streamIsHttps: boolean;
  normalizedUrl: string;
  reason: string;
};

export type StreamProbeResult = StreamUrlClassification & {
  playable: boolean;
  finalUrl: string;
  contentType: string | null;
  isHlsManifest: boolean;
  isVideoLike: boolean;
  redirectCount: number;
};

function cleanUrl(value: unknown) {
  return String(value || "").trim().slice(0, 2000);
}

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0"
  ) {
    return true;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".").map((part) => Number(part));
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  return false;
}

export function classifyStreamUrl(rawUrl: string): StreamUrlClassification {
  const normalizedUrl = cleanUrl(rawUrl);
  if (!normalizedUrl) {
    return {
      ok: false,
      protocol: "unknown",
      streamIsHttps: false,
      normalizedUrl: "",
      reason: "missing_url",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return {
      ok: false,
      protocol: "unknown",
      streamIsHttps: false,
      normalizedUrl,
      reason: "malformed_url",
    };
  }

  if (isPrivateHostname(parsed.hostname)) {
    return {
      ok: false,
      protocol: "unknown",
      streamIsHttps: false,
      normalizedUrl: parsed.toString(),
      reason: "private_url",
    };
  }

  const lowerPath = parsed.pathname.toLowerCase();
  const streamIsHttps = parsed.protocol === "https:";

  if (parsed.protocol === "rtmp:" || parsed.protocol === "rtmps:") {
    return {
      ok: true,
      protocol: "rtmp",
      streamIsHttps: parsed.protocol === "rtmps:",
      normalizedUrl: parsed.toString(),
      reason: "rtmp",
    };
  }

  if (parsed.protocol === "rtsp:") {
    return {
      ok: true,
      protocol: "rtsp",
      streamIsHttps: false,
      normalizedUrl: parsed.toString(),
      reason: "rtsp",
    };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      ok: false,
      protocol: "unknown",
      streamIsHttps: false,
      normalizedUrl: parsed.toString(),
      reason: "unsupported_protocol",
    };
  }

  if (/\.m3u8(?:\?|$)/i.test(`${lowerPath}${parsed.search}`)) {
    return {
      ok: true,
      protocol: "hls",
      streamIsHttps,
      normalizedUrl: parsed.toString(),
      reason: streamIsHttps ? "https_hls" : "http_hls",
    };
  }

  if (/\.mpd(?:\?|$)/i.test(`${lowerPath}${parsed.search}`)) {
    return {
      ok: true,
      protocol: "dash",
      streamIsHttps,
      normalizedUrl: parsed.toString(),
      reason: streamIsHttps ? "https_dash" : "http_dash",
    };
  }

  return {
    ok: true,
    protocol: streamIsHttps ? "https" : "http",
    streamIsHttps,
    normalizedUrl: parsed.toString(),
    reason: streamIsHttps ? "https_direct" : "http_direct",
  };
}

export function detectTvStreamPayload(contentType: string | null, bodySample: string) {
  const normalizedType = String(contentType || "").toLowerCase();
  const sample = bodySample.slice(0, 4096);
  const isHlsManifest =
    sample.includes("#EXTM3U") ||
    sample.includes("#EXT-X-STREAM-INF") ||
    sample.includes("#EXTINF:");
  const isVideoLike =
    isHlsManifest ||
    normalizedType.includes("mpegurl") ||
    normalizedType.includes("mp2t") ||
    normalizedType.includes("video/") ||
    /\.m3u8(?:\?|$)/i.test(sample);

  return { contentType, isHlsManifest, isVideoLike };
}

async function readLimitedBody(response: Response, maxBytes: number) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }

  const merged = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.slice(0, maxBytes - offset);
    merged.set(slice, offset);
    offset += slice.length;
    if (offset >= maxBytes) break;
  }

  return new TextDecoder().decode(merged);
}

export async function probeStreamUrl(
  rawUrl: string,
  options?: {
    maxRedirects?: number;
    timeoutMs?: number;
    maxBodyBytes?: number;
  }
): Promise<StreamProbeResult> {
  const maxRedirects = options?.maxRedirects ?? TV_MAX_REDIRECTS;
  const timeoutMs = options?.timeoutMs ?? TV_PROBE_TIMEOUT_MS;
  const maxBodyBytes = options?.maxBodyBytes ?? TV_PROBE_MAX_BODY_BYTES;

  let currentUrl = cleanUrl(rawUrl);
  let redirectCount = 0;
  let classification = classifyStreamUrl(currentUrl);

  if (!classification.ok) {
    return {
      ...classification,
      playable: false,
      finalUrl: currentUrl,
      contentType: null,
      isHlsManifest: false,
      isVideoLike: false,
      redirectCount,
    };
  }

  while (redirectCount <= maxRedirects) {
    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        headers: {
          Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
          // FAST redirectors (jmp2.uk / stitchers) reject bare Node fetch without a UA.
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = cleanUrl(response.headers.get("location"));
        if (!location) {
          return {
            ...classification,
            playable: false,
            finalUrl: currentUrl,
            contentType: null,
            isHlsManifest: false,
            isVideoLike: false,
            redirectCount,
            reason: "redirect_missing_location",
          };
        }

        redirectCount += 1;
        if (redirectCount > maxRedirects) {
          return {
            ...classification,
            playable: false,
            finalUrl: currentUrl,
            contentType: null,
            isHlsManifest: false,
            isVideoLike: false,
            redirectCount,
            reason: "too_many_redirects",
          };
        }

        currentUrl = new URL(location, currentUrl).toString();
        classification = classifyStreamUrl(currentUrl);
        if (!classification.ok) {
          return {
            ...classification,
            playable: false,
            finalUrl: currentUrl,
            contentType: null,
            isHlsManifest: false,
            isVideoLike: false,
            redirectCount,
          };
        }
        continue;
      }

      if (!response.ok) {
        return {
          ...classification,
          playable: false,
          finalUrl: currentUrl,
          contentType: response.headers.get("content-type"),
          isHlsManifest: false,
          isVideoLike: false,
          redirectCount,
          reason: `http_${response.status}`,
        };
      }

      const contentType = response.headers.get("content-type");
      const bodySample = await readLimitedBody(response, maxBodyBytes);
      const payload = detectTvStreamPayload(contentType, bodySample);
      const urlLooksLikeHls = /\.m3u8(?:\?|$)/i.test(currentUrl);
      const playable = payload.isVideoLike || urlLooksLikeHls || classification.protocol === "hls";

      return {
        ...classification,
        playable,
        finalUrl: currentUrl,
        contentType,
        isHlsManifest: payload.isHlsManifest,
        isVideoLike: payload.isVideoLike,
        redirectCount,
        reason: playable ? "probe_passed" : "unsupported_payload",
      };
    } catch (error) {
      return {
        ...classification,
        playable: false,
        finalUrl: currentUrl,
        contentType: null,
        isHlsManifest: false,
        isVideoLike: false,
        redirectCount,
        reason: error instanceof Error ? error.message : "probe_failed",
      };
    }
  }

  return {
    ...classification,
    playable: false,
    finalUrl: currentUrl,
    contentType: null,
    isHlsManifest: false,
    isVideoLike: false,
    redirectCount,
    reason: "redirect_limit",
  };
}

export function derivePlatformPlayability(input: {
  sourceType: string;
  classification: StreamUrlClassification;
  probePlayable: boolean;
}) {
  const sourceType = String(input.sourceType || "").toLowerCase();
  const { classification, probePlayable } = input;

  if (sourceType.startsWith("youtube")) {
    const ok = probePlayable;
    return {
      iosPlayable: ok,
      androidPlayable: ok,
      lastValidationResult: ok ? "youtube_playable" : "youtube_failed",
    };
  }

  if (!classification.ok || !probePlayable) {
    return {
      iosPlayable: false,
      androidPlayable: false,
      lastValidationResult: classification.reason || "probe_failed",
    };
  }

  const supportedProtocol =
    classification.protocol === "hls" ||
    classification.protocol === "https" ||
    classification.protocol === "dash";

  if (!supportedProtocol) {
    return {
      iosPlayable: false,
      androidPlayable: false,
      lastValidationResult: "unsupported_protocol",
    };
  }

  const iosPlayable = classification.streamIsHttps && probePlayable;
  const androidPlayable = classification.streamIsHttps && probePlayable;

  return {
    iosPlayable,
    androidPlayable,
    lastValidationResult: iosPlayable ? "platform_playable" : "http_or_insecure",
  };
}
