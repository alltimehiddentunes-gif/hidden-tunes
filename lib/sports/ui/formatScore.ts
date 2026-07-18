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
  return "Match";
}
export function participantInitials(name: string | null | undefined): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}
