/**
 * Client-side repair for Sports match cards when production payloads still
 * ship duplicated "Home vs Away" participant names or oldest-first Results.
 * Does not invent live status or scores.
 */
import type {
  SportsFixtureDetail,
  SportsMatchCard,
  SportsMatchParticipant,
} from "../../../types/sports";

const VS_RE = /\s+vs\.?\s+/i;

function parseVersusTitle(
  title?: string | null
): { home: string; away: string } | null {
  const t = String(title || "").trim();
  if (!t) return null;
  const m = t.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (!m) return null;
  const home = m[1].trim();
  const away = m[2].trim();
  if (!home || !away || home.toLowerCase() === away.toLowerCase()) return null;
  return { home, away };
}

function looksLikeVersusName(name?: string | null): boolean {
  const n = String(name || "").trim();
  return n.length > 0 && VS_RE.test(n);
}

function startsAtMs(card: SportsMatchCard): number {
  const t = Date.parse(String(card.timing?.startsAt || ""));
  return Number.isFinite(t) ? t : 0;
}

/**
 * When both sides are the full match title (or otherwise look like "A vs B"),
 * split the card title into home/away names while preserving scores/ids/sides.
 */
export function normalizeMatchCardParticipants<T extends SportsMatchCard>(
  card: T
): T {
  const participants = Array.isArray(card.participants)
    ? [...card.participants]
    : [];
  if (participants.length === 0) return card;

  const title = String(card.title || "").trim();
  const parsed = parseVersusTitle(title);
  if (!parsed) return card;

  const homeIdx = participants.findIndex((p) => p?.side === "home");
  const awayIdx = participants.findIndex((p) => p?.side === "away");
  const i0 = homeIdx >= 0 ? homeIdx : 0;
  const i1 = awayIdx >= 0 ? awayIdx : participants.length > 1 ? 1 : -1;
  if (i1 < 0 || i0 === i1) return card;

  const a = participants[i0];
  const b = participants[i1];
  const aName = String(a?.name || "").trim();
  const bName = String(b?.name || "").trim();

  const bothVersus = looksLikeVersusName(aName) && looksLikeVersusName(bName);
  const bothTitle =
    aName === title && bName === title && title.length > 0;
  const identicalVersus =
    aName.length > 0 && aName === bName && looksLikeVersusName(aName);

  if (!bothVersus && !bothTitle && !identicalVersus) return card;

  const next: SportsMatchParticipant[] = participants.map((p, idx) => {
    if (idx === i0) {
      return { ...p, name: parsed.home, side: p.side || "home" };
    }
    if (idx === i1) {
      return { ...p, name: parsed.away, side: p.side || "away" };
    }
    return p;
  });

  return { ...card, participants: next };
}

export function normalizeMatchCards(
  items: SportsMatchCard[] | null | undefined
): SportsMatchCard[] {
  return (items || []).map((c) => normalizeMatchCardParticipants(c));
}

/** Finished Results must show newest kickoff first. */
export function sortFinishedNewestFirst(
  items: SportsMatchCard[] | null | undefined
): SportsMatchCard[] {
  return [...(items || [])].sort((a, b) => startsAtMs(b) - startsAtMs(a));
}

export function normalizeFixtureDetail(
  fixture: SportsFixtureDetail | null | undefined
): SportsFixtureDetail | null | undefined {
  if (!fixture) return fixture;
  const normalized = normalizeMatchCardParticipants(fixture);
  const related = Array.isArray(fixture.relatedFixtures)
    ? normalizeMatchCards(fixture.relatedFixtures)
    : fixture.relatedFixtures;
  return { ...normalized, relatedFixtures: related };
}
