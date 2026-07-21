/**
 * Client-side Sports public eligibility — rejects catalog/placeholder cards
 * even if a stale or unpatched API still returns them.
 */
import type { SportsCompetitionCard, SportsMatchCard } from "../../types/sports";

const CATALOG_COMPETITION_RE =
  /\b(iptv[\s_-]?org|tv\s*catalog|sports\s*bridge|free[\s_-]?tv\s*iptv|playlist)\b/i;

const CATALOG_SLUG_RE =
  /(^|-)(iptv|free-tv-playlist|tv-catalog|sports-bridge|ww-iptv)(-|$)/i;

const CHANNEL_TITLE_RE =
  /\b(\d{3,4}p|not\s*24\/7|720p|1080p|2160p|hdtv|pluto\s*tv|acc\s*network)\b/i;

const TBD_NAME_RE = /^(tbd|tba|unknown|n\/?a|-|—|–)$/i;

export function isCatalogOnlyCompetitionName(
  name?: string | null,
  slug?: string | null
): boolean {
  const n = String(name || "").trim();
  const s = String(slug || "").trim();
  if (n && CATALOG_COMPETITION_RE.test(n)) return true;
  if (s && CATALOG_SLUG_RE.test(s)) return true;
  return false;
}

function isPlaceholderParticipantName(name?: string | null): boolean {
  const n = String(name || "").trim();
  if (!n) return true;
  return TBD_NAME_RE.test(n);
}

function parseVersusTitle(
  title?: string | null
): { home: string; away: string } | null {
  const t = String(title || "").trim();
  if (!t || CHANNEL_TITLE_RE.test(t)) return null;
  const m = t.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (!m) return null;
  const home = m[1].trim();
  const away = m[2].trim();
  if (
    !home ||
    !away ||
    isPlaceholderParticipantName(home) ||
    isPlaceholderParticipantName(away)
  ) {
    return null;
  }
  return { home, away };
}

export function isPublicSportsCompetitionEligible(input: {
  name?: string | null;
  slug?: string | null;
}): boolean {
  return !isCatalogOnlyCompetitionName(input.name, input.slug);
}

export function isPublicSportsFixtureEligible(card: SportsMatchCard): boolean {
  if (!card?.id) return false;
  if (
    isCatalogOnlyCompetitionName(
      card.competition?.name,
      card.competition?.slug
    )
  ) {
    return false;
  }

  const title = String((card as { title?: string | null }).title || "").trim();
  if (/\blive\b|re-air|watchalong|\|/i.test(title)) {
    return false;
  }
  let participants = (card.participants || []).filter(
    (p) => p && !isPlaceholderParticipantName(p.name)
  );
  if (participants.length < 2) {
    const parsed = parseVersusTitle(title);
    if (parsed) {
      participants = [
        { id: "title-home", type: "other", name: parsed.home, side: "home" },
        { id: "title-away", type: "other", name: parsed.away, side: "away" },
      ];
    }
  }
  if (participants.length < 2) return false;
  if (participants.some((p) => CHANNEL_TITLE_RE.test(String(p.name || "")))) {
    return false;
  }

  const startsAt = Date.parse(String(card.timing?.startsAt || ""));
  if (!Number.isFinite(startsAt)) return false;

  if (card.status?.finished) {
    const hasScore = participants.some(
      (p) => p.score != null && String(p.score).trim() !== ""
    );
    if (!hasScore) return false;
  }

  return true;
}

export function filterPublicSportsCompetitions(
  items: SportsCompetitionCard[] | null | undefined
): SportsCompetitionCard[] {
  return (items || []).filter((c) =>
    isPublicSportsCompetitionEligible({ name: c.name, slug: c.slug })
  );
}

export function filterPublicSportsFixtures(
  items: SportsMatchCard[] | null | undefined
): SportsMatchCard[] {
  return (items || []).filter(isPublicSportsFixtureEligible);
}
