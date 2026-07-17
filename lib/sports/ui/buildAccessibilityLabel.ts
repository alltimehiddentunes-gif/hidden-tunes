import type { SportsMatchCard } from "../../../types/sports";
import { formatMatchTitle, formatScore, participantBySide } from "./formatScore";
import { formatMatchMinute, formatStatusLabel } from "./formatStatus";
export function buildMatchAccessibilityLabel(card: SportsMatchCard): string {
  const title = formatMatchTitle(card);
  const status = formatStatusLabel(card.status?.code, card.status?.label);
  const parts: string[] = [title];
  if (status) parts.push(status.toLowerCase());
  const home = participantBySide(card.participants, "home");
  const away = participantBySide(card.participants, "away");
  const score = formatScore(card);
  if (score && home?.name && away?.name) {
    parts.push(
      `${home.name} ${home.score}, ${away.name} ${away.score}`
    );
  }
  const minute = formatMatchMinute(card);
  if (minute) {
    if (minute.endsWith("'")) {
      parts.push(`${minute.replace("'", "")}th minute`);
    } else {
      parts.push(minute);
    }
  }
  if (card.competition?.name) {
    parts.push(card.competition.name);
  }
  return parts.join(", ");
}
