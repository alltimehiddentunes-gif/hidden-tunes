/**
 * Public Sports browse eligibility.
 *
 * IPTV channel catalogs and TV bridge rows must never appear as fixtures
 * or competitions in the public Sports product.
 */

import type { SportsCompetitionCard, SportsMatchCard } from "../home/types";

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

export function isPlaceholderParticipantName(name?: string | null): boolean {
  const n = String(name || "").trim();
  if (!n) return true;
  return TBD_NAME_RE.test(n);
}

/**
 * True when a competition card is safe for public Sports browse.
 */
export function isPublicSportsCompetitionEligible(input: {
  name?: string | null;
  slug?: string | null;
  status?: string | null;
}): boolean {
  const status = String(input.status || "").toLowerCase();
  if (
    status === "quarantined" ||
    status === "removed" ||
    status === "inactive" ||
    status === "rights_revoked"
  ) {
    return false;
  }
  if (isCatalogOnlyCompetitionName(input.name, input.slug)) return false;
  return true;
}

/**
 * Extract home/away names from a conventional "Home vs Away" title.
 * Only used when competition is already non-catalog.
 */
export function parseVersusTitle(
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

/**
 * True when a match card represents a real sporting fixture for public browse.
 */
export function isPublicSportsFixtureEligible(
  card: SportsMatchCard
): boolean {
  if (!card?.id) return false;

  if (
    isCatalogOnlyCompetitionName(
      card.competition?.name,
      card.competition?.slug
    )
  ) {
    return false;
  }

  const title = String(card.title || "").trim();
  if (title && CHANNEL_TITLE_RE.test(title) && !(card.participants || []).length) {
    return false;
  }
  // Official livestream / catalog video titles are not sporting fixtures.
  if (/\blive\b|re-air|watchalong|\|/i.test(title)) {
    return false;
  }

  let participants = (card.participants || []).filter(
    (p) => p && !isPlaceholderParticipantName(p.name)
  );

  // Legitimate competitions may store identity in "Home vs Away" titles
  // before participant rows are attached.
  if (participants.length < 2) {
    const parsed = parseVersusTitle(title);
    if (parsed) {
      participants = [
        {
          id: "title-home",
          type: "other",
          name: parsed.home,
          side: "home",
          score: null,
        },
        {
          id: "title-away",
          type: "other",
          name: parsed.away,
          side: "away",
          score: null,
        },
      ];
    }
  }

  if (participants.length < 2) {
    return false;
  }

  // Channel listings often duplicate the title onto both sides.
  if (
    title &&
    participants.every((p) => String(p.name).trim().toLowerCase() === title.toLowerCase())
  ) {
    return false;
  }
  if (participants.some((p) => CHANNEL_TITLE_RE.test(String(p.name || "")))) {
    return false;
  }

  const startsAt = Date.parse(String(card.timing?.startsAt || ""));
  if (!Number.isFinite(startsAt)) return false;

  if (card.status?.finished) {
    const hasScore = participants.some(
      (p) => p.score != null && String(p.score).trim() !== ""
    );
    // Title-only finished rows without scores are not legitimate results.
    // Allow through only when score fields exist on the card.
    if (!hasScore) return false;
  }

  if (card.status?.live) {
    const avail = String(card.availabilityState || "");
    const playable = card.watchability?.playable === true;
    if (
      !playable &&
      avail !== "live_external" &&
      avail !== "live_subscription"
    ) {
      return false;
    }
  }

  return true;
}

export function filterPublicSportsCompetitions<T extends SportsCompetitionCard>(
  items: T[] | null | undefined
): T[] {
  return (items || []).filter((c) =>
    isPublicSportsCompetitionEligible({
      name: c.name,
      slug: c.slug,
    })
  );
}

export function filterPublicSportsFixtures(
  items: SportsMatchCard[] | null | undefined
): SportsMatchCard[] {
  return (items || []).filter(isPublicSportsFixtureEligible);
}

export function filterPublicSportsSearchTitle(title?: string | null): boolean {
  const t = String(title || "").trim();
  if (!t) return false;
  if (CATALOG_COMPETITION_RE.test(t)) return false;
  if (CHANNEL_TITLE_RE.test(t)) return false;
  return true;
}
