import type { WorldwideRadioCountry } from "@/lib/radioWorldwideExpansion/types";

const M3U_BASE =
  "https://raw.githubusercontent.com/junguler/m3u-radio-music-playlists/main/listen_fm/checked";

/** High-priority explicit junguler filenames; others fall back to "{Name}.m3u". */
export const WORLDWIDE_COUNTRY_M3U_FILES: Record<string, string[]> = {
  DE: ["Germany.m3u"],
  FR: ["France.m3u"],
  IT: ["Italy.m3u"],
  ES: ["Spain.m3u"],
  GB: ["United Kingdom.m3u", "UK.m3u", "England.m3u"],
  NL: ["Netherlands.m3u", "Holland.m3u"],
  SE: ["Sweden.m3u"],
  NO: ["Norway.m3u"],
  FI: ["Finland.m3u"],
  DK: ["Denmark.m3u"],
  PL: ["Poland.m3u"],
  PT: ["Portugal.m3u"],
  RO: ["Romania.m3u"],
  UA: ["Ukraine.m3u"],
  CZ: ["Czech Republic.m3u", "Czechia.m3u"],
  AT: ["Austria.m3u"],
  CH: ["Switzerland.m3u"],
  BE: ["Belgium.m3u"],
  IE: ["Ireland.m3u"],
  HU: ["Hungary.m3u"],
  GR: ["Greece.m3u"],
  BG: ["Bulgaria.m3u"],
  HR: ["Croatia.m3u"],
  RS: ["Serbia.m3u"],
  SK: ["Slovakia.m3u"],
  SI: ["Slovenia.m3u"],
  LT: ["Lithuania.m3u"],
  LV: ["Latvia.m3u"],
  EE: ["Estonia.m3u"],
  IS: ["Iceland.m3u"],
  LU: ["Luxembourg.m3u"],
  MT: ["Malta.m3u"],
  CY: ["Cyprus.m3u"],
  RU: ["Russia.m3u"],
  BY: ["Belarus.m3u"],
  MD: ["Moldova.m3u"],
  BA: ["Bosnia.m3u", "Bosnia and Herzegovina.m3u"],
  MK: ["Macedonia.m3u", "North Macedonia.m3u"],
  AL: ["Albania.m3u"],
  ME: ["Montenegro.m3u"],
  XK: ["Kosovo.m3u"],
  US: ["United States.m3u", "USA.m3u"],
  CA: ["Canada.m3u"],
  MX: ["Mexico.m3u"],
  BR: ["Brazil.m3u"],
  AR: ["Argentina.m3u"],
  CL: ["Chile.m3u"],
  CO: ["Colombia.m3u"],
  PE: ["Peru.m3u"],
  AU: ["Australia.m3u"],
  NZ: ["New Zealand.m3u"],
  JP: ["Japan.m3u"],
  KR: ["South Korea.m3u", "Korea.m3u"],
  CN: ["China.m3u"],
  IN: ["India.m3u"],
  ID: ["Indonesia.m3u"],
  PH: ["Philippines.m3u"],
  TH: ["Thailand.m3u"],
  VN: ["Vietnam.m3u"],
  TR: ["Turkey.m3u"],
  IL: ["Israel.m3u"],
  SA: ["Saudi Arabia.m3u"],
  AE: ["United Arab Emirates.m3u", "UAE.m3u"],
};

export type PlaylistEntry = { name: string; streamUrl: string };

export function parseM3u(text: string): PlaylistEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: PlaylistEntry[] = [];
  let pendingName: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF:")) {
      const comma = line.indexOf(",");
      pendingName = comma >= 0 ? line.slice(comma + 1).trim() : "Radio Station";
      continue;
    }
    if (line.startsWith("#")) continue;
    if (/^https?:\/\//i.test(line) && pendingName) {
      entries.push({ name: pendingName, streamUrl: line });
      pendingName = null;
    }
  }
  return entries;
}

function m3uFilesForCountry(country: WorldwideRadioCountry): string[] {
  const mapped = WORLDWIDE_COUNTRY_M3U_FILES[country.code.toUpperCase()];
  if (mapped?.length) return mapped;
  const names = [country.name, ...(country.aliases || [])];
  return names.map((n) => `${n}.m3u`);
}

export async function fetchM3uForCountry(
  country: WorldwideRadioCountry,
  userAgent: string
): Promise<{ file: string; entries: PlaylistEntry[] } | null> {
  for (const file of m3uFilesForCountry(country)) {
    const encoded = file
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    const url = `${M3U_BASE}/${encoded}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": userAgent, Accept: "audio/x-mpegurl,*/*" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.includes("#EXT")) continue;
      return { file, entries: parseM3u(text) };
    } catch {
      // try next filename
    }
  }
  return null;
}
