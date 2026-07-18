/**
 * Performance fingerprint + hard/soft duplicate matching for Concerts.
 */

import { createHash } from "crypto";

export type ConcertDuplicateKind =
  | "exact_duplicate"
  | "same_provider_item"
  | "cross_source_same_stream"
  | "scheduled_to_replay"
  | "reupload"
  | "title_variant"
  | "excerpt_of_full"
  | "simulcast"
  | "localized_duplicate"
  | "work_title_variant"
  | "metadata_correction"
  | "probable_duplicate"
  | "unique";

export type ConcertFingerprintInput = {
  title?: string | null;
  primaryArtistName?: string | null;
  venueName?: string | null;
  eventName?: string | null;
  performanceDate?: string | null;
  scheduledStartAt?: string | null;
  durationSeconds?: number | null;
  setName?: string | null;
  composerWork?: string | null;
  providerChannelId?: string | null;
  lifecycleHint?: "scheduled" | "live" | "replay" | "unknown" | null;
};

export type ConcertSoftMatchCandidate = ConcertFingerprintInput & {
  id: string;
  provider?: string | null;
  providerContentId?: string | null;
  sourceId?: string | null;
  sourceItemId?: string | null;
  performanceFingerprint?: string | null;
};

export type ConcertSoftMatchResult = {
  kind: ConcertDuplicateKind;
  score: number;
  reasons: string[];
  autoMerge: boolean;
};

export function normalizeConcertDedupePart(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(official|full|hd|4k|live|concert|replay|stream)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function durationBucket(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "dur-unknown";
  // 2-minute buckets keep short sessions distinct while absorbing small metadata drift.
  return `dur-${Math.round(Number(seconds) / 120) * 120}`;
}

export function buildConcertPerformanceFingerprint(
  input: ConcertFingerprintInput
): string {
  const date =
    normalizeConcertDedupePart(
      (input.scheduledStartAt || input.performanceDate || "").slice(0, 10)
    ) || "date-unknown";

  const parts = [
    normalizeConcertDedupePart(input.title) || "title-unknown",
    normalizeConcertDedupePart(input.primaryArtistName) || "artist-unknown",
    normalizeConcertDedupePart(input.venueName) || "venue-unknown",
    normalizeConcertDedupePart(input.eventName) || "event-unknown",
    date,
    durationBucket(input.durationSeconds),
    normalizeConcertDedupePart(input.setName) || "set-unknown",
    normalizeConcertDedupePart(input.composerWork) || "work-unknown",
    normalizeConcertDedupePart(input.providerChannelId) || "channel-unknown",
    input.lifecycleHint || "unknown",
  ];

  return parts.join("|");
}

export function buildHardProviderKey(
  provider: string,
  providerContentId: string
): string {
  return `${normalizeConcertDedupePart(provider)}:${normalizeConcertDedupePart(
    providerContentId
  )}`;
}

export function buildSourceItemKey(sourceId: string, sourceItemId: string): string {
  return `${sourceId}:${sourceItemId}`;
}

export function buildConcertMetadataHash(input: Record<string, unknown>): string {
  const stable = JSON.stringify(input, Object.keys(input).sort());
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeConcertDedupePart(value).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const token of a) if (b.has(token)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/**
 * Soft duplicate scoring. High-confidence auto-merge only when score >= 0.92
 * with strong identity signals. Probable duplicates are flagged, never deleted.
 */
export function scoreConcertSoftDuplicate(
  left: ConcertSoftMatchCandidate,
  right: ConcertSoftMatchCandidate
): ConcertSoftMatchResult {
  const reasons: string[] = [];
  let score = 0;

  if (
    left.provider &&
    right.provider &&
    left.providerContentId &&
    right.providerContentId &&
    left.provider === right.provider &&
    left.providerContentId === right.providerContentId
  ) {
    return {
      kind: "same_provider_item",
      score: 1,
      reasons: ["identical_provider_content_id"],
      autoMerge: true,
    };
  }

  if (
    left.providerContentId &&
    right.providerContentId &&
    left.providerContentId === right.providerContentId &&
    left.provider !== right.provider
  ) {
    return {
      kind: "cross_source_same_stream",
      score: 0.99,
      reasons: ["same_content_id_across_providers"],
      autoMerge: true,
    };
  }

  if (
    left.performanceFingerprint &&
    right.performanceFingerprint &&
    left.performanceFingerprint === right.performanceFingerprint
  ) {
    score += 0.55;
    reasons.push("identical_performance_fingerprint");
  }

  const titleScore = jaccard(tokenSet(left.title || ""), tokenSet(right.title || ""));
  score += titleScore * 0.25;
  if (titleScore >= 0.8) reasons.push("title_similar");

  const artistScore = jaccard(
    tokenSet(left.primaryArtistName || ""),
    tokenSet(right.primaryArtistName || "")
  );
  score += artistScore * 0.15;
  if (artistScore >= 0.8) reasons.push("artist_similar");

  const venueScore = jaccard(
    tokenSet(left.venueName || ""),
    tokenSet(right.venueName || "")
  );
  score += venueScore * 0.08;
  if (venueScore >= 0.8) reasons.push("venue_similar");

  const eventScore = jaccard(
    tokenSet(left.eventName || ""),
    tokenSet(right.eventName || "")
  );
  score += eventScore * 0.08;
  if (eventScore >= 0.8) reasons.push("event_similar");

  const leftDate = (left.scheduledStartAt || left.performanceDate || "").slice(0, 10);
  const rightDate = (right.scheduledStartAt || right.performanceDate || "").slice(0, 10);
  if (leftDate && rightDate && leftDate === rightDate) {
    score += 0.12;
    reasons.push("same_performance_date");
  }

  if (
    left.durationSeconds != null &&
    right.durationSeconds != null &&
    Math.abs(left.durationSeconds - right.durationSeconds) <= 90
  ) {
    score += 0.08;
    reasons.push("duration_within_tolerance");
  }

  // Scheduled vs later replay of same performance
  const leftLife = left.lifecycleHint || "unknown";
  const rightLife = right.lifecycleHint || "unknown";
  if (
    ((leftLife === "scheduled" || leftLife === "live") && rightLife === "replay") ||
    ((rightLife === "scheduled" || rightLife === "live") && leftLife === "replay")
  ) {
    if (titleScore >= 0.7 && artistScore >= 0.7) {
      score += 0.15;
      reasons.push("scheduled_or_live_to_replay");
    }
  }

  // Excerpt vs full concert: similar identity, duration much shorter
  if (
    left.durationSeconds != null &&
    right.durationSeconds != null &&
    titleScore >= 0.75 &&
    artistScore >= 0.7
  ) {
    const shorter = Math.min(left.durationSeconds, right.durationSeconds);
    const longer = Math.max(left.durationSeconds, right.durationSeconds);
    if (longer >= 20 * 60 && shorter <= longer * 0.45) {
      return {
        kind: "excerpt_of_full",
        score: Math.min(0.9, score + 0.1),
        reasons: [...reasons, "duration_suggests_excerpt"],
        autoMerge: false,
      };
    }
  }

  if (
    left.composerWork &&
    right.composerWork &&
    normalizeConcertDedupePart(left.composerWork) ===
      normalizeConcertDedupePart(right.composerWork) &&
    artistScore >= 0.7
  ) {
    score += 0.1;
    reasons.push("same_composer_work");
  }

  let kind: ConcertDuplicateKind = "unique";
  let autoMerge = false;

  if (score >= 0.92 && reasons.includes("identical_performance_fingerprint")) {
    kind = "exact_duplicate";
    autoMerge = true;
  } else if (score >= 0.92 && reasons.includes("scheduled_or_live_to_replay")) {
    kind = "scheduled_to_replay";
    autoMerge = true;
  } else if (score >= 0.9 && titleScore >= 0.85 && artistScore >= 0.8) {
    kind = "reupload";
    autoMerge = true;
  } else if (score >= 0.75) {
    kind = "probable_duplicate";
    autoMerge = false;
  } else if (score >= 0.65 && reasons.includes("same_composer_work")) {
    kind = "work_title_variant";
    autoMerge = false;
  } else if (score >= 0.65 && titleScore >= 0.8) {
    kind = "title_variant";
    autoMerge = false;
  }

  return {
    kind,
    score: Number(score.toFixed(4)),
    reasons,
    autoMerge,
  };
}

/** Back-compat hard key helper used by Phase 4 persist path. */
export function buildConcertDedupeKey(input: {
  title: string;
  primaryArtistName?: string | null;
  eventName?: string | null;
  venueName?: string | null;
  performanceDate?: string | null;
  providerContentId?: string | null;
  durationSeconds?: number | null;
}): string {
  if (input.providerContentId) {
    return `provider:${normalizeConcertDedupePart(input.providerContentId)}`;
  }
  return `meta:${buildConcertPerformanceFingerprint(input)}`;
}
