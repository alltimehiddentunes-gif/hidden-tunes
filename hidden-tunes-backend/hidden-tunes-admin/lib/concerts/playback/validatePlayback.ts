/**
 * App-path playback validation for Concerts.
 * Metadata / oEmbed is evidence only — never publication proof.
 * Matches Hidden Tunes WebView embed + HLS/DASH stream usage.
 */

import type { ConcertMediaCandidate } from "../candidate";
import { resolveConcertProviderAdapter } from "../providers/adapters";
import type { ConcertPlaybackResolution } from "../providers/adapter";
import type { ConcertPlaybackValidationSignal } from "./validationPrep";

export type ConcertPlaybackValidationResult = {
  playable: boolean;
  method: string;
  embedUrl: string | null;
  streamUrl: string | null;
  watchUrl: string | null;
  httpStatus: number | null;
  signals: Partial<Record<ConcertPlaybackValidationSignal, boolean | null>>;
  reasons: string[];
  evidence: Record<string, unknown>;
};

const FAIL_BODY =
  /video unavailable|video is private|embedding disabled|playback on other websites has been disabled|this video is not available|content is not available|error\s*153|login required|members only|subscribe to watch/i;

async function fetchText(
  url: string,
  options?: { method?: string; timeoutMs?: number; signal?: AbortSignal }
): Promise<{ ok: boolean; status: number; body: string; finalUrl: string }> {
  const response = await fetch(url, {
    method: options?.method || "GET",
    headers: {
      Accept: "*/*",
      "User-Agent": "HiddenTunesConcertValidator/1.0",
    },
    redirect: "follow",
    cache: "no-store",
    signal:
      options?.signal ?? AbortSignal.timeout(options?.timeoutMs ?? 12_000),
  });
  const body = await response.text().catch(() => "");
  return {
    ok: response.ok,
    status: response.status,
    body: body.slice(0, 8000),
    finalUrl: response.url || url,
  };
}

function resolutionForCandidate(
  candidate: ConcertMediaCandidate
): ConcertPlaybackResolution {
  const adapter = resolveConcertProviderAdapter(
    candidate.embedUrl ||
      candidate.streamUrl ||
      candidate.officialWatchUrl ||
      candidate.providerContentId,
    candidate.provider
  );
  if (!adapter) {
    return {
      method: "unsupported",
      embedUrl: candidate.embedUrl,
      streamUrl: candidate.streamUrl,
      watchUrl: candidate.officialWatchUrl,
      appCompatible: false,
      reason: "no_adapter",
    };
  }
  return adapter.resolvePlayback({
    contentId: candidate.providerContentId,
    watchUrl: candidate.officialWatchUrl,
    embedUrl: candidate.embedUrl,
    streamUrl: candidate.streamUrl,
  });
}

/**
 * Validate the playback path the app would use after tap.
 * Does not preload players into browse; this is worker-side validation only.
 */
export async function validateConcertAppPlayback(
  candidate: ConcertMediaCandidate,
  options?: { timeoutMs?: number; signal?: AbortSignal; skipNetwork?: boolean }
): Promise<ConcertPlaybackValidationResult> {
  const reasons: string[] = [];
  const signals: ConcertPlaybackValidationResult["signals"] = {
    playback_starts: null,
    provider_player_loads: null,
  };

  if (candidate.embeddable === false) {
    return {
      playable: false,
      method: candidate.playbackMethod,
      embedUrl: candidate.embedUrl,
      streamUrl: candidate.streamUrl,
      watchUrl: candidate.officialWatchUrl,
      httpStatus: null,
      signals: { ...signals, embed_allowed: false },
      reasons: ["embed_disabled"],
      evidence: { embeddable: false },
    };
  }

  const resolution = resolutionForCandidate(candidate);
  if (!resolution.appCompatible || resolution.method === "unsupported") {
    return {
      playable: false,
      method: resolution.method,
      embedUrl: resolution.embedUrl,
      streamUrl: resolution.streamUrl,
      watchUrl: resolution.watchUrl,
      httpStatus: null,
      signals: { ...signals, unsupported_player: true },
      reasons: [resolution.reason || "unsupported_player"],
      evidence: { resolution },
    };
  }

  if (options?.skipNetwork) {
    return {
      playable: true,
      method: resolution.method,
      embedUrl: resolution.embedUrl,
      streamUrl: resolution.streamUrl,
      watchUrl: resolution.watchUrl,
      httpStatus: null,
      signals: {
        ...signals,
        embed_allowed: true,
        provider_player_loads: true,
        playback_starts: null,
      },
      reasons: ["skip_network_fixture"],
      evidence: { resolution, note: "network skipped — not publication proof" },
    };
  }

  // Direct stream path (HLS/DASH) — probe media bytes/headers.
  if (resolution.streamUrl && (resolution.method === "hls" || resolution.method === "dash")) {
    try {
      const probed = await fetchText(resolution.streamUrl, {
        method: "GET",
        timeoutMs: options?.timeoutMs,
        signal: options?.signal,
      });
      const looksLikePlaylist =
        /#EXTM3U|MPD|mpeg-dash|application\/vnd\.apple\.mpegurl|application\/dash\+xml/i.test(
          probed.body
        ) ||
        /mpegurl|dash\+xml|octet-stream/i.test(probed.body.slice(0, 200));
      const playable = probed.ok && (looksLikePlaylist || probed.status === 200);
      if (!playable) reasons.push(`stream_http_${probed.status}`);
      else reasons.push("stream_probe_ok");
      return {
        playable,
        method: resolution.method,
        embedUrl: null,
        streamUrl: resolution.streamUrl,
        watchUrl: resolution.watchUrl,
        httpStatus: probed.status,
        signals: {
          provider_player_loads: playable,
          playback_starts: playable ? true : false,
          dead_stream: !playable,
        },
        reasons,
        evidence: {
          finalUrl: probed.finalUrl,
          bodySnippet: probed.body.slice(0, 240),
        },
      };
    } catch (error) {
      return {
        playable: false,
        method: resolution.method,
        embedUrl: null,
        streamUrl: resolution.streamUrl,
        watchUrl: resolution.watchUrl,
        httpStatus: null,
        signals: { temporary_provider_error: true, dead_stream: true },
        reasons: [error instanceof Error ? error.message : "stream_probe_error"],
        evidence: {},
      };
    }
  }

  // Embed / iframe path used by the app WebView.
  const probeUrl = resolution.embedUrl || resolution.watchUrl;
  if (!probeUrl) {
    return {
      playable: false,
      method: resolution.method,
      embedUrl: null,
      streamUrl: null,
      watchUrl: null,
      httpStatus: null,
      signals: { unsupported_player: true },
      reasons: ["missing_probe_url"],
      evidence: { resolution },
    };
  }

  try {
    const probed = await fetchText(probeUrl, {
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
    signals.watch_page_ok = probed.ok;
    signals.embed_allowed = probed.ok;
    signals.provider_player_loads = probed.ok;

    if (!probed.ok) {
      reasons.push(`player_http_${probed.status}`);
      if (probed.status === 404 || probed.status === 410) {
        signals.removed_or_private = true;
        signals.dead_stream = true;
      }
      return {
        playable: false,
        method: resolution.method,
        embedUrl: resolution.embedUrl,
        streamUrl: resolution.streamUrl,
        watchUrl: resolution.watchUrl,
        httpStatus: probed.status,
        signals,
        reasons,
        evidence: { finalUrl: probed.finalUrl },
      };
    }

    if (FAIL_BODY.test(probed.body)) {
      const match = probed.body.match(FAIL_BODY)?.[0] || "provider_failure_text";
      reasons.push(`player_body:${match}`);
      signals.playback_starts = false;
      if (/private|not available|unavailable/i.test(match)) {
        signals.removed_or_private = true;
      }
      if (/embedding disabled|153/i.test(match)) {
        signals.embed_allowed = false;
      }
      if (/login|members|subscribe/i.test(match)) {
        signals.login_required = /login/i.test(match);
        signals.members_only = /members/i.test(match);
        signals.subscription_required = /subscribe/i.test(match);
      }
      return {
        playable: false,
        method: resolution.method,
        embedUrl: resolution.embedUrl,
        streamUrl: resolution.streamUrl,
        watchUrl: resolution.watchUrl,
        httpStatus: probed.status,
        signals,
        reasons,
        evidence: { finalUrl: probed.finalUrl, matched: match },
      };
    }

    // Player document loaded without immediate failure text.
    // Mark playable for catalogue automation; note that true "playback_starts"
    // still benefits from client-side confirmation when available.
    reasons.push("player_document_ok");
    signals.playback_starts = true;
    if (candidate.liveBroadcastContent === "live") signals.is_currently_live = true;
    if (candidate.liveBroadcastContent === "upcoming") {
      signals.scheduled_not_started = true;
    }
    if (candidate.liveBroadcastContent === "none") signals.replay_available = true;

    return {
      playable: true,
      method: resolution.method,
      embedUrl: resolution.embedUrl,
      streamUrl: resolution.streamUrl,
      watchUrl: resolution.watchUrl,
      httpStatus: probed.status,
      signals,
      reasons,
      evidence: {
        finalUrl: probed.finalUrl,
        oembed_not_used_as_proof: true,
        app_path: resolution.method,
      },
    };
  } catch (error) {
    return {
      playable: false,
      method: resolution.method,
      embedUrl: resolution.embedUrl,
      streamUrl: resolution.streamUrl,
      watchUrl: resolution.watchUrl,
      httpStatus: null,
      signals: { temporary_provider_error: true },
      reasons: [error instanceof Error ? error.message : "player_probe_error"],
      evidence: {},
    };
  }
}
