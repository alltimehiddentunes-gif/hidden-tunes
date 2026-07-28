/**
 * Shared podcast public verification rules (general + mature).
 *
 * Reliability score formula (deterministic, 0–100):
 * - Start from previous score (default 100).
 * - On successful feed or audio probe: +6, consecutive_failures = 0.
 * - On failed probe: -12; if consecutive_failures >= 3 after increment: additional -8.
 * - Recency bonus (successful probe only): up to +4 when last success < 24h.
 * - Clamp to [0, 100].
 * - Public threshold: PODCAST_RELIABILITY_THRESHOLD (60).
 * - Auto-disable threshold: PODCAST_AUTO_DISABLE_THRESHOLD (30).
 * - Reliability never overrides hard gates (is_verified, playback_status, quarantine).
 */

export const PODCAST_RELIABILITY_THRESHOLD = 60;
export const PODCAST_AUTO_DISABLE_THRESHOLD = 30;
export const PODCAST_VERIFY_BATCH_SIZE = 50;
export const PODCAST_HEALTH_MAX_CONCURRENCY = 4;
export const PODCAST_FEED_PROBE_TIMEOUT_MS = 12_000;
export const PODCAST_AUDIO_PROBE_TIMEOUT_MS = 12_000;
export const PODCAST_MAX_REDIRECTS = 5;
export const PODCAST_MAX_FEED_BYTES = 2_500_000;
export const PODCAST_MAX_AUDIO_PROBE_BYTES = 16_384;
export const PODCAST_RETRY_BASE_DELAY_MS = 60_000;
export const PODCAST_RETRY_MAX_DELAY_MS = 3_600_000;
export const PODCAST_QUARANTINE_FAILURE_THRESHOLD = 5;

export type PodcastCatalogKind = "general" | "mature";

export type PodcastVerificationRow = {
  status?: string | null;
  is_active?: boolean | null;
  feed_status?: string | null;
  playback_status?: string | null;
  is_verified?: boolean | null;
  is_mature?: boolean | null;
  reliability_score?: number | null;
  consecutive_failures?: number | null;
  quarantined_at?: string | null;
  last_play_verified_at?: string | null;
  audio_url?: string | null;
};

export function clampPodcastReliabilityScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function computePodcastReliabilityScore(input: {
  previousScore?: number | null;
  consecutiveFailures?: number | null;
  probeSucceeded: boolean;
  lastSuccessAt?: string | null;
  now?: Date;
}) {
  const now = input.now || new Date();
  let score = clampPodcastReliabilityScore(Number(input.previousScore ?? 100));
  const failures = Math.max(0, Number(input.consecutiveFailures ?? 0));

  if (input.probeSucceeded) {
    score = clampPodcastReliabilityScore(score + 6);
    if (input.lastSuccessAt) {
      const ageMs = now.getTime() - Date.parse(input.lastSuccessAt);
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000) {
        score = clampPodcastReliabilityScore(score + 4);
      }
    }
    return { reliability_score: score, consecutive_failures: 0 };
  }

  const nextFailures = failures + 1;
  const penalty = nextFailures >= 3 ? 20 : 12;
  return {
    reliability_score: clampPodcastReliabilityScore(score - penalty),
    consecutive_failures: nextFailures,
  };
}

export function isPodcastQuarantined(row: Pick<PodcastVerificationRow, "quarantined_at">) {
  return Boolean(row.quarantined_at);
}

export function isPublicVerifiedPodcastEpisode(row: PodcastVerificationRow) {
  return (
    row.status === "approved" &&
    row.is_active === true &&
    row.playback_status === "playable" &&
    row.is_verified === true &&
    !isPodcastQuarantined(row) &&
    Boolean(row.last_play_verified_at) &&
    Number(row.reliability_score ?? 100) >= PODCAST_RELIABILITY_THRESHOLD &&
    Boolean(row.audio_url)
  );
}

export function isPublicVerifiedPodcastShow(
  row: PodcastVerificationRow,
  options?: { verifiedPlayableEpisodeCount?: number }
) {
  const episodeCount = Number(options?.verifiedPlayableEpisodeCount ?? 0);
  return (
    row.status === "approved" &&
    row.is_active === true &&
    row.feed_status === "active" &&
    row.is_verified === true &&
    !isPodcastQuarantined(row) &&
    Number(row.reliability_score ?? 100) >= PODCAST_RELIABILITY_THRESHOLD &&
    episodeCount > 0
  );
}

export function isPublicVerifiedMaturePodcastShow(
  row: PodcastVerificationRow,
  options?: { verifiedPlayableEpisodeCount?: number }
) {
  return row.is_mature === true && isPublicVerifiedPodcastShow(row, options);
}

export function computeRetryDelayMs(attempts: number) {
  const attempt = Math.max(1, attempts);
  const delay = PODCAST_RETRY_BASE_DELAY_MS * 2 ** Math.min(attempt - 1, 6);
  return Math.min(PODCAST_RETRY_MAX_DELAY_MS, delay);
}
