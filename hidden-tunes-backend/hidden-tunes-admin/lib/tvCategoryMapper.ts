/**
 * Maps raw seed / iptv-org labels into Hidden Tunes public TV browse categories.
 * A station may map to multiple categories (primary + tags).
 */

export const TV_PRIMARY_CATEGORY_NAMES = [
  "Featured",
  "Trending",
  "News",
  "Sports",
  "Movies",
  "Entertainment",
  "Kids",
  "Documentary",
  "Music TV",
  "Afrobeats",
  "Amapiano",
  "Hip Hop",
  "R&B",
  "Pop",
  "Rock",
  "Country",
  "Jazz",
  "Classical",
  "Reggae",
  "Latin",
  "EDM",
  "Worship Music",
  "Live Sessions",
  "Artist TV",
  "Festival Streams",
  "Lifestyle",
  "Education",
  "Government",
  "Africa",
  "Europe",
  "Americas",
  "Asia",
  "Local TV",
  "Motivation",
  "Emotional Worlds",
] as const;

const SEED_CATEGORY_MAP: Record<string, string[]> = {
  music: ["Music TV", "Live Sessions"],
  movie: ["Movies", "Entertainment"],
  movies: ["Movies", "Entertainment"],
  news: ["News"],
  sports: ["Sports"],
  worship: ["Worship Music", "Emotional Worlds"],
  documentary: ["Documentary", "Education"],
  culture: ["Entertainment", "Lifestyle"],
  education: ["Education"],
  local: ["Local TV"],
  international: ["Europe", "Americas", "Asia", "Africa"],
  mature: ["Entertainment"],
  concerts: ["Live Sessions", "Festival Streams", "Artist TV"],
};

const NAME_HINTS: Array<{ pattern: RegExp; categories: string[] }> = [
  { pattern: /\bafro\s*beats?\b/i, categories: ["Afrobeats", "Music TV", "Africa"] },
  { pattern: /\bamapiano\b/i, categories: ["Amapiano", "Music TV", "Africa"] },
  { pattern: /\bhip[\s-]?hop\b/i, categories: ["Hip Hop", "Music TV"] },
  { pattern: /\br\s*&\s*b\b/i, categories: ["R&B", "Music TV"] },
  { pattern: /\bpop\b/i, categories: ["Pop", "Music TV"] },
  { pattern: /\brock\b/i, categories: ["Rock", "Music TV"] },
  { pattern: /\bcountry\b/i, categories: ["Country", "Music TV"] },
  { pattern: /\bjazz\b/i, categories: ["Jazz", "Music TV", "Live Sessions"] },
  { pattern: /\bclassical\b/i, categories: ["Classical", "Music TV"] },
  { pattern: /\breggae\b/i, categories: ["Reggae", "Music TV"] },
  { pattern: /\blatin\b/i, categories: ["Latin", "Music TV"] },
  { pattern: /\bedm\b|dance|clubbing/i, categories: ["EDM", "Music TV", "Festival Streams"] },
  { pattern: /\bworship|gospel|faith|praise\b/i, categories: ["Worship Music", "Emotional Worlds"] },
  { pattern: /\btiny desk|live session|concert|festival\b/i, categories: ["Live Sessions", "Artist TV", "Festival Streams"] },
  { pattern: /\bmotivat|mindset|discipline|focus\b/i, categories: ["Motivation", "Emotional Worlds"] },
  { pattern: /\bted\b|documentary|history\b/i, categories: ["Documentary", "Education"] },
  { pattern: /\bnews\b/i, categories: ["News"] },
  { pattern: /\bsport|football|soccer|nba|nfl\b/i, categories: ["Sports"] },
  { pattern: /\bkids|children|cartoon\b/i, categories: ["Kids"] },
  { pattern: /\bmovie|cinema|film\b/i, categories: ["Movies", "Entertainment"] },
  { pattern: /\bnasa|space\b/i, categories: ["Documentary", "Education", "Featured"] },
];

const REGION_MAP: Record<string, string[]> = {
  US: ["Americas"],
  CA: ["Americas"],
  MX: ["Americas", "Latin"],
  BR: ["Americas", "Latin"],
  GB: ["Europe"],
  UK: ["Europe"],
  FR: ["Europe"],
  DE: ["Europe"],
  ES: ["Europe", "Latin"],
  IT: ["Europe"],
  NG: ["Africa", "Afrobeats"],
  GH: ["Africa", "Afrobeats"],
  ZA: ["Africa", "Amapiano"],
  KE: ["Africa"],
  IN: ["Asia"],
  JP: ["Asia"],
  KR: ["Asia"],
  CN: ["Asia"],
  AT: ["Europe"],
  AU: ["Asia", "Americas"],
};

export function mapTvCategories(input: {
  title: string;
  seedCategory?: string | null;
  genre?: string | null;
  mood?: string | null;
  format?: string | null;
  country?: string | null;
  iptvCategories?: string[];
  extraTags?: string[];
  isFeatured?: boolean;
}) {
  const categories = new Set<string>();

  const seedKey = String(input.seedCategory || "")
    .trim()
    .toLowerCase();
  for (const label of SEED_CATEGORY_MAP[seedKey] || []) {
    categories.add(label);
  }

  if (input.genre) categories.add(input.genre);
  if (input.mood) categories.add(input.mood);
  if (input.format) categories.add(input.format);

  for (const tag of input.extraTags || []) {
    if (tag) categories.add(tag);
  }

  for (const iptvCategory of input.iptvCategories || []) {
    const normalized = String(iptvCategory || "").trim();
    if (!normalized) continue;
    if (TV_PRIMARY_CATEGORY_NAMES.includes(normalized as (typeof TV_PRIMARY_CATEGORY_NAMES)[number])) {
      categories.add(normalized);
    } else {
      categories.add(
        normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase()
      );
    }
  }

  for (const rule of NAME_HINTS) {
    if (rule.pattern.test(input.title)) {
      for (const label of rule.categories) categories.add(label);
    }
  }

  const country = String(input.country || "")
    .trim()
    .toUpperCase();
  for (const label of REGION_MAP[country] || []) {
    categories.add(label);
  }

  if (categories.size === 0) {
    categories.add("Entertainment");
  }

  if (input.isFeatured) {
    categories.add("Featured");
    categories.add("Trending");
  }

  const ordered = [...categories];
  return {
    primary: ordered[0] || "Entertainment",
    all: ordered,
  };
}
