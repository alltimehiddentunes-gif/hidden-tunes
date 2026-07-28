/**
 * Verified / researched YouTube channel IDs for curated Concerts sources.
 * Prefer API forHandle resolution when YOUTUBE_API_KEY is present.
 * Entries here are only IDs confirmed from official channel URLs or page HTML.
 */

export const CONCERT_YOUTUBE_CHANNEL_IDS: Record<string, string> = {
  "arte-concert": "UC-smeLB9AnOTeypr1YyjJ3A",
  "berliner-philharmoniker": "UCtRkmSO4PrhJ4TzNOmFIwjw",
  "royal-opera-house": "UCHS5XKgf2FCBF8pZllE_bjw",
  "southbank-centre": "UCvS2UqiC4p3sLoJCyzIYgNQ",
  tomorrowland: "UCsN8M73DMWa8SPp5o_0IAQQ",
  // Batch 2 HTML-resolved (never invented)
  "metropolitan-opera": "UCLWiWcQEaD13TeTTe-9BAfQ",
  "metropolitan-opera-b2": "UCLWiWcQEaD13TeTTe-9BAfQ",
  "wiener-philharmoniker": "UChxAHbAPREgyfyJ7S93lb2Q",
  "wiener-philharmoniker-b2": "UChxAHbAPREgyfyJ7S93lb2Q",
  "royal-college-of-music": "UCjUQsk6a-IvdSeUboCifDxQ",
  "royal-college-of-music-b2": "UCjUQsk6a-IvdSeUboCifDxQ",
  "montreux-jazz": "UC65g9NTJpi7hCuJZlJJqF0Q",
  "montreux-jazz-b2": "UC65g9NTJpi7hCuJZlJJqF0Q",
  "montreal-jazz": "UCc_FsbggOe4RkQVTlyTp-8A",
  "montreal-jazz-b2": "UCc_FsbggOe4RkQVTlyTp-8A",
  "oxford-music": "UC-huTevVUqiTKcD0Jcry1Jw",
  "oxford-music-b2": "UC-huTevVUqiTKcD0Jcry1Jw",
  "library-of-congress": "UCFBtCMrH0sf3CvA-K3s6r5g",
  "library-of-congress-concerts": "UCFBtCMrH0sf3CvA-K3s6r5g",
  "library-of-congress-b2": "UCFBtCMrH0sf3CvA-K3s6r5g",
  "loc-concerts-b2": "UCFBtCMrH0sf3CvA-K3s6r5g",
};

export function getKnownConcertYouTubeChannelId(
  stableKey: string
): string | null {
  return CONCERT_YOUTUBE_CHANNEL_IDS[stableKey] || null;
}
