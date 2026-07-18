/**
 * Per-item concert content classification (worldwide formats).
 * Duration is supporting evidence only — never a sole reject reason when
 * the item is clearly a substantial live musical performance.
 * Provider-agnostic: YouTube is not required.
 */

import type { ConcertMediaCandidate } from "../candidate";
import type { ConcertYouTubeVideoCandidate } from "../providers/youtubeClient";
import type { ConcertRejectionReasonCode } from "./rejectionMemory";

export type ConcertClassificationDecision =
  | "accept_candidate"
  | "reject_non_concert"
  | "reject_unavailable"
  | "reject_paid_or_members"
  | "reject_embed_disabled";

export type ConcertAcceptedType =
  | "full_concert"
  | "festival_set"
  | "live_artist_set"
  | "live_session"
  | "orchestra_concert"
  | "opera"
  | "choir_performance"
  | "gospel_concert"
  | "jazz_session"
  | "classical_recital"
  | "chamber_performance"
  | "dj_festival_set"
  | "acoustic_performance"
  | "university_concert"
  | "conservatory_performance"
  | "venue_livestream"
  | "public_broadcaster_concert"
  | "government_cultural_performance"
  | "official_concert_replay"
  | "scheduled_concert_livestream"
  | "substantial_single_live_performance"
  | "concert"
  | "livestream"
  | "orchestra"
  | "recital"
  | "venue_broadcast"
  | "cultural_performance"
  | "other";

export type ConcertClassificationResult = {
  decision: ConcertClassificationDecision;
  concertType: ConcertAcceptedType;
  rejectionCode?: ConcertRejectionReasonCode;
  reasons: string[];
  isLive: boolean;
  isUpcoming: boolean;
  isReplay: boolean;
  score: number;
};

type ClassifiableConcert = {
  title: string;
  description?: string | null;
  tags?: string[] | null;
  liveBroadcastContent?: string | null;
  durationSeconds?: number | null;
  embeddable?: boolean | null;
};

const REJECT_RULES: Array<{
  pattern: RegExp;
  code: ConcertRejectionReasonCode;
}> = [
  { pattern: /\binterview\b/i, code: "interview" },
  { pattern: /\btrailer\b|\bteaser\b/i, code: "trailer" },
  { pattern: /\bpromo\b|\badvertisement\b|\bsponsored\b/i, code: "promo" },
  {
    pattern: /\bofficial music video\b|\bmusic video\b|\blyric video\b/i,
    code: "studio_music_video",
  },
  { pattern: /\baudio only\b|\bvisualizer\b/i, code: "studio_music_video" },
  {
    pattern: /\bbehind the scenes\b|\bmaking of\b|\bpress conference\b/i,
    code: "not_concert",
  },
  { pattern: /\bpodcast\b|\bunboxing\b|\breaction\b/i, code: "not_concert" },
  { pattern: /\bmembers?\s*only\b/i, code: "members_only" },
  { pattern: /\bpaywall\b|\bsubscribe to watch\b/i, code: "paid_only" },
];

const STRONG_ACCEPT_PATTERNS = [
  /\bfull concert\b/i,
  /\blive (at|from|in|on)\b/i,
  /\bin concert\b/i,
  /\bfestival\b/i,
  /\blive set\b/i,
  /\bdj set\b/i,
  /\blivestream\b/i,
  /\blive stream\b/i,
  /\blive session\b/i,
  /\btiny desk\b/i,
  /\borchestra\b/i,
  /\bsymphony\b/i,
  /\bphilharmon/i,
  /\bopera\b/i,
  /\brecital\b/i,
  /\bchamber\b/i,
  /\bgospel\b/i,
  /\bchoir\b/i,
  /\bjazz (session|club|festival|live)\b/i,
  /\bacoustic (session|live|performance)\b/i,
  /\bconservatory\b/i,
  /\buniversity\b.*\bconcert\b/i,
  /\bconcert\b/i,
  /\bperformance\b/i,
];

function textBlob(candidate: ClassifiableConcert): string {
  return [
    candidate.title,
    candidate.description || "",
    (candidate.tags || []).join(" "),
  ].join("\n");
}

export function inferConcertType(candidate: ClassifiableConcert): ConcertAcceptedType {
  const blob = textBlob(candidate);
  if (candidate.liveBroadcastContent === "upcoming") return "scheduled_concert_livestream";
  if (candidate.liveBroadcastContent === "live") return "venue_livestream";
  if (/\bopera\b/i.test(blob)) return "opera";
  if (/\bchamber\b/i.test(blob)) return "chamber_performance";
  if (/\brecital\b/i.test(blob)) return "classical_recital";
  if (/\borchestra|symphony|philharmon/i.test(blob)) return "orchestra_concert";
  if (/\bgospel\b/i.test(blob)) return "gospel_concert";
  if (/\bchoir\b/i.test(blob)) return "choir_performance";
  if (/\bjazz\b/i.test(blob)) return "jazz_session";
  if (/\bdj set\b/i.test(blob)) return "dj_festival_set";
  if (/\bacoustic\b/i.test(blob)) return "acoustic_performance";
  if (/\bconservatory\b/i.test(blob)) return "conservatory_performance";
  if (/\buniversity\b/i.test(blob)) return "university_concert";
  if (/\bfestival|live set\b/i.test(blob)) return "festival_set";
  if (/\btiny desk|live session\b/i.test(blob)) return "live_session";
  if (/\bfull concert\b/i.test(blob)) return "full_concert";
  if (/\blive (at|from|in)\b/i.test(blob)) return "live_artist_set";
  if (/\bconcert\b/i.test(blob)) return "official_concert_replay";
  if (/\bperformance\b/i.test(blob)) return "substantial_single_live_performance";
  return "other";
}

export function classifyConcertCandidate(
  candidate: ClassifiableConcert | ConcertYouTubeVideoCandidate | ConcertMediaCandidate
): ConcertClassificationResult {
  const reasons: string[] = [];
  const blob = textBlob(candidate);
  let score = 0;

  if (!String(candidate.title || "").trim()) {
    return {
      decision: "reject_unavailable",
      concertType: "other",
      rejectionCode: "metadata_insufficient",
      reasons: ["missing_title"],
      isLive: false,
      isUpcoming: false,
      isReplay: false,
      score: 0,
    };
  }

  if (candidate.embeddable === false) {
    return {
      decision: "reject_embed_disabled",
      concertType: inferConcertType(candidate),
      rejectionCode: "embed_disabled",
      reasons: ["embed_disabled"],
      isLive: candidate.liveBroadcastContent === "live",
      isUpcoming: candidate.liveBroadcastContent === "upcoming",
      isReplay: candidate.liveBroadcastContent === "none",
      score: 0,
    };
  }

  for (const rule of REJECT_RULES) {
    if (rule.pattern.test(blob)) {
      return {
        decision:
          rule.code === "members_only" || rule.code === "paid_only"
            ? "reject_paid_or_members"
            : "reject_non_concert",
        concertType: inferConcertType(candidate),
        rejectionCode: rule.code,
        reasons: [`matched_reject:${rule.code}`],
        isLive: false,
        isUpcoming: false,
        isReplay: false,
        score: 0,
      };
    }
  }

  for (const pattern of STRONG_ACCEPT_PATTERNS) {
    if (pattern.test(blob)) {
      score += 2;
      reasons.push(`matched_accept:${pattern}`);
    }
  }

  if (candidate.liveBroadcastContent === "live") {
    score += 3;
    reasons.push("live_broadcast");
  } else if (candidate.liveBroadcastContent === "upcoming") {
    score += 3;
    reasons.push("upcoming_broadcast");
  } else if (
    candidate.durationSeconds != null &&
    candidate.durationSeconds >= 8 * 60
  ) {
    score += 1;
    reasons.push("duration_supporting_evidence");
  }

  // Duration alone never rejects a clearly substantial live performance.
  if (
    candidate.durationSeconds != null &&
    candidate.durationSeconds > 0 &&
    candidate.durationSeconds < 45 &&
    score < 4
  ) {
    return {
      decision: "reject_non_concert",
      concertType: inferConcertType(candidate),
      rejectionCode: "short_insufficient",
      reasons: [...reasons, "too_short_without_strong_signal"],
      isLive: false,
      isUpcoming: false,
      isReplay: false,
      score,
    };
  }

  if (score < 2) {
    return {
      decision: "reject_non_concert",
      concertType: inferConcertType(candidate),
      rejectionCode: "not_concert",
      reasons: [...reasons, "insufficient_concert_signal"],
      isLive: false,
      isUpcoming: false,
      isReplay: false,
      score,
    };
  }

  const isLive = candidate.liveBroadcastContent === "live";
  const isUpcoming = candidate.liveBroadcastContent === "upcoming";
  const isReplay = !isLive && !isUpcoming;

  return {
    decision: "accept_candidate",
    concertType: inferConcertType(candidate),
    reasons,
    isLive,
    isUpcoming,
    isReplay,
    score,
  };
}
