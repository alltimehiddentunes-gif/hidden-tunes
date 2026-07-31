/**
 * Competition / venue / context labels for Sports cards.
 * Never invents competition names — only uses API fields or title suffixes.
 */
import type { SportsMatchCard } from "../../../types/sports";
import { formatCountdown, formatFinishedTime, formatKickoff } from "./formatKickoff";

export function formatCompetitionLabel(card: SportsMatchCard): string | null {
  const named = String(
    card.competition?.shortName || card.competition?.name || ""
  ).trim();
  if (named) return named;

  const title = String(card.title || "").trim();
  if (!title.includes("|")) return null;
  const parts = title
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  // Prefer the first suffix segment (usually competition), skip LIVE/re-air noise.
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (/\blive\b|re-air|watchalong/i.test(part)) continue;
    if (part.length < 3) continue;
    return part.length > 42 ? `${part.slice(0, 40)}…` : part;
  }
  return null;
}

export function formatVenueLabel(card: SportsMatchCard): string | null {
  const venue = card.venue?.name?.trim();
  if (venue) return venue;
  const city = card.venue?.city?.trim();
  const country = card.venue?.countryCode?.trim();
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country && country !== "ZZ") return country;
  return null;
}

/**
 * Primary context under the teams: competition preferred over bare sport.
 */
export function formatMatchContextPrimary(card: SportsMatchCard): string | null {
  return (
    formatCompetitionLabel(card) ||
    card.sport?.name?.trim() ||
    null
  );
}

/**
 * Secondary timing / place line for shelves and results.
 */
export function formatMatchContextSecondary(
  card: SportsMatchCard,
  nowMs: number
): string | null {
  const isLive = card.status?.live === true;
  const finished = card.status?.finished === true;
  const kickoff = formatKickoff(card.timing?.startsAt, nowMs);
  const countdown = formatCountdown(card.timing?.startsAt, nowMs);
  const finishedTime = formatFinishedTime(
    card.timing?.endsAt,
    card.timing?.startsAt,
    nowMs
  );
  const venue = formatVenueLabel(card);

  if (isLive) {
    return [venue, "In progress"].filter(Boolean).join(" · ") || "In progress";
  }
  if (finished) {
    return [finishedTime, venue].filter(Boolean).join(" · ") || null;
  }
  return [countdown || kickoff, venue].filter(Boolean).join(" · ") || null;
}
