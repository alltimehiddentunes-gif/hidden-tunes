export const RADIO_PUBLIC_RELIABILITY_THRESHOLD = 60;
export const RADIO_AUTO_DISABLE_THRESHOLD = 20;

export type RadioVerificationOutcome =
  | "playable"
  | "temporarily_unreachable"
  | "timed_out"
  | "invalid_url"
  | "unsafe_url"
  | "redirect_failure"
  | "playlist_invalid"
  | "unsupported_content"
  | "html_response"
  | "failed";

export type RadioVerificationOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  maxPlaylistBytes?: number;
  maxReadBytes?: number;
};

export type RadioStreamProbeResult = {
  playable: boolean;
  outcome: RadioVerificationOutcome;
  reason: string;
  finalUrl: string | null;
  contentType: string | null;
  bytesRead: number;
  redirects: number;
  playlistResolved: boolean;
  retryable: boolean;
  durationMs: number;
};

export type RadioVerificationRow = {
  id: string;
  stream_url?: string | null;
  source_stream_url?: string | null;
  playback_status?: string | null;
  reliability_score?: number | null;
  consecutive_failures?: number | null;
  status?: string | null;
  is_active?: boolean | null;
  is_verified?: boolean | null;
  is_mature?: boolean | null;
  quarantined_at?: string | null;
  disabled_at?: string | null;
};

export type RadioVerificationUpdate = {
  playback_status: string;
  is_verified: boolean;
  reliability_score: number;
  health_status: string;
  consecutive_failures: number;
  last_health_checked_at: string;
  last_health_error: string | null;
  quarantined_at: string | null;
  quarantine_reason: string | null;
  disabled_at: string | null;
};

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_PLAYLIST_BYTES = 128 * 1024;
const DEFAULT_MAX_READ_BYTES = 24 * 1024;
const AUDIO_CONTENT_TYPES = [
  "audio/",
  "application/ogg",
  "application/octet-stream",
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/mpegurl",
  "application/pls+xml",
  "audio/x-scpls",
];

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
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
    const [a, b] = host.split(".").map((part) => Number(part));
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }

  return false;
}

export function validatePublicRadioStreamUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: false as const, outcome: "invalid_url" as const, reason: "Missing stream URL." };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false as const, outcome: "invalid_url" as const, reason: "Invalid stream URL." };
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    return { ok: false as const, outcome: "invalid_url" as const, reason: "Unsupported stream protocol." };
  }

  if (isPrivateHostname(parsed.hostname)) {
    return { ok: false as const, outcome: "unsafe_url" as const, reason: "Private or local stream URL rejected." };
  }

  return { ok: true as const, url: parsed.toString() };
}

function isPlaylistUrl(url: string) {
  return /\.(m3u8?|pls|xspf)(?:\?|$)/i.test(url);
}

function looksLikePlaylist(contentType: string | null, sample: string) {
  const type = String(contentType || "").toLowerCase();
  const text = sample.slice(0, 4096).trim();
  return (
    type.includes("mpegurl") ||
    type.includes("scpls") ||
    type.includes("xspf") ||
    text.startsWith("#EXTM3U") ||
    text.startsWith("[playlist]") ||
    text.includes("<playlist")
  );
}

function looksLikeHtml(contentType: string | null, sample: string) {
  const type = String(contentType || "").toLowerCase();
  const text = sample.slice(0, 1024).trim().toLowerCase();
  return type.includes("text/html") || text.startsWith("<!doctype html") || text.startsWith("<html");
}

function isLikelyAudio(contentType: string | null, sample: Uint8Array, url: string) {
  const type = String(contentType || "").toLowerCase();
  if (AUDIO_CONTENT_TYPES.some((knownType) => type.includes(knownType))) return true;
  if (/\.(mp3|aac|m4a|ogg|opus|flac)(?:\?|$)/i.test(url)) return true;
  const header = new TextDecoder("latin1").decode(sample.slice(0, 16));
  return header.startsWith("ID3") || header.startsWith("OggS") || header.includes("ftyp");
}

function parsePlaylistEntries(text: string, baseUrl: string, maxEntries: number) {
  const entries: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    if (entries.length >= maxEntries) break;
    if (line.startsWith("#") || /^\[playlist\]$/i.test(line)) continue;
    const plsMatch = line.match(/^File\d+=(.+)$/i);
    const raw = plsMatch ? plsMatch[1].trim() : line;
    if (!/^https?:\/\//i.test(raw) && !raw.startsWith("/")) continue;
    try {
      entries.push(new URL(raw, baseUrl).toString());
    } catch {
      // Ignore malformed playlist entries; the playlist is invalid only if none resolve.
    }
  }

  const xspfMatches = text.matchAll(/<location>([^<]+)<\/location>/gi);
  for (const match of xspfMatches) {
    if (entries.length >= maxEntries) break;
    try {
      entries.push(new URL(match[1].trim(), baseUrl).toString());
    } catch {
      // Ignore malformed XSPF entries.
    }
  }

  return Array.from(new Set(entries)).slice(0, maxEntries);
}

async function readLimitedBytes(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const slice = value.slice(0, Math.max(0, maxBytes - total));
      chunks.push(slice);
      total += slice.length;
      if (value.length > slice.length) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function fetchWithRedirectLimit(url: string, options: RadioVerificationOptions) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let currentUrl = url;
  let redirects = 0;

  for (;;) {
    const response = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: {
        Accept: "audio/*,application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
        "User-Agent": "HiddenTunes/1.0 radio verifier",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: currentUrl, redirects };
    }

    if (redirects >= maxRedirects) {
      return { response, finalUrl: currentUrl, redirects, redirectFailure: true };
    }

    const location = response.headers.get("location");
    if (!location) {
      return { response, finalUrl: currentUrl, redirects, redirectFailure: true };
    }

    const nextUrl = new URL(location, currentUrl).toString();
    const validation = validatePublicRadioStreamUrl(nextUrl);
    if (!validation.ok) {
      return { response, finalUrl: currentUrl, redirects, unsafeRedirect: validation.reason };
    }
    currentUrl = validation.url;
    redirects += 1;
  }
}

function result(
  startedAt: number,
  partial: Omit<RadioStreamProbeResult, "durationMs">
): RadioStreamProbeResult {
  return {
    ...partial,
    durationMs: Date.now() - startedAt,
  };
}

export async function probeRadioStream(
  streamUrl: unknown,
  options: RadioVerificationOptions = {},
  depth = 0
): Promise<RadioStreamProbeResult> {
  const startedAt = Date.now();
  const maxPlaylistBytes = options.maxPlaylistBytes ?? DEFAULT_MAX_PLAYLIST_BYTES;
  const maxReadBytes = options.maxReadBytes ?? DEFAULT_MAX_READ_BYTES;
  const validation = validatePublicRadioStreamUrl(streamUrl);

  if (!validation.ok) {
    return result(startedAt, {
      playable: false,
      outcome: validation.outcome,
      reason: validation.reason,
      finalUrl: null,
      contentType: null,
      bytesRead: 0,
      redirects: 0,
      playlistResolved: false,
      retryable: false,
    });
  }

  try {
    const fetched = await fetchWithRedirectLimit(validation.url, options);
    if (fetched.redirectFailure) {
      return result(startedAt, {
        playable: false,
        outcome: "redirect_failure",
        reason: "Redirect limit exceeded or redirect was invalid.",
        finalUrl: fetched.finalUrl,
        contentType: null,
        bytesRead: 0,
        redirects: fetched.redirects,
        playlistResolved: false,
        retryable: true,
      });
    }
    if (fetched.unsafeRedirect) {
      return result(startedAt, {
        playable: false,
        outcome: "unsafe_url",
        reason: fetched.unsafeRedirect,
        finalUrl: fetched.finalUrl,
        contentType: null,
        bytesRead: 0,
        redirects: fetched.redirects,
        playlistResolved: false,
        retryable: false,
      });
    }

    const { response, finalUrl, redirects } = fetched;
    if (!response.ok) {
      const retryable = response.status >= 500 || response.status === 408 || response.status === 429;
      return result(startedAt, {
        playable: false,
        outcome: retryable ? "temporarily_unreachable" : "failed",
        reason: `HTTP ${response.status}`,
        finalUrl,
        contentType: response.headers.get("content-type"),
        bytesRead: 0,
        redirects,
        playlistResolved: false,
        retryable,
      });
    }

    const contentType = response.headers.get("content-type");
    const body = await readLimitedBytes(response, isPlaylistUrl(finalUrl) ? maxPlaylistBytes : maxReadBytes);
    const sample = new TextDecoder("utf-8", { fatal: false }).decode(body);

    if (looksLikeHtml(contentType, sample)) {
      return result(startedAt, {
        playable: false,
        outcome: "html_response",
        reason: "Stream URL returned HTML.",
        finalUrl,
        contentType,
        bytesRead: body.length,
        redirects,
        playlistResolved: false,
        retryable: false,
      });
    }

    if (looksLikePlaylist(contentType, sample) && depth < 2) {
      const entries = parsePlaylistEntries(sample, finalUrl, 8);
      if (entries.length === 0) {
        return result(startedAt, {
          playable: false,
          outcome: "playlist_invalid",
          reason: "Playlist did not contain usable public stream entries.",
          finalUrl,
          contentType,
          bytesRead: body.length,
          redirects,
          playlistResolved: false,
          retryable: false,
        });
      }
      for (const entry of entries) {
        const nested = await probeRadioStream(entry, options, depth + 1);
        if (nested.playable) {
          return result(startedAt, {
            ...nested,
            redirects: redirects + nested.redirects,
            playlistResolved: true,
          });
        }
      }
      return result(startedAt, {
        playable: false,
        outcome: "playlist_invalid",
        reason: "No playlist entries passed stream verification.",
        finalUrl,
        contentType,
        bytesRead: body.length,
        redirects,
        playlistResolved: true,
        retryable: true,
      });
    }

    if (!isLikelyAudio(contentType, body, finalUrl)) {
      return result(startedAt, {
        playable: false,
        outcome: "unsupported_content",
        reason: "Response was not recognized as an audio stream.",
        finalUrl,
        contentType,
        bytesRead: body.length,
        redirects,
        playlistResolved: false,
        retryable: false,
      });
    }

    return result(startedAt, {
      playable: true,
      outcome: "playable",
      reason: "Bounded audio stream probe passed.",
      finalUrl,
      contentType,
      bytesRead: body.length,
      redirects,
      playlistResolved: false,
      retryable: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stream probe failed.";
    const timedOut = /timeout|aborted|abort/i.test(message);
    return result(startedAt, {
      playable: false,
      outcome: timedOut ? "timed_out" : "temporarily_unreachable",
      reason: message,
      finalUrl: validation.url,
      contentType: null,
      bytesRead: 0,
      redirects: 0,
      playlistResolved: false,
      retryable: true,
    });
  }
}

export function applyRadioVerificationProbe(
  row: RadioVerificationRow,
  probe: RadioStreamProbeResult,
  nowIso = new Date().toISOString()
): RadioVerificationUpdate {
  const currentScore = clampScore(Number(row.reliability_score ?? 0));
  const currentFailures = Math.max(0, Number(row.consecutive_failures ?? 0));

  if (probe.playable) {
    return {
      playback_status: "playable",
      is_verified: true,
      reliability_score: clampScore(Math.max(currentScore, 80) + 4),
      health_status: "playable",
      consecutive_failures: 0,
      last_health_checked_at: nowIso,
      last_health_error: null,
      quarantined_at: null,
      quarantine_reason: null,
      disabled_at: null,
    };
  }

  const failures = currentFailures + 1;
  const nextScore = clampScore(currentScore - (probe.retryable ? 8 : 18));
  const permanentFailure = !probe.retryable;
  const autoDisabled = permanentFailure && nextScore < RADIO_AUTO_DISABLE_THRESHOLD;
  const healthStatus = autoDisabled ? "blocked" : permanentFailure ? "failed" : "unchecked";

  return {
    playback_status: permanentFailure ? "failed" : "unchecked",
    is_verified: false,
    reliability_score: nextScore,
    health_status: healthStatus,
    consecutive_failures: failures,
    last_health_checked_at: nowIso,
    last_health_error: probe.reason,
    quarantined_at: permanentFailure ? nowIso : null,
    quarantine_reason: permanentFailure ? probe.outcome : null,
    disabled_at: autoDisabled ? nowIso : null,
  };
}

export function isPublicRadioEligible(row: RadioVerificationRow) {
  return (
    row.status === "approved" &&
    row.is_active === true &&
    row.is_verified === true &&
    row.playback_status === "playable" &&
    row.is_mature !== true &&
    !row.quarantined_at &&
    !row.disabled_at &&
    Number(row.reliability_score ?? 0) >= RADIO_PUBLIC_RELIABILITY_THRESHOLD
  );
}
