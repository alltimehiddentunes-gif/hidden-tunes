/**
 * Lightweight playability probe for import-time gating.
 * Full health/quarantine workers come in later phases.
 * Uses official oEmbed + embeddable flags only — never extracts media URLs.
 */

import type { ConcertYouTubeVideoCandidate } from "../providers/youtubeClient";

export type ConcertPlaybackProbeResult = {
  ok: boolean;
  reason: string;
  httpStatus: number | null;
  embeddable: boolean | null;
};

export async function probeYouTubeConcertPlayability(
  candidate: ConcertYouTubeVideoCandidate,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<ConcertPlaybackProbeResult> {
  if (candidate.embeddable === false) {
    return {
      ok: false,
      reason: "embed_disabled",
      httpStatus: null,
      embeddable: false,
    };
  }

  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    candidate.officialWatchUrl
  )}&format=json`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal:
        options?.signal ?? AbortSignal.timeout(options?.timeoutMs ?? 12_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: `oembed_http_${response.status}`,
        httpStatus: response.status,
        embeddable: candidate.embeddable,
      };
    }

    const payload = (await response.json()) as { title?: string };
    if (!payload.title) {
      return {
        ok: false,
        reason: "oembed_missing_title",
        httpStatus: response.status,
        embeddable: candidate.embeddable,
      };
    }

    return {
      ok: true,
      reason: "oembed_ok",
      httpStatus: response.status,
      embeddable: candidate.embeddable,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "oembed_error",
      httpStatus: null,
      embeddable: candidate.embeddable,
    };
  }
}
