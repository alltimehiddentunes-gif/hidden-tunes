import { MATURE_PODCAST_SEEDS, type MaturePodcastSeed } from "../data/podcastSeeds";
import type { HiddenTunesPodcastShow } from "./podcastCatalogApi";
import { writeCachedPodcastShows } from "../utils/podcastDiscoveryCache";
import {
  MATURE_PODCAST_CATEGORY_DEFINITIONS,
  type MaturePodcastCategory,
} from "../utils/maturePodcastCategories";
import {
  normalizeCategoryId,
  seedCategoryMatches,
} from "../utils/podcastCategoryMatching";
import { PODCAST_MAX_SEARCH_RESULTS } from "../utils/podcastPerformanceLimits";

const EXPLICIT_SEARCH_ALIASES = ["explicit", "e", "nsfw", "18+", "adult", "mature"];

const SEED_HAYSTACKS = new Map(
  MATURE_PODCAST_SEEDS.map((seed) => [seed.id, buildSeedHaystack(seed)])
);

function buildSeedHaystack(seed: MaturePodcastSeed) {
  return [
    seed.title,
    seed.publisher,
    seed.description,
    seed.matureLevel,
    seed.isExplicit ? "explicit" : "",
    ...seed.categories,
    ...seed.keywords,
    ...EXPLICIT_SEARCH_ALIASES.filter((alias) =>
      seed.keywords.some((keyword) => keyword.includes(alias))
    ),
  ]
    .join(" ")
    .toLowerCase();
}

function matureSeedToShow(seed: MaturePodcastSeed): HiddenTunesPodcastShow {
  const primaryCategory =
    seed.categories.find((category) => category !== "all-mature") ||
    seed.categories[0];

  return {
    id: seed.id,
    slug: normalizeCategoryId(seed.id),
    title: seed.title,
    description: seed.description,
    artwork_url: seed.artworkUrl,
    host_name: seed.publisher,
    primary_category: primaryCategory,
    categories: [...seed.categories],
    is_exclusive: true,
    sourceName: "Hidden Tunes",
  };
}

function getActiveMatureSeeds(matureEnabled: boolean) {
  if (!matureEnabled) return [];
  return MATURE_PODCAST_SEEDS;
}

export function getMatureShowsByCategory(
  categoryId: string,
  matureEnabled: boolean
) {
  const safeId = normalizeCategoryId(categoryId);
  const seeds = getActiveMatureSeeds(matureEnabled).filter((seed) =>
    seedCategoryMatches(seed.categories, safeId)
  );

  const shows = seeds.map(matureSeedToShow);

  if (shows.length > 0) {
    writeCachedPodcastShows(`mature:${safeId}`, shows);
  }

  return shows;
}

export function getAllMatureShows(matureEnabled: boolean) {
  return getMatureShowsByCategory("all-mature", matureEnabled);
}

export type MaturePodcastCategoryWithCount = MaturePodcastCategory & {
  showCount: number;
};

export function getVisibleMatureCategories(matureEnabled: boolean) {
  if (!matureEnabled) {
    logMaturePodcastCategoryCounts([], false);
    return [];
  }

  const counts = new Map<string, number>(
    MATURE_PODCAST_CATEGORY_DEFINITIONS.map((category) => [category.id, 0])
  );

  for (const seed of MATURE_PODCAST_SEEDS) {
    for (const category of MATURE_PODCAST_CATEGORY_DEFINITIONS) {
      if (seedCategoryMatches(seed.categories, category.id)) {
        counts.set(category.id, (counts.get(category.id) || 0) + 1);
      }
    }
  }

  const visible = MATURE_PODCAST_CATEGORY_DEFINITIONS.map((category) => ({
    ...category,
    showCount: counts.get(category.id) || 0,
  })).filter((category) => category.showCount > 0);

  logMaturePodcastCategoryCounts(visible, matureEnabled);

  return visible;
}

export function logMaturePodcastCategoryCounts(
  categories: MaturePodcastCategoryWithCount[],
  matureEnabled: boolean
) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;

  console.log(
    "mature_podcast_category_counts",
    categories.map((category) => ({
      id: category.id,
      title: category.title,
      showCount: category.showCount,
      matureEnabled,
    }))
  );
}

function haystackForSeed(seed: MaturePodcastSeed) {
  return SEED_HAYSTACKS.get(seed.id) || buildSeedHaystack(seed);
}

export function searchMaturePodcastSeeds(
  query: string,
  matureEnabled: boolean
) {
  if (!matureEnabled) return [];

  const tokens = String(query || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (!tokens.length) return [];

  const matches = MATURE_PODCAST_SEEDS.filter((seed) => {
    const haystack = haystackForSeed(seed);
    return tokens.every((token) => haystack.includes(token));
  }).slice(0, PODCAST_MAX_SEARCH_RESULTS);

  const shows = matches.map(matureSeedToShow);

  if (shows.length > 0) {
    writeCachedPodcastShows(`mature:search:${tokens.join("-")}`, shows);
  }

  return shows;
}

export function mergePodcastShowResults(
  primary: HiddenTunesPodcastShow[],
  mature: HiddenTunesPodcastShow[]
) {
  const seen = new Set(primary.map((show) => show.id));
  const merged = [...primary];

  for (const show of mature) {
    if (seen.has(show.id)) continue;
    seen.add(show.id);
    merged.push(show);
  }

  return merged.slice(0, PODCAST_MAX_SEARCH_RESULTS);
}

export function getMaturePodcastSeedById(showId: string) {
  return MATURE_PODCAST_SEEDS.find((seed) => seed.id === showId) || null;
}

export function getMaturePodcastShowById(
  showId: string,
  matureEnabled: boolean
) {
  const seed = getMaturePodcastSeedById(showId);
  if (!seed || !matureEnabled) return null;
  return matureSeedToShow(seed);
}
