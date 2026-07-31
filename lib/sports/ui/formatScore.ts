import type { SportsMatchCard, SportsMatchParticipant } from "../../../types/sports";
export function participantBySide(
  participants: SportsMatchParticipant[] | undefined,
  side: "home" | "away"
): SportsMatchParticipant | undefined {
  if (!participants?.length) return undefined;
  const exact = participants.find((p) => p.side === side);
  if (exact) return exact;
  return side === "home" ? participants[0] : participants[1];
}
export function formatScore(card: SportsMatchCard): string | null {
  const home = participantBySide(card.participants, "home");
  const away = participantBySide(card.participants, "away");
  if (
    home?.score == null ||
    away?.score == null ||
    String(home.score).length === 0 ||
    String(away.score).length === 0
  ) {
    return null;
  }
  return `${home.score}–${away.score}`;
}
export function formatMatchTitle(card: SportsMatchCard): string {
  const home = participantBySide(card.participants, "home");
  const away = participantBySide(card.participants, "away");
  const homeName = home?.name?.trim() || "";
  const awayName = away?.name?.trim() || "";
  if (homeName || awayName) {
    return `${homeName || "Unknown team"} vs ${awayName || "Unknown team"}`;
  }
  const names = (card.participants || []).map((p) => p.name).filter(Boolean);
  if (names.length >= 2) return `${names[0]} vs ${names[1]}`;
  if (names.length === 1) return names[0];
  const title = String((card as SportsMatchCard & { title?: string }).title || "").trim();
  if (title) return title;
  const competition = card.competition?.name?.trim();
  if (competition) return competition;
  const sport = card.sport?.name?.trim();
  if (sport) return sport;
  return "Match";
}
export function participantInitials(name: string | null | undefined): string {
  const SKIP = new Set([
    "fc",
    "afc",
    "cf",
    "sc",
    "ac",
    "as",
    "ss",
    "us",
    "sv",
    "vfl",
    "vfb",
    "tsc",
    "1.",
    "the",
    "de",
    "la",
    "le",
    "of",
  ]);
  const parts = String(name || "")
    .trim()
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((p) => !SKIP.has(p.toLowerCase().replace(/\.$/, "")));
  if (!parts.length) {
    const raw = String(name || "").trim();
    return raw ? raw.slice(0, 2).toUpperCase() : "?";
  }
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

/** Stable crest-placeholder colors from a team name. */
export function participantBadgeTone(name: string | null | undefined): {
  backgroundColor: string;
  borderColor: string;
  color: string;
} {
  const raw = String(name || "").trim();
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  const tones = [
    {
      backgroundColor: "rgba(232,184,109,0.16)",
      borderColor: "rgba(232,184,109,0.38)",
      color: "#F0D2A0",
    },
    {
      backgroundColor: "rgba(155,107,158,0.20)",
      borderColor: "rgba(155,107,158,0.42)",
      color: "#D4B0D6",
    },
    {
      backgroundColor: "rgba(61,220,151,0.12)",
      borderColor: "rgba(61,220,151,0.34)",
      color: "#8BE8BF",
    },
    {
      backgroundColor: "rgba(100,149,237,0.16)",
      borderColor: "rgba(100,149,237,0.38)",
      color: "#A8C4F5",
    },
    {
      backgroundColor: "rgba(255,77,109,0.12)",
      borderColor: "rgba(255,77,109,0.34)",
      color: "#FF9AAD",
    },
    {
      backgroundColor: "rgba(255,255,255,0.08)",
      borderColor: "rgba(255,255,255,0.18)",
      color: "#D2D8E6",
    },
  ];
  return tones[hash % tones.length];
}
