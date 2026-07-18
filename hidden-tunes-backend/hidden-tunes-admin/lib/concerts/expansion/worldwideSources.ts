/**
 * Worldwide discovery seeds — multi-provider, multi-country, multi-language.
 * Not a closed pilot list. Expansion continues until 25k playable or sources exhaust.
 * Channel IDs are optional; handles/URLs are enough to attempt discovery.
 */

import type { ConcertMediaProviderId } from "../candidate";

export type ConcertDiscoverySeed = {
  stableKey: string;
  name: string;
  provider: ConcertMediaProviderId;
  countryCode: string;
  languageCodes: string[];
  discoveryUrl: string;
  category:
    | "orchestra"
    | "opera"
    | "festival"
    | "venue"
    | "broadcaster"
    | "university"
    | "conservatory"
    | "cultural"
    | "artist"
    | "dj"
    | "gospel"
    | "jazz"
    | "government"
    | "other";
  notes?: string;
};

/** Curated starting set — runners append discovered sources over time. */
export const WORLDWIDE_CONCERT_DISCOVERY_SEEDS: ConcertDiscoverySeed[] = [
  // Europe
  { stableKey: "yt-arte-concert", name: "ARTE Concert", provider: "youtube", countryCode: "FR", languageCodes: ["fr", "de", "en"], discoveryUrl: "https://www.youtube.com/@arteconcert", category: "broadcaster" },
  { stableKey: "yt-berlin-phil", name: "Berliner Philharmoniker", provider: "youtube", countryCode: "DE", languageCodes: ["de", "en"], discoveryUrl: "https://www.youtube.com/@BerlinPhilharmoniker", category: "orchestra" },
  { stableKey: "yt-vienna-phil", name: "Wiener Philharmoniker", provider: "youtube", countryCode: "AT", languageCodes: ["de", "en"], discoveryUrl: "https://www.youtube.com/@WienerPhilharmoniker", category: "orchestra" },
  { stableKey: "yt-concertgebouw", name: "Concertgebouw", provider: "youtube", countryCode: "NL", languageCodes: ["nl", "en"], discoveryUrl: "https://www.youtube.com/@Concertgebouw", category: "venue" },
  { stableKey: "yt-royal-opera", name: "Royal Opera House", provider: "youtube", countryCode: "GB", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@RoyalOperaHouse", category: "opera" },
  { stableKey: "yt-met-opera", name: "Metropolitan Opera", provider: "youtube", countryCode: "US", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@MetropolitanOpera", category: "opera" },
  { stableKey: "yt-opera-paris", name: "Opéra de Paris", provider: "youtube", countryCode: "FR", languageCodes: ["fr", "en"], discoveryUrl: "https://www.youtube.com/@operadeparis", category: "opera" },
  { stableKey: "yt-scala", name: "Teatro alla Scala", provider: "youtube", countryCode: "IT", languageCodes: ["it", "en"], discoveryUrl: "https://www.youtube.com/@TeatroallaScala", category: "opera" },
  { stableKey: "yt-southbank", name: "Southbank Centre", provider: "youtube", countryCode: "GB", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@SouthbankCentre", category: "venue" },
  { stableKey: "yt-montreux", name: "Montreux Jazz Festival", provider: "youtube", countryCode: "CH", languageCodes: ["en", "fr"], discoveryUrl: "https://www.youtube.com/@MontreuxJazzFestival", category: "festival" },
  { stableKey: "yt-montreal-jazz", name: "Festival International de Jazz de Montréal", provider: "youtube", countryCode: "CA", languageCodes: ["fr", "en"], discoveryUrl: "https://www.youtube.com/@MontrealJazzFestival", category: "jazz" },
  { stableKey: "yt-tomorrowland", name: "Tomorrowland", provider: "youtube", countryCode: "BE", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@tomorrowland", category: "dj" },
  { stableKey: "yt-coachella", name: "Coachella", provider: "youtube", countryCode: "US", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@coachella", category: "festival" },
  // Americas
  { stableKey: "yt-carnegie", name: "Carnegie Hall", provider: "youtube", countryCode: "US", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@CarnegieHall", category: "venue" },
  { stableKey: "yt-lincoln", name: "Lincoln Center", provider: "youtube", countryCode: "US", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@LincolnCenter", category: "cultural" },
  { stableKey: "yt-kennedy", name: "Kennedy Center", provider: "youtube", countryCode: "US", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@KennedyCenter", category: "cultural" },
  { stableKey: "yt-sf-symphony", name: "San Francisco Symphony", provider: "youtube", countryCode: "US", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@sfsymphony", category: "orchestra" },
  { stableKey: "yt-laphil", name: "LA Phil", provider: "youtube", countryCode: "US", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@LAPhil", category: "orchestra" },
  { stableKey: "yt-bso", name: "Boston Symphony", provider: "youtube", countryCode: "US", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@BostonSymphony", category: "orchestra" },
  { stableKey: "yt-cso", name: "Chicago Symphony", provider: "youtube", countryCode: "US", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@chicagosymphony", category: "orchestra" },
  { stableKey: "yt-npr-music", name: "NPR Music", provider: "youtube", countryCode: "US", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@nprmusic", category: "broadcaster" },
  { stableKey: "yt-kexp", name: "KEXP", provider: "youtube", countryCode: "US", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@kexp", category: "broadcaster" },
  { stableKey: "yt-loc-concerts", name: "Library of Congress", provider: "youtube", countryCode: "US", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@LibraryOfCongress", category: "government" },
  { stableKey: "yt-smithsonian-folkways", name: "Smithsonian Folkways", provider: "youtube", countryCode: "US", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@SmithsonianFolkways", category: "cultural" },
  // Education / conservatories
  { stableKey: "yt-juilliard", name: "Juilliard", provider: "youtube", countryCode: "US", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@juilliardschool", category: "conservatory" },
  { stableKey: "yt-curtis", name: "Curtis Institute", provider: "youtube", countryCode: "US", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@curtisinstitute", category: "conservatory" },
  { stableKey: "yt-rcm", name: "Royal College of Music", provider: "youtube", countryCode: "GB", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@RoyalCollegeofMusic", category: "conservatory" },
  { stableKey: "yt-oxford-music", name: "Oxford Faculty of Music", provider: "youtube", countryCode: "GB", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@OxfordFacultyofMusic", category: "university" },
  // Asia-Pacific / Middle East / Africa starters
  { stableKey: "yt-sydney-opera", name: "Sydney Opera House", provider: "youtube", countryCode: "AU", languageCodes: ["en"], discoveryUrl: "https://www.youtube.com/@SydneyOperaHouse", category: "venue" },
  { stableKey: "yt-dutch-national-opera", name: "Dutch National Opera", provider: "youtube", countryCode: "NL", languageCodes: ["nl", "en"], discoveryUrl: "https://www.youtube.com/@DutchNationalOperaBallet", category: "opera" },
  // Multi-provider examples (non-YouTube centre)
  { stableKey: "vimeo-staff-picks-music", name: "Vimeo music performances", provider: "vimeo", countryCode: "WW", languageCodes: ["en"], discoveryUrl: "https://vimeo.com", category: "other", notes: "Discovery via Vimeo search/API when configured" },
  { stableKey: "dailymotion-live-music", name: "Dailymotion live music", provider: "dailymotion", countryCode: "WW", languageCodes: ["en", "fr"], discoveryUrl: "https://www.dailymotion.com", category: "other" },
  { stableKey: "twitch-music-live", name: "Twitch music live", provider: "twitch", countryCode: "WW", languageCodes: ["en"], discoveryUrl: "https://www.twitch.tv/directory/category/music", category: "other" },
];

export function listWorldwideConcertDiscoverySeeds(): ConcertDiscoverySeed[] {
  return [...WORLDWIDE_CONCERT_DISCOVERY_SEEDS];
}

export function countDiscoverySeedsByProvider(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const seed of WORLDWIDE_CONCERT_DISCOVERY_SEEDS) {
    out[seed.provider] = (out[seed.provider] || 0) + 1;
  }
  return out;
}
