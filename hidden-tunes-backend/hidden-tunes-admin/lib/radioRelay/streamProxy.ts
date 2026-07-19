import {
  RADIO_RELAY_CONNECT_TIMEOUT_MS,
  RADIO_RELAY_IDLE_TIMEOUT_MS,
  RADIO_RELAY_MAX_REDIRECTS,
  RADIO_RELAY_USER_AGENT,
} from "./constants";
import { assertRelayUpstreamUrlSafe } from "./ssrf";

const SAFE_REQUEST_HEADERS = ["icy-metadata", "range", "accept"] as const;

function pickSafeRequestHeaders(requestHeaders: Headers) {
  const headers = new Headers();
  headers.set("user-agent", RADIO_RELAY_USER_AGENT);
  headers.set("accept", requestHeaders.get("accept") || "*/*");
  for (const name of SAFE_REQUEST_HEADERS) {
    const value = requestHeaders.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("icy-metadata")) {
    headers.set("icy-metadata", "1");
  }
  return headers;
}

function isRedirectStatus(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function looksLikePlaylist(contentType: string | null, url: string) {
  const type = String(contentType || "").toLowerCase();
  return (
    type.includes("mpegurl") ||
    type.includes("x-mpegurl") ||
    /\.m3u8?(?:\?|$)/i.test(url)
  );
}

async function fetchWithConnectTimeout(
  url: string,
  init: RequestInit,
  parentSignal: AbortSignal,
  timeoutMs: number
) {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  parentSignal.addEventListener("abort", onParentAbort);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener("abort", onParentAbort);
  }
}

/**
 * Open an approved upstream HTTP stream with redirect validation and timeouts.
 * Caller must abort `signal` when the listener disconnects.
 */
export async function openApprovedRadioUpstream(options: {
  upstreamUrl: string;
  requestHeaders: Headers;
  signal: AbortSignal;
}) {
  let currentUrl = String(options.upstreamUrl || "").trim();
  let redirects = 0;

  while (redirects <= RADIO_RELAY_MAX_REDIRECTS) {
    if (options.signal.aborted) {
      throw new Error("aborted");
    }

    const allowHttps = redirects > 0;
    const parsed = await assertRelayUpstreamUrlSafe(currentUrl, { allowHttps });

    if (redirects === 0 && parsed.protocol !== "http:") {
      throw new Error("relay_requires_http_source");
    }

    const response = await fetchWithConnectTimeout(
      parsed.toString(),
      {
        method: "GET",
        headers: pickSafeRequestHeaders(options.requestHeaders),
        redirect: "manual",
        cache: "no-store",
      },
      options.signal,
      RADIO_RELAY_CONNECT_TIMEOUT_MS
    );

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("redirect_missing_location");
      currentUrl = new URL(location, parsed).toString();
      redirects += 1;
      try {
        await response.body?.cancel();
      } catch {
        // ignore
      }
      continue;
    }

    if (!response.ok || !response.body) {
      throw new Error(`upstream_status_${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    if (looksLikePlaylist(contentType, parsed.toString())) {
      try {
        await response.body.cancel();
      } catch {
        // ignore
      }
      throw new Error("http_hls_unsupported");
    }

    // Re-bind parent abort to cancel the response body reader.
    const upstreamBody = response.body;
    const reader = upstreamBody.getReader();
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const clearIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
    };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const onAbort = () => {
          clearIdle();
          try {
            controller.close();
          } catch {
            // ignore
          }
          void reader.cancel().catch(() => undefined);
        };
        options.signal.addEventListener("abort", onAbort);

        const armIdle = () => {
          clearIdle();
          idleTimer = setTimeout(() => {
            onAbort();
          }, RADIO_RELAY_IDLE_TIMEOUT_MS);
        };
        armIdle();

        const pump = async () => {
          try {
            while (true) {
              if (options.signal.aborted) break;
              const { done, value } = await reader.read();
              if (done) {
                clearIdle();
                options.signal.removeEventListener("abort", onAbort);
                controller.close();
                break;
              }
              armIdle();
              if (value) controller.enqueue(value);
            }
          } catch (error) {
            clearIdle();
            options.signal.removeEventListener("abort", onAbort);
            try {
              controller.error(error);
            } catch {
              // ignore
            }
          }
        };
        void pump();
      },
      cancel() {
        clearIdle();
        return reader.cancel();
      },
    });

    return {
      response,
      finalUrl: parsed.toString(),
      contentType,
      body: stream,
    };
  }

  throw new Error("too_many_redirects");
}

export function buildRelayResponseHeaders(upstream: Headers, contentType: string | null) {
  const headers = new Headers();
  headers.set("Content-Type", contentType || "application/octet-stream");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");

  const icyName = upstream.get("icy-name");
  const icyMetaInt = upstream.get("icy-metaint");
  const icyBr = upstream.get("icy-br");
  const icyGenre = upstream.get("icy-genre");
  if (icyName) headers.set("icy-name", icyName);
  if (icyMetaInt) headers.set("icy-metaint", icyMetaInt);
  if (icyBr) headers.set("icy-br", icyBr);
  if (icyGenre) headers.set("icy-genre", icyGenre);

  const acceptRanges = upstream.get("accept-ranges");
  if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);

  return headers;
}
