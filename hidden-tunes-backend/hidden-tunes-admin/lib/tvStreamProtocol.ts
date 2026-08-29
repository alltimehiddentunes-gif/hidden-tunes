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

export type DeepStreamOutcome =
  | "playable"
  | "drm"
  | "temporary"
  | "dead"
  | "unsupported"
  | "invalid";

export type DeepStreamProbeResult = StreamUrlClassification & {
  playable: boolean;
  outcome: DeepStreamOutcome;
  finalUrl: string;
  stableUrl: string | null;
  finalUrlIsTemporary: boolean;
  contentType: string | null;
  redirectCount: number;
  manifestValidated: boolean;
  mediaValidated: boolean;
  keyValidated: boolean;
  initSegmentValidated: boolean;
  drmDetected: boolean;
  reason: string;
};

export type DeepStreamProbeOptions = {
  fetchImpl?: typeof fetch;
  maxRedirects?: number;
  timeoutMs?: number;
  maxBodyBytes?: number;
  nowMs?: number;
};

function cleanUrl(value: unknown) {
  return String(value || "").trim().slice(0, 2000);
}

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
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
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  ) {
    return true;
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
        headers: { Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*" },
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

const TEMPORARY_QUERY_KEYS = new Set([
  "auth",
  "authorization",
  "expires",
  "exp",
  "hdnea",
  "key",
  "policy",
  "signature",
  "sig",
  "token",
]);

function isLikelyTemporaryUrl(rawUrl: string, nowMs = Date.now()) {
  void nowMs;
  try {
    const parsed = new URL(rawUrl);
    for (const [key, value] of parsed.searchParams) {
      const normalizedKey = key.toLowerCase();
      if (!TEMPORARY_QUERY_KEYS.has(normalizedKey)) continue;

      void value;
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function isTemporaryTvStreamUrl(rawUrl: string, nowMs = Date.now()) {
  return isLikelyTemporaryUrl(cleanUrl(rawUrl), nowMs);
}

function outcomeForHttpStatus(status: number): DeepStreamOutcome {
  if (status === 401 || status === 403 || status === 408 || status === 425 || status === 429) {
    return "temporary";
  }
  if (status >= 500) return "temporary";
  if (status === 404 || status === 410) return "dead";
  return "invalid";
}

async function readLimitedBytes(response: Response, maxBytes: number) {
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const remaining = maxBytes - total;
      const chunk = value.length > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.length;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Best-effort probe cleanup.
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function bytesToText(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

function bytesContainAscii(bytes: Uint8Array, value: string) {
  const needle = new TextEncoder().encode(value);
  if (needle.length === 0 || bytes.length < needle.length) return false;
  for (let index = 0; index <= bytes.length - needle.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (bytes[index + offset] !== needle[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

function isValidatedMediaBytes(bytes: Uint8Array, contentType: string | null) {
  if (bytes.length === 0) return false;
  const normalizedType = String(contentType || "").toLowerCase();
  if (bytes.length >= 188 && bytes[0] === 0x47) return true;
  if (
    bytesContainAscii(bytes.slice(0, 64), "ftyp") ||
    bytesContainAscii(bytes.slice(0, 64), "moof") ||
    bytesContainAscii(bytes.slice(0, 64), "styp")
  ) {
    return true;
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf) {
    return true;
  }
  return normalizedType.startsWith("video/") && bytes.length >= 32;
}

type DeepFetchResult = {
  response: Response | null;
  bytes: Uint8Array;
  finalUrl: string;
  redirectCount: number;
  outcome: DeepStreamOutcome | null;
  reason: string;
};

async function fetchDeepResource(
  rawUrl: string,
  options: Required<
    Pick<DeepStreamProbeOptions, "fetchImpl" | "maxRedirects" | "timeoutMs" | "maxBodyBytes">
  >,
  accept: string
): Promise<DeepFetchResult> {
  let currentUrl = cleanUrl(rawUrl);
  let redirectCount = 0;

  while (redirectCount <= options.maxRedirects) {
    const classification = classifyStreamUrl(currentUrl);
    if (!classification.ok) {
      return {
        response: null,
        bytes: new Uint8Array(),
        finalUrl: currentUrl,
        redirectCount,
        outcome: "invalid",
        reason: classification.reason,
      };
    }

    try {
      const response = await options.fetchImpl(currentUrl, {
        method: "GET",
        headers: {
          Accept: accept,
          Range: `bytes=0-${Math.max(0, options.maxBodyBytes - 1)}`,
        },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = cleanUrl(response.headers.get("location"));
        if (!location) {
          return {
            response,
            bytes: new Uint8Array(),
            finalUrl: currentUrl,
            redirectCount,
            outcome: "invalid",
            reason: "redirect_missing_location",
          };
        }
        redirectCount += 1;
        if (redirectCount > options.maxRedirects) {
          return {
            response,
            bytes: new Uint8Array(),
            finalUrl: currentUrl,
            redirectCount,
            outcome: "invalid",
            reason: "too_many_redirects",
          };
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) {
        return {
          response,
          bytes: new Uint8Array(),
          finalUrl: currentUrl,
          redirectCount,
          outcome: outcomeForHttpStatus(response.status),
          reason: `http_${response.status}`,
        };
      }

      return {
        response,
        bytes: await readLimitedBytes(response, options.maxBodyBytes),
        finalUrl: currentUrl,
        redirectCount,
        outcome: null,
        reason: "ok",
      };
    } catch (error) {
      return {
        response: null,
        bytes: new Uint8Array(),
        finalUrl: currentUrl,
        redirectCount,
        outcome: "temporary",
        reason: error instanceof Error ? error.message : "probe_failed",
      };
    }
  }

  return {
    response: null,
    bytes: new Uint8Array(),
    finalUrl: currentUrl,
    redirectCount,
    outcome: "invalid",
    reason: "redirect_limit",
  };
}

function findHlsUriAfterTag(lines: string[], tagPrefix: string) {
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith(tagPrefix)) continue;
    for (let next = index + 1; next < lines.length; next += 1) {
      if (!lines[next] || lines[next].startsWith("#")) continue;
      return lines[next];
    }
  }
  return null;
}

function findLowestBandwidthHlsVariant(lines: string[]) {
  const variants: Array<{ bandwidth: number; uri: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith("#EXT-X-STREAM-INF")) continue;
    const bandwidth = Number(lines[index].match(/BANDWIDTH=(\d+)/i)?.[1] || Number.MAX_SAFE_INTEGER);
    const uri = findHlsUriAfterTag(lines.slice(index), "#EXT-X-STREAM-INF");
    if (uri) variants.push({ bandwidth, uri });
  }
  variants.sort((a, b) => a.bandwidth - b.bandwidth || a.uri.localeCompare(b.uri));
  return variants[0]?.uri || null;
}

function hlsAttribute(line: string, attribute: string) {
  const quoted = line.match(new RegExp(`${attribute}="([^"]+)"`, "i"))?.[1];
  if (quoted) return quoted;
  return line.match(new RegExp(`${attribute}=([^,]+)`, "i"))?.[1]?.trim() || null;
}

function baseDeepResult(
  classification: StreamUrlClassification,
  originalUrl: string,
  nowMs: number
): DeepStreamProbeResult {
  return {
    ...classification,
    playable: false,
    outcome: classification.ok ? "unsupported" : "invalid",
    finalUrl: classification.normalizedUrl || originalUrl,
    stableUrl: classification.ok && !isLikelyTemporaryUrl(classification.normalizedUrl, nowMs)
      ? classification.normalizedUrl
      : null,
    finalUrlIsTemporary: isLikelyTemporaryUrl(classification.normalizedUrl, nowMs),
    contentType: null,
    redirectCount: 0,
    manifestValidated: false,
    mediaValidated: false,
    keyValidated: false,
    initSegmentValidated: false,
    drmDetected: false,
    reason: classification.reason,
  };
}

function withFetchFailure(
  base: DeepStreamProbeResult,
  fetched: DeepFetchResult
): DeepStreamProbeResult {
  return {
    ...base,
    outcome: fetched.outcome || "invalid",
    finalUrl: fetched.finalUrl,
    finalUrlIsTemporary: isLikelyTemporaryUrl(fetched.finalUrl),
    redirectCount: fetched.redirectCount,
    contentType: fetched.response?.headers.get("content-type") || null,
    reason: fetched.reason,
  };
}

async function probeHlsMediaPlaylist(
  manifestUrl: string,
  manifestFetch: DeepFetchResult,
  base: DeepStreamProbeResult,
  options: Required<
    Pick<DeepStreamProbeOptions, "fetchImpl" | "maxRedirects" | "timeoutMs" | "maxBodyBytes">
  >,
  nowMs: number,
  depth = 0
): Promise<DeepStreamProbeResult> {
  const text = bytesToText(manifestFetch.bytes);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.includes("#EXTM3U") && !text.startsWith("#EXTM3U")) {
    return { ...withFetchFailure(base, manifestFetch), outcome: "invalid", reason: "invalid_hls_manifest" };
  }

  const variant = findLowestBandwidthHlsVariant(lines);
  if (variant) {
    if (depth >= 2) {
      return { ...base, manifestValidated: true, outcome: "invalid", reason: "hls_variant_depth_limit" };
    }
    const variantUrl = new URL(variant, manifestUrl).toString();
    const variantFetch = await fetchDeepResource(variantUrl, options, "application/vnd.apple.mpegurl,*/*");
    if (variantFetch.outcome) return withFetchFailure({ ...base, manifestValidated: true }, variantFetch);
    return probeHlsMediaPlaylist(variantFetch.finalUrl, variantFetch, {
      ...base,
      manifestValidated: true,
      redirectCount: base.redirectCount + variantFetch.redirectCount,
    }, options, nowMs, depth + 1);
  }

  const keyLines = lines.filter((line) => line.startsWith("#EXT-X-KEY"));
  let keyValidated = keyLines.length === 0;
  for (const keyLine of keyLines) {
    const method = String(hlsAttribute(keyLine, "METHOD") || "").toUpperCase();
    const keyFormat = String(hlsAttribute(keyLine, "KEYFORMAT") || "identity").toLowerCase();
    if (method === "NONE") {
      keyValidated = true;
      continue;
    }
    if (method.includes("SAMPLE-AES") || keyFormat !== "identity") {
      return {
        ...base,
        finalUrl: manifestFetch.finalUrl,
        finalUrlIsTemporary: isLikelyTemporaryUrl(manifestFetch.finalUrl, nowMs),
        contentType: manifestFetch.response?.headers.get("content-type") || null,
        redirectCount: base.redirectCount + manifestFetch.redirectCount,
        manifestValidated: true,
        outcome: "drm",
        drmDetected: true,
        reason: "drm_hls_key",
      };
    }
    if (method !== "AES-128") {
      return {
        ...base,
        manifestValidated: true,
        outcome: "unsupported",
        reason: "unsupported_hls_encryption",
      };
    }
    const keyUri = hlsAttribute(keyLine, "URI");
    if (!keyUri) {
      return { ...base, manifestValidated: true, outcome: "invalid", reason: "hls_key_missing_uri" };
    }
    const keyFetch = await fetchDeepResource(
      new URL(keyUri, manifestUrl).toString(),
      { ...options, maxBodyBytes: 1024 },
      "application/octet-stream,*/*"
    );
    if (keyFetch.outcome || keyFetch.bytes.length === 0) {
      return withFetchFailure({ ...base, manifestValidated: true }, keyFetch);
    }
    keyValidated = true;
  }

  let initSegmentValidated = false;
  const mapLine = lines.find((line) => line.startsWith("#EXT-X-MAP"));
  if (mapLine) {
    const initUri = hlsAttribute(mapLine, "URI");
    if (!initUri) {
      return { ...base, manifestValidated: true, keyValidated, outcome: "invalid", reason: "hls_map_missing_uri" };
    }
    const initFetch = await fetchDeepResource(
      new URL(initUri, manifestUrl).toString(),
      options,
      "video/mp4,application/octet-stream,*/*"
    );
    if (initFetch.outcome || !isValidatedMediaBytes(initFetch.bytes, initFetch.response?.headers.get("content-type") || null)) {
      return withFetchFailure({ ...base, manifestValidated: true, keyValidated }, initFetch);
    }
    initSegmentValidated = true;
  }

  const segmentUri = lines.find((line) => !line.startsWith("#"));
  if (!segmentUri) {
    return {
      ...base,
      manifestValidated: true,
      keyValidated,
      initSegmentValidated,
      outcome: "invalid",
      reason: "hls_segment_missing",
    };
  }

  const segmentFetch = await fetchDeepResource(
    new URL(segmentUri, manifestUrl).toString(),
    options,
    "video/mp2t,video/mp4,application/octet-stream,*/*"
  );
  if (segmentFetch.outcome) {
    return withFetchFailure(
      { ...base, manifestValidated: true, keyValidated, initSegmentValidated },
      segmentFetch
    );
  }

  const mediaValidated = isValidatedMediaBytes(
    segmentFetch.bytes,
    segmentFetch.response?.headers.get("content-type") || null
  );
  const durablePlayable = mediaValidated && keyValidated && base.stableUrl !== null;
  return {
    ...base,
    playable: durablePlayable,
    outcome: base.stableUrl === null ? "temporary" : durablePlayable ? "playable" : "invalid",
    finalUrl: manifestFetch.finalUrl,
    finalUrlIsTemporary: isLikelyTemporaryUrl(manifestFetch.finalUrl, nowMs),
    contentType: manifestFetch.response?.headers.get("content-type") || null,
    redirectCount: base.redirectCount + manifestFetch.redirectCount + segmentFetch.redirectCount,
    manifestValidated: true,
    mediaValidated,
    keyValidated,
    initSegmentValidated,
    reason:
      base.stableUrl === null
        ? "temporary_or_expiring_source"
        : durablePlayable
          ? "hls_media_validated"
          : "hls_media_invalid",
  };
}

function dashTemplateValue(template: string, representationId: string, bandwidth: string, number: string) {
  return template
    .replace(/\$RepresentationID\$/g, representationId)
    .replace(/\$Bandwidth\$/g, bandwidth)
    .replace(/\$Number(?:%0\dd)?\$/g, number);
}

async function probeDashManifest(
  manifestFetch: DeepFetchResult,
  base: DeepStreamProbeResult,
  options: Required<
    Pick<DeepStreamProbeOptions, "fetchImpl" | "maxRedirects" | "timeoutMs" | "maxBodyBytes">
  >,
  nowMs: number
): Promise<DeepStreamProbeResult> {
  const xml = bytesToText(manifestFetch.bytes);
  if (!/<MPD[\s>]/i.test(xml)) {
    return { ...withFetchFailure(base, manifestFetch), outcome: "invalid", reason: "invalid_dash_manifest" };
  }
  if (/<ContentProtection[^>]+(?:widevine|playready|fairplay|edef8ba9|9a04f079)/i.test(xml)) {
    return {
      ...base,
      outcome: "drm",
      drmDetected: true,
      manifestValidated: true,
      finalUrl: manifestFetch.finalUrl,
      finalUrlIsTemporary: isLikelyTemporaryUrl(manifestFetch.finalUrl, nowMs),
      contentType: manifestFetch.response?.headers.get("content-type") || null,
      redirectCount: manifestFetch.redirectCount,
      reason: "drm_dash_content_protection",
    };
  }

  const representation = xml.match(/<Representation\b([^>]*)>/i)?.[1] || "";
  const representationId = representation.match(/\bid="([^"]+)"/i)?.[1] || "1";
  const bandwidth = representation.match(/\bbandwidth="([^"]+)"/i)?.[1] || "1";
  const template = xml.match(/<SegmentTemplate\b([^>]*)\/?\s*>/i)?.[1] || "";
  const initialization = template.match(/\binitialization="([^"]+)"/i)?.[1] || null;
  const media = template.match(/\bmedia="([^"]+)"/i)?.[1] || null;
  const startNumber = template.match(/\bstartNumber="([^"]+)"/i)?.[1] || "1";
  const baseUrl = xml.match(/<BaseURL>([^<]+)<\/BaseURL>/i)?.[1]?.trim() || "";
  const resolutionBase = new URL(baseUrl || ".", manifestFetch.finalUrl).toString();
  if (!initialization || !media) {
    return {
      ...base,
      manifestValidated: true,
      finalUrl: manifestFetch.finalUrl,
      finalUrlIsTemporary: isLikelyTemporaryUrl(manifestFetch.finalUrl, nowMs),
      contentType: manifestFetch.response?.headers.get("content-type") || null,
      redirectCount: manifestFetch.redirectCount,
      outcome: "unsupported",
      reason: "dash_segments_not_resolvable",
    };
  }

  const initUrl = new URL(
    dashTemplateValue(initialization, representationId, bandwidth, startNumber),
    resolutionBase
  ).toString();
  const mediaUrl = new URL(
    dashTemplateValue(media, representationId, bandwidth, startNumber),
    resolutionBase
  ).toString();
  const initFetch = await fetchDeepResource(initUrl, options, "video/mp4,application/octet-stream,*/*");
  if (initFetch.outcome || !isValidatedMediaBytes(initFetch.bytes, initFetch.response?.headers.get("content-type") || null)) {
    return withFetchFailure({ ...base, manifestValidated: true }, initFetch);
  }
  const mediaFetch = await fetchDeepResource(mediaUrl, options, "video/mp4,application/octet-stream,*/*");
  if (mediaFetch.outcome) {
    return withFetchFailure({ ...base, manifestValidated: true, initSegmentValidated: true }, mediaFetch);
  }
  const mediaValidated = isValidatedMediaBytes(
    mediaFetch.bytes,
    mediaFetch.response?.headers.get("content-type") || null
  );
  const durablePlayable = mediaValidated && base.stableUrl !== null;
  return {
    ...base,
    playable: durablePlayable,
    outcome: base.stableUrl === null ? "temporary" : durablePlayable ? "playable" : "invalid",
    finalUrl: manifestFetch.finalUrl,
    finalUrlIsTemporary: isLikelyTemporaryUrl(manifestFetch.finalUrl, nowMs),
    contentType: manifestFetch.response?.headers.get("content-type") || null,
    redirectCount: manifestFetch.redirectCount + initFetch.redirectCount + mediaFetch.redirectCount,
    manifestValidated: true,
    mediaValidated,
    initSegmentValidated: true,
    keyValidated: true,
    reason:
      base.stableUrl === null
        ? "temporary_or_expiring_source"
        : durablePlayable
          ? "dash_media_validated"
          : "dash_media_invalid",
  };
}

/**
 * Recovery/health-only validation. Unlike probeStreamUrl, this requires a real
 * media segment (and key/init segment when declared) before reporting playable.
 */
export async function probeDeepTvStream(
  rawUrl: string,
  options: DeepStreamProbeOptions = {}
): Promise<DeepStreamProbeResult> {
  const nowMs = options.nowMs ?? Date.now();
  const classification = classifyStreamUrl(rawUrl);
  const base = baseDeepResult(classification, cleanUrl(rawUrl), nowMs);
  if (!classification.ok) return base;
  if (["rtmp", "rtsp", "youtube", "unknown"].includes(classification.protocol)) {
    return { ...base, outcome: "unsupported", reason: "unsupported_deep_probe_protocol" };
  }

  const fetchOptions = {
    fetchImpl: options.fetchImpl ?? fetch,
    maxRedirects: options.maxRedirects ?? TV_MAX_REDIRECTS,
    timeoutMs: options.timeoutMs ?? TV_PROBE_TIMEOUT_MS,
    maxBodyBytes: options.maxBodyBytes ?? TV_PROBE_MAX_BODY_BYTES,
  };
  const fetched = await fetchDeepResource(
    classification.normalizedUrl,
    fetchOptions,
    "application/vnd.apple.mpegurl,application/dash+xml,video/*,application/octet-stream,*/*"
  );
  if (fetched.outcome) return withFetchFailure(base, fetched);

  const contentType = fetched.response?.headers.get("content-type") || null;
  const text = bytesToText(fetched.bytes.slice(0, 4096));
  if (text.startsWith("#EXTM3U") || String(contentType).toLowerCase().includes("mpegurl")) {
    return probeHlsMediaPlaylist(fetched.finalUrl, fetched, base, fetchOptions, nowMs);
  }
  if (/<MPD[\s>]/i.test(text) || String(contentType).toLowerCase().includes("dash+xml")) {
    return probeDashManifest(fetched, base, fetchOptions, nowMs);
  }

  const mediaValidated = isValidatedMediaBytes(fetched.bytes, contentType);
  const finalUrlIsTemporary = isLikelyTemporaryUrl(fetched.finalUrl, nowMs);
  return {
    ...base,
    playable: mediaValidated && !finalUrlIsTemporary,
    outcome: finalUrlIsTemporary ? "temporary" : mediaValidated ? "playable" : "unsupported",
    finalUrl: fetched.finalUrl,
    finalUrlIsTemporary,
    contentType,
    redirectCount: fetched.redirectCount,
    mediaValidated,
    keyValidated: true,
    reason: finalUrlIsTemporary
      ? "temporary_or_expiring_source"
      : mediaValidated
        ? "direct_media_validated"
        : "unsupported_payload",
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
