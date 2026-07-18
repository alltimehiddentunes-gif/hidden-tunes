/**
 * Concert candidate deduplication helpers.
 */

export function normalizeConcertDedupePart(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

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

  const durationBucket =
    input.durationSeconds == null
      ? "dur-unknown"
      : `dur-${Math.round(input.durationSeconds / 30) * 30}`;

  return [
    "meta",
    normalizeConcertDedupePart(input.title),
    normalizeConcertDedupePart(input.primaryArtistName),
    normalizeConcertDedupePart(input.eventName),
    normalizeConcertDedupePart(input.venueName),
    normalizeConcertDedupePart(input.performanceDate?.slice(0, 10)),
    durationBucket,
  ].join("|");
}
