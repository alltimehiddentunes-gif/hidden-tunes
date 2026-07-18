/**
 * Football name normalization for ScoreBat matching.
 * Does not invent aliases beyond common FC/suffix stripping.
 */

const SUFFIXES = [
  /\bfc\b/gi,
  /\bcf\b/gi,
  /\bafc\b/gi,
  /\bsc\b/gi,
  /\bac\b/gi,
  /\buk\b/gi,
  /\bfootball club\b/gi,
];

const ALIASES: Record<string, string> = {
  "bayern munchen": "bayern munich",
  "bayern münchen": "bayern munich",
  "fc bayern munchen": "bayern munich",
  "fc bayern münchen": "bayern munich",
  "paris saint germain": "paris saint-germain",
  "paris saint-germain fc": "paris saint-germain",
  "manchester united fc": "manchester united",
  "manchester city fc": "manchester city",
  "tottenham hotspur fc": "tottenham hotspur",
  "atletico madrid": "atlético madrid",
  "atletico de madrid": "atlético madrid",
};

export function normalizeFootballName(input: string): string {
  let s = String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const re of SUFFIXES) {
    s = s.replace(re, " ");
  }
  s = s.replace(/\s+/g, " ").trim();

  if (ALIASES[s]) return ALIASES[s];
  return s;
}

export function competitionSlugFromName(name: string): string | null {
  const raw = String(name || "").trim();
  if (!raw) return null;
  // "ENGLAND: Premier League" → england-premier-league style
  const cleaned = raw
    .toLowerCase()
    .replace(/^[^:]+:\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || null;
}

export function countryFromCompetitionLabel(name: string): string | null {
  const m = String(name || "").match(/^([A-Z][A-Z\s]+):/);
  if (!m) return null;
  const region = m[1].trim().toUpperCase();
  const map: Record<string, string> = {
    ENGLAND: "GB",
    SPAIN: "ES",
    ITALY: "IT",
    GERMANY: "DE",
    FRANCE: "FR",
    PORTUGAL: "PT",
    NETHERLANDS: "NL",
    SCOTLAND: "GB",
    USA: "US",
    "UNITED STATES": "US",
    EUROPE: null as unknown as string,
    INTERNATIONAL: null as unknown as string,
  };
  const code = map[region];
  return code || null;
}

export function parseHomeAwayFromTitle(title: string): {
  home: string | null;
  away: string | null;
} {
  const t = String(title || "").trim();
  const parts = t.split(/\s+-\s+/);
  if (parts.length === 2) {
    return { home: parts[0].trim() || null, away: parts[1].trim() || null };
  }
  const vs = t.split(/\s+vs\.?\s+/i);
  if (vs.length === 2) {
    return { home: vs[0].trim() || null, away: vs[1].trim() || null };
  }
  return { home: null, away: null };
}
