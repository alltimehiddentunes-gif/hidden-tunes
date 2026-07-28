import { isPlayablePodcastAudioUrl } from "@/lib/podcastCatalog";
import {
  PODCAST_AUDIO_PROBE_TIMEOUT_MS,
  PODCAST_MAX_AUDIO_PROBE_BYTES,
  PODCAST_MAX_REDIRECTS,
} from "@/lib/podcastVerification";

export type PodcastAudioProbeResult = {
  ok: boolean;
  reason: string;
  http_status: number | null;
  final_url: string | null;
  content_type: string | null;
  content_length: number | null;
  latency_ms: number;
  method: "HEAD" | "GET_RANGE";
};

function isAudioCompatibleContentType(value: string | null) {
  if (!value) return true;
  const type = value.toLowerCase();
  if (type.includes("text/html")) return false;
  if (type.includes("application/json")) return false;
  return (
    type.startsWith("audio/") ||
    type.includes("octet-stream") ||
    type.includes("mpeg") ||
    type.includes("mp4") ||
    type.includes("x-m4a")
  );
}

function looksLikeHtml(body: string) {
  const sample = body.slice(0, 256).trim().toLowerCase();
  return sample.startsWith("<!doctype html") || sample.startsWith("<html");
}

async function followRedirects(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch
) {
  let currentUrl = url;
  let redirectCount = 0;
  let response: Response | null = null;

  while (redirectCount <= PODCAST_MAX_REDIRECTS) {
    response = await fetchImpl(currentUrl, { ...init, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) break;
      redirectCount += 1;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    break;
  }

  return { response, finalUrl: currentUrl, redirectCount };
}

export async function probePodcastAudioUrl(
  audioUrlInput: string,
  options?: {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  }
): Promise<PodcastAudioProbeResult> {
  const started = performance.now();
  const url = isPlayablePodcastAudioUrl(audioUrlInput);
  const timeoutMs = options?.timeoutMs ?? PODCAST_AUDIO_PROBE_TIMEOUT_MS;
  const fetchImpl = options?.fetchImpl ?? fetch;

  if (!url) {
    return {
      ok: false,
      reason: "invalid_audio_url",
      http_status: null,
      final_url: null,
      content_type: null,
      content_length: null,
      latency_ms: 0,
      method: "HEAD",
    };
  }

  const headAttempt = await followRedirects(
    url,
    {
      method: "HEAD",
      headers: { Accept: "audio/*,application/octet-stream,*/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    },
    fetchImpl
  );

  if (headAttempt.redirectCount > PODCAST_MAX_REDIRECTS) {
    return {
      ok: false,
      reason: "audio_redirect_limit_exceeded",
      http_status: headAttempt.response?.status ?? null,
      final_url: headAttempt.finalUrl,
      content_type: null,
      content_length: null,
      latency_ms: Math.round(performance.now() - started),
      method: "HEAD",
    };
  }

  const head = headAttempt.response;
  if (
    head &&
    (head.ok || head.status === 206) &&
    isAudioCompatibleContentType(head.headers.get("content-type"))
  ) {
    const length = Number(head.headers.get("content-length") || 0);
    if (length > 0 && length < 1024) {
      return {
        ok: false,
        reason: "audio_content_length_too_small",
        http_status: head.status,
        final_url: headAttempt.finalUrl,
        content_type: head.headers.get("content-type"),
        content_length: length,
        latency_ms: Math.round(performance.now() - started),
        method: "HEAD",
      };
    }

    return {
      ok: true,
      reason: "audio_head_ok",
      http_status: head.status,
      final_url: headAttempt.finalUrl,
      content_type: head.headers.get("content-type"),
      content_length: length || null,
      latency_ms: Math.round(performance.now() - started),
      method: "HEAD",
    };
  }

  const rangeAttempt = await followRedirects(
    url,
    {
      method: "GET",
      headers: {
        Accept: "audio/*,application/octet-stream,*/*",
        Range: `bytes=0-${PODCAST_MAX_AUDIO_PROBE_BYTES - 1}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    },
    fetchImpl
  );

  if (rangeAttempt.redirectCount > PODCAST_MAX_REDIRECTS) {
    return {
      ok: false,
      reason: "audio_redirect_limit_exceeded",
      http_status: rangeAttempt.response?.status ?? null,
      final_url: rangeAttempt.finalUrl,
      content_type: null,
      content_length: null,
      latency_ms: Math.round(performance.now() - started),
      method: "GET_RANGE",
    };
  }

  const response = rangeAttempt.response;
  if (!response || (!response.ok && response.status !== 206)) {
    return {
      ok: false,
      reason: `audio_http_${response?.status ?? 0}`,
      http_status: response?.status ?? null,
      final_url: rangeAttempt.finalUrl,
      content_type: response?.headers.get("content-type") ?? null,
      content_length: null,
      latency_ms: Math.round(performance.now() - started),
      method: "GET_RANGE",
    };
  }

  const contentType = response.headers.get("content-type");
  if (!isAudioCompatibleContentType(contentType)) {
    return {
      ok: false,
      reason: "audio_invalid_content_type",
      http_status: response.status,
      final_url: rangeAttempt.finalUrl,
      content_type: contentType,
      content_length: null,
      latency_ms: Math.round(performance.now() - started),
      method: "GET_RANGE",
    };
  }

  const sample = await response.text();
  if (looksLikeHtml(sample)) {
    return {
      ok: false,
      reason: "audio_html_error_page",
      http_status: response.status,
      final_url: rangeAttempt.finalUrl,
      content_type: contentType,
      content_length: sample.length,
      latency_ms: Math.round(performance.now() - started),
      method: "GET_RANGE",
    };
  }

  return {
    ok: true,
    reason: "audio_range_ok",
    http_status: response.status,
    final_url: rangeAttempt.finalUrl,
    content_type: contentType,
    content_length: Number(response.headers.get("content-length") || sample.length) || null,
    latency_ms: Math.round(performance.now() - started),
    method: "GET_RANGE",
  };
}
