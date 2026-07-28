import { parsePodcastFeedXml } from "@/lib/podcastRssIngest";
import {
  PODCAST_FEED_PROBE_TIMEOUT_MS,
  PODCAST_MAX_FEED_BYTES,
  PODCAST_MAX_REDIRECTS,
} from "@/lib/podcastVerification";
import { cleanText } from "@/lib/tvCatalog";

export type PodcastFeedProbeResult = {
  ok: boolean;
  reason: string;
  http_status: number | null;
  final_url: string | null;
  redirect_count: number;
  latency_ms: number;
  episode_count: number;
  title: string | null;
};

function looksLikeHtml(body: string) {
  const sample = body.slice(0, 512).trim().toLowerCase();
  return sample.startsWith("<!doctype html") || sample.startsWith("<html");
}

function isValidFeedXml(body: string) {
  const lower = body.slice(0, 400).toLowerCase();
  return lower.includes("<rss") || lower.includes("<feed");
}

export async function probePodcastFeedUrl(
  feedUrlInput: string,
  options?: {
    timeoutMs?: number;
    maxBytes?: number;
    fetchImpl?: typeof fetch;
  }
): Promise<PodcastFeedProbeResult> {
  const started = performance.now();
  const feedUrl = cleanText(feedUrlInput, 2000);
  const timeoutMs = options?.timeoutMs ?? PODCAST_FEED_PROBE_TIMEOUT_MS;
  const maxBytes = options?.maxBytes ?? PODCAST_MAX_FEED_BYTES;
  const fetchImpl = options?.fetchImpl ?? fetch;

  if (!feedUrl) {
    return {
      ok: false,
      reason: "missing_feed_url",
      http_status: null,
      final_url: null,
      redirect_count: 0,
      latency_ms: 0,
      episode_count: 0,
      title: null,
    };
  }

  try {
    const parsedUrl = new URL(feedUrl);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return {
        ok: false,
        reason: "invalid_feed_protocol",
        http_status: null,
        final_url: null,
        redirect_count: 0,
        latency_ms: Math.round(performance.now() - started),
        episode_count: 0,
        title: null,
      };
    }
  } catch {
    return {
      ok: false,
      reason: "invalid_feed_url",
      http_status: null,
      final_url: null,
      redirect_count: 0,
      latency_ms: Math.round(performance.now() - started),
      episode_count: 0,
      title: null,
    };
  }

  let currentUrl = feedUrl;
  let redirectCount = 0;
  let response: Response | null = null;

  while (redirectCount <= PODCAST_MAX_REDIRECTS) {
    response = await fetchImpl(currentUrl, {
      method: "GET",
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "User-Agent": "HiddenTunes-Podcast-Health/1.0",
      },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return {
          ok: false,
          reason: "redirect_missing_location",
          http_status: response.status,
          final_url: currentUrl,
          redirect_count: redirectCount,
          latency_ms: Math.round(performance.now() - started),
          episode_count: 0,
          title: null,
        };
      }
      redirectCount += 1;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    break;
  }

  if (!response) {
    return {
      ok: false,
      reason: "feed_probe_no_response",
      http_status: null,
      final_url: currentUrl,
      redirect_count: redirectCount,
      latency_ms: Math.round(performance.now() - started),
      episode_count: 0,
      title: null,
    };
  }

  if (redirectCount > PODCAST_MAX_REDIRECTS) {
    return {
      ok: false,
      reason: "redirect_limit_exceeded",
      http_status: response.status,
      final_url: currentUrl,
      redirect_count: redirectCount,
      latency_ms: Math.round(performance.now() - started),
      episode_count: 0,
      title: null,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: `feed_http_${response.status}`,
      http_status: response.status,
      final_url: currentUrl,
      redirect_count: redirectCount,
      latency_ms: Math.round(performance.now() - started),
      episode_count: 0,
      title: null,
    };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      reason: "feed_empty_body",
      http_status: response.status,
      final_url: currentUrl,
      redirect_count: redirectCount,
      latency_ms: Math.round(performance.now() - started),
      episode_count: 0,
      title: null,
    };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return {
        ok: false,
        reason: "feed_response_too_large",
        http_status: response.status,
        final_url: currentUrl,
        redirect_count: redirectCount,
        latency_ms: Math.round(performance.now() - started),
        episode_count: 0,
        title: null,
      };
    }
    chunks.push(value);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  if (!body.trim()) {
    return {
      ok: false,
      reason: "feed_empty_body",
      http_status: response.status,
      final_url: currentUrl,
      redirect_count: redirectCount,
      latency_ms: Math.round(performance.now() - started),
      episode_count: 0,
      title: null,
    };
  }

  if (looksLikeHtml(body)) {
    return {
      ok: false,
      reason: "feed_html_error_page",
      http_status: response.status,
      final_url: currentUrl,
      redirect_count: redirectCount,
      latency_ms: Math.round(performance.now() - started),
      episode_count: 0,
      title: null,
    };
  }

  if (!isValidFeedXml(body)) {
    return {
      ok: false,
      reason: "feed_not_rss_or_atom",
      http_status: response.status,
      final_url: currentUrl,
      redirect_count: redirectCount,
      latency_ms: Math.round(performance.now() - started),
      episode_count: 0,
      title: null,
    };
  }

  try {
    const parsed = parsePodcastFeedXml(body);
    if (!cleanText(parsed.title, 300)) {
      return {
        ok: false,
        reason: "feed_missing_title",
        http_status: response.status,
        final_url: currentUrl,
        redirect_count: redirectCount,
        latency_ms: Math.round(performance.now() - started),
        episode_count: 0,
        title: null,
      };
    }

    if (parsed.episodes.length < 1) {
      return {
        ok: false,
        reason: "feed_no_episodes",
        http_status: response.status,
        final_url: currentUrl,
        redirect_count: redirectCount,
        latency_ms: Math.round(performance.now() - started),
        episode_count: 0,
        title: parsed.title,
      };
    }

    return {
      ok: true,
      reason: "feed_ok",
      http_status: response.status,
      final_url: currentUrl,
      redirect_count: redirectCount,
      latency_ms: Math.round(performance.now() - started),
      episode_count: parsed.episodes.length,
      title: parsed.title,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "feed_parse_failed",
      http_status: response.status,
      final_url: currentUrl,
      redirect_count: redirectCount,
      latency_ms: Math.round(performance.now() - started),
      episode_count: 0,
      title: null,
    };
  }
}
