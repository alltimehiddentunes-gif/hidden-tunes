/**
 * Verified / researched YouTube channel IDs for curated Concerts sources.
 * Prefer API forHandle resolution when YOUTUBE_API_KEY is present.
 * Entries here are only IDs confirmed from official channel URLs or Wikidata P2397.
 */

export const CONCERT_YOUTUBE_CHANNEL_IDS: Record<string, string> = {
  "arte-concert": "UC-smeLB9AnOTeypr1YyjJ3A",
  "berliner-philharmoniker": "UCtRkmSO4PrhJ4TzNOmFIwjw",
  "royal-opera-house": "UCHS5XKgf2FCBF8pZllE_bjw",
  "southbank-centre": "UCvS2UqiC4p3sLoJCyzIYgNQ",
  tomorrowland: "UCsN8M73DMWa8SPp5o_0IAQQ",
};

export function getKnownConcertYouTubeChannelId(
  stableKey: string
): string | null {
  return CONCERT_YOUTUBE_CHANNEL_IDS[stableKey] || null;
}
