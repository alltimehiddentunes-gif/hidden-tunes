import fs from "node:fs";
import path from "node:path";

import { PODCAST_MASS_EXPANSION_DATA_DIR } from "@/lib/podcastExpansionConstants";

export type PodcastCatalogKind = "standard" | "mature";

export type PodcastSourceKind = "itunes" | "podcast_index";

export type PodcastSourceRegistryEntry = {
  source_key: string;
  source_name: string;
  source_kind: PodcastSourceKind;
  catalog: PodcastCatalogKind;
  is_enabled: boolean;
  is_exhausted: boolean;
  checkpoint_cursor: string;
  query_index: number;
  language_index: number;
  feeds_accepted: number;
  feeds_rejected: number;
  last_successful_import: string | null;
  last_failed_import: string | null;
  failure_count: number;
};

export const PODCAST_EXPANSION_LANGUAGES = [
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "nl",
  "ja",
  "ko",
  "zh",
  "ar",
  "hi",
  "ru",
  "pl",
  "sv",
  "tr",
  "id",
  "vi",
  "th",
  "he",
] as const;

/** Valid iTunes Search API storefront country codes for worldwide podcast discovery. */
export const PODCAST_EXPANSION_ITUNES_COUNTRIES = [
  // North America
  "US",
  "CA",
  "MX",
  // Caribbean / Central America
  "JM",
  "TT",
  "CR",
  "PA",
  // South America
  "BR",
  "AR",
  "CL",
  "CO",
  "PE",
  "VE",
  "EC",
  "UY",
  // Western Europe
  "GB",
  "IE",
  "FR",
  "DE",
  "ES",
  "PT",
  "IT",
  "NL",
  "BE",
  "AT",
  "CH",
  // Nordic
  "SE",
  "NO",
  "DK",
  "FI",
  "IS",
  // Eastern Europe
  "PL",
  "CZ",
  "HU",
  "RO",
  "BG",
  "UA",
  "RU",
  // Balkans
  "GR",
  "TR",
  "HR",
  "RS",
  "SI",
  // Middle East
  "AE",
  "SA",
  "IL",
  "JO",
  "EG",
  // Africa
  "ZA",
  "NG",
  "KE",
  "GH",
  "MA",
  // South Asia
  "IN",
  "PK",
  "BD",
  "LK",
  // Southeast Asia
  "ID",
  "MY",
  "SG",
  "TH",
  "VN",
  "PH",
  // East Asia
  "JP",
  "KR",
  "TW",
  "HK",
  // Oceania
  "AU",
  "NZ",
] as const;

export type PodcastExpansionItunesCountry =
  (typeof PODCAST_EXPANSION_ITUNES_COUNTRIES)[number];

export function resolveItunesCountryForIndex(index: number): PodcastExpansionItunesCountry {
  const normalized = Math.max(0, index);
  return PODCAST_EXPANSION_ITUNES_COUNTRIES[
    normalized % PODCAST_EXPANSION_ITUNES_COUNTRIES.length
  ];
}

export const PODCAST_STANDARD_ITUNES_QUERIES = [
  "music podcast",
  "news podcast",
  "business podcast",
  "technology podcast",
  "education podcast",
  "science podcast",
  "history podcast",
  "comedy podcast",
  "sports podcast",
  "health podcast",
  "politics podcast",
  "culture podcast",
  "gaming podcast",
  "finance podcast",
  "language learning podcast",
  "motivation podcast",
  "parenting podcast",
  "books podcast",
  "arts podcast",
  "religion podcast",
  "fitness podcast",
  "society podcast",
  "true crime podcast",
  "documentary podcast",
  "interview podcast",
  "startup podcast",
  "AI podcast",
  "medical podcast",
  "travel podcast",
  "food podcast",
  "film podcast",
  "philosophy podcast",
  "psychology podcast",
  "economics podcast",
  "law podcast",
  "environment podcast",
  "space podcast",
  "college podcast",
  "nonprofit podcast",
  "government podcast",
] as const;

export const PODCAST_MATURE_ITUNES_QUERIES = [
  "explicit comedy podcast",
  "adult talk podcast",
  "dating podcast explicit",
  "relationship podcast explicit",
  "sex education podcast",
  "mature comedy podcast",
  "after dark podcast",
  "confessions podcast",
  "erotic fiction podcast",
  "adult lifestyle podcast",
  "explicit interview podcast",
  "late night podcast explicit",
  "mature storytelling podcast",
  "18+ podcast",
  "explicit humor podcast",
] as const;

export const PODCAST_STANDARD_INDEX_QUERIES = [
  "news",
  "business",
  "technology",
  "education",
  "science",
  "history",
  "comedy",
  "music",
  "health",
  "sports",
  "politics",
  "culture",
  "gaming",
  "finance",
  "motivation",
  "language",
  "parenting",
  "books",
  "arts",
  "religion",
  "society",
  "documentary",
  "interview",
  "startup",
  "medical",
  "travel",
  "food",
  "film",
  "philosophy",
  "psychology",
] as const;

export const PODCAST_MATURE_INDEX_QUERIES = [
  "explicit",
  "adult",
  "dating",
  "relationship",
  "sex",
  "mature comedy",
  "after dark",
  "confessions",
  "erotic",
  "18+",
  "late night",
  "adult talk",
] as const;

function defaultRegistry(): PodcastSourceRegistryEntry[] {
  return [
    {
      source_key: "itunes:standard",
      source_name: "iTunes Search (Standard)",
      source_kind: "itunes",
      catalog: "standard",
      is_enabled: true,
      is_exhausted: false,
      checkpoint_cursor: "0:0:0",
      query_index: 0,
      language_index: 0,
      feeds_accepted: 0,
      feeds_rejected: 0,
      last_successful_import: null,
      last_failed_import: null,
      failure_count: 0,
    },
    {
      source_key: "itunes:mature",
      source_name: "iTunes Search (Mature)",
      source_kind: "itunes",
      catalog: "mature",
      is_enabled: true,
      is_exhausted: false,
      checkpoint_cursor: "0:0:0",
      query_index: 0,
      language_index: 0,
      feeds_accepted: 0,
      feeds_rejected: 0,
      last_successful_import: null,
      last_failed_import: null,
      failure_count: 0,
    },
    {
      source_key: "podcast_index:byterm:standard",
      source_name: "Podcast Index Search (Standard)",
      source_kind: "podcast_index",
      catalog: "standard",
      is_enabled: true,
      is_exhausted: false,
      checkpoint_cursor: "0:0:0",
      query_index: 0,
      language_index: 0,
      feeds_accepted: 0,
      feeds_rejected: 0,
      last_successful_import: null,
      last_failed_import: null,
      failure_count: 0,
    },
    {
      source_key: "podcast_index:byterm:mature",
      source_name: "Podcast Index Search (Mature)",
      source_kind: "podcast_index",
      catalog: "mature",
      is_enabled: true,
      is_exhausted: false,
      checkpoint_cursor: "0:0:0",
      query_index: 0,
      language_index: 0,
      feeds_accepted: 0,
      feeds_rejected: 0,
      last_successful_import: null,
      last_failed_import: null,
      failure_count: 0,
    },
    {
      source_key: "podcast_index:recent:standard",
      source_name: "Podcast Index Recent (Standard)",
      source_kind: "podcast_index",
      catalog: "standard",
      is_enabled: true,
      is_exhausted: false,
      checkpoint_cursor: "0",
      query_index: 0,
      language_index: 0,
      feeds_accepted: 0,
      feeds_rejected: 0,
      last_successful_import: null,
      last_failed_import: null,
      failure_count: 0,
    },
    {
      source_key: "podcast_index:recent:mature",
      source_name: "Podcast Index Recent (Mature)",
      source_kind: "podcast_index",
      catalog: "mature",
      is_enabled: true,
      is_exhausted: false,
      checkpoint_cursor: "0",
      query_index: 0,
      language_index: 0,
      feeds_accepted: 0,
      feeds_rejected: 0,
      last_successful_import: null,
      last_failed_import: null,
      failure_count: 0,
    },
  ];
}

function registryPath(adminRoot = process.cwd()) {
  return path.join(adminRoot, "data", PODCAST_MASS_EXPANSION_DATA_DIR, "source-registry.json");
}

export function loadPodcastSourceRegistry(adminRoot = process.cwd()) {
  const filePath = registryPath(adminRoot);
  if (!fs.existsSync(filePath)) {
    const defaults = defaultRegistry();
    savePodcastSourceRegistry(defaults, adminRoot);
    return defaults;
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    sources?: PodcastSourceRegistryEntry[];
  };
  return parsed.sources?.length ? parsed.sources : defaultRegistry();
}

export function savePodcastSourceRegistry(
  sources: PodcastSourceRegistryEntry[],
  adminRoot = process.cwd()
) {
  const filePath = registryPath(adminRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ sources }, null, 2)}\n`, "utf8");
}

export function updatePodcastSourceRegistryEntry(
  sourceKey: string,
  patch: Partial<PodcastSourceRegistryEntry>,
  adminRoot = process.cwd()
) {
  const sources = loadPodcastSourceRegistry(adminRoot);
  const index = sources.findIndex((entry) => entry.source_key === sourceKey);
  if (index < 0) return null;
  sources[index] = { ...sources[index], ...patch };
  savePodcastSourceRegistry(sources, adminRoot);
  return sources[index];
}

export function pickNextPodcastSource(
  sources: PodcastSourceRegistryEntry[],
  catalog: PodcastCatalogKind,
  batchNumber: number
): PodcastSourceRegistryEntry | null {
  const eligible = sources.filter(
    (entry) =>
      entry.is_enabled &&
      !entry.is_exhausted &&
      entry.catalog === catalog
  );

  if (eligible.length === 0) return null;

  eligible.sort((left, right) => {
    if (left.feeds_accepted !== right.feeds_accepted) {
      return left.feeds_accepted - right.feeds_accepted;
    }
    return left.failure_count - right.failure_count;
  });

  return eligible[batchNumber % eligible.length] ?? eligible[0];
}

export function parseSourceCursor(cursor: string) {
  const [queryIndex = "0", languageIndex = "0", offset = "0"] = cursor.split(":");
  return {
    queryIndex: Math.max(0, Number(queryIndex) || 0),
    languageIndex: Math.max(0, Number(languageIndex) || 0),
    offset: Math.max(0, Number(offset) || 0),
  };
}

export function formatSourceCursor(parts: {
  queryIndex: number;
  languageIndex: number;
  offset: number;
}) {
  return `${parts.queryIndex}:${parts.languageIndex}:${parts.offset}`;
}

export function hasPodcastIndexCredentials() {
  return Boolean(
    String(process.env.PODCASTINDEX_API_KEY || "").trim() &&
      String(process.env.PODCASTINDEX_API_SECRET || "").trim()
  );
}

export function listEnabledPodcastSources(adminRoot = process.cwd()) {
  const sources = loadPodcastSourceRegistry(adminRoot);
  return sources.filter((entry) => {
    if (!entry.is_enabled || entry.is_exhausted) return false;
    if (entry.source_kind === "podcast_index" && !hasPodcastIndexCredentials()) {
      return false;
    }
    return true;
  });
}

export function isCatalogSourceExhausted(
  sources: PodcastSourceRegistryEntry[],
  catalog: PodcastCatalogKind
) {
  const catalogSources = sources.filter((entry) => entry.catalog === catalog);
  if (catalogSources.length === 0) return true;
  return catalogSources.every((entry) => !entry.is_enabled || entry.is_exhausted);
}
