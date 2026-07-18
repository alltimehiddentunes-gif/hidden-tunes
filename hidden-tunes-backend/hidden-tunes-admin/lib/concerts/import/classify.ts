/**
 * Per-item concert content classification.
 * Accepts substantial live performances; rejects studio MVs, interviews, ads, etc.
 * Does NOT reject for duration alone when other concert signals are strong.
 */

import type { ConcertYouTubeVideoCandidate } from "./providers/youtubeClient";

export type ConcertClassificationDecision =
  | "accept_candidate"
  | "reject_non_concert"
  | "reject_unavailable"
  | "reject_paid_or_members"
  | "reject_embed_disabled";

export type ConcertClassificationResult = {
  decision: ConcertClassificationDecision;
  concertType:
    | "concert"
    | "festival_set"
    | "livestream"
    | "orchestra"
    | "opera"
    | "recital"
    | "venue_broadcast"
    | "cultural_performance"
    | "other";
  reasons: string[];
  isLive: boolean;
  isUpcoming: boolean;
  isReplay: boolean;
  score: number;
};

const REJECT_PATTERNS = [
  /\binterview\b/i,
  /\btrailer\b/i,
  /\bteaser\b/i,
  /\bbehind the scenes\b/i,
  /\bmaking of\b/i,
  /\bofficial music video\b/i,
  /\bmusic video\b/i,
  /\blyric video\b/i,
  /\baudio only\b/i,
  /\bvisualizer\b/i,
  /\bpodcast\b/i,
  /\bpress conference\b/i,
  /\badvertisement\b/i,
  /\bsponsored\b/i,
  /\bunboxing\b/i,
  /\breaction\b/i,
  /\bmembers?\s*only\b/i,
  /\bpaywall\b/i,
  /\bsubscribe to watch\b/i,
];

const STRONG_ACCEPT_PATTERNS = [
  /\blive (at|from|in|on)\b/i,
  /\bfull concert\b/i,
  /\bconcert\b/i,
  /\bfestival\b/i,
  /\blive set\b/i,
  /\blivestream\b/i,
  /\blive stream\b/i,
  /\bin concert\b/i,
  /\borchestra\b/i,
  /\bsymphony\b/i,
  /\bopera\b/i,
  /\brecital\b/i,
  /\bgospel\b/i,
  /\bchoir\b/i,
  /\bjazz (session|club|festival)\b/i,
  /\btiny desk\b/i,
  /\blive session\b/i,
  /\bperformance\b/i,
];

function textBlob(candidate: ConcertYouTubeVideoCandidate): string {
  return [candidate.title, candidate.description, candidate.tags.join(" ")].join("\n");
}

function inferConcertType(
  candidate: ConcertYouTubeVideoCandidate
): ConcertClassificationResult["concertType"] {
  const blob = textBlob(candidate);
  if (/\bopera\b/i.test(blob)) return "opera";
  if (/\borchestra|symphony|philharmon/i.test(blob)) return "orchestra";
  if (/\bfestival|live set\b/i.test(blob)) return "festival_set";
  if (/\brecital\b/i.test(blob)) return "recital";
  if (candidate.liveBroadcastContent === "live" || candidate.liveBroadcastContent === "upcoming") {
    return "livestream";
  }
  if (/\bvenue|hall|theatre|theater|opera house\b/i.test(blob)) return "venue_broadcast";
  if (/\bcultural|choir|gospel\b/i.test(blob)) return "cultural_performance";
  if (/\bconcert|live (at|from|in|session)\b/i.test(blob)) return "concert";
  return "other";
}

export function classifyConcertCandidate(
  candidate: ConcertYouTubeVideoCandidate
): ConcertClassificationResult {
  const reasons: string[] = [];
  const blob = textBlob(candidate);
  let score = 0;

  if (!candidate.title.trim()) {
    return {
      decision: "reject_unavailable",
      concertType: "other",
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
      reasons: ["embed_disabled"],
      isLive: candidate.liveBroadcastContent === "live",
      isUpcoming: candidate.liveBroadcastContent === "upcoming",
      isReplay: candidate.liveBroadcastContent === "none",
      score: 0,
    };
  }

  for (const pattern of REJECT_PATTERNS) {
    if (pattern.test(blob)) {
      const paid =
        /\bmembers?\s*only\b/i.test(blob) ||
        /\bpaywall\b/i.test(blob) ||
        /\bsubscribe to watch\b/i.test(blob);
      return {
        decision: paid ? "reject_paid_or_members" : "reject_non_concert",
        concertType: inferConcertType(candidate),
        reasons: [`matched_reject:${pattern}`],
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
  } else if (candidate.durationSeconds != null && candidate.durationSeconds >= 8 * 60) {
    score += 1;
    reasons.push("duration_substantial");
  }

  // Short clips can still be accepted when strong live-performance signals exist.
  if (
    candidate.durationSeconds != null &&
    candidate.durationSeconds > 0 &&
    candidate.durationSeconds < 90 &&
    score < 4
  ) {
    return {
      decision: "reject_non_concert",
      concertType: inferConcertType(candidate),
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
