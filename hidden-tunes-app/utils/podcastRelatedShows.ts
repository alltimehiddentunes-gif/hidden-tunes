import type { HiddenTunesPodcastShow } from "../services/podcastCatalogApi";
import { listCachedPodcastShows } from "./podcastDiscoveryCache";
import { LAUNCH_PODCAST_CATEGORIES } from "./launchPodcastCategories";

const MATURE_CATEGORY_IDS = new Set([
  "adult-conversations",
  "dating",
  "breakup-recovery",
  "relationships",
]);

function normalizeToken(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function showMatureLevel(show: HiddenTunesPodcastShow) {
  const categories = [show.primary_category, ...show.categories]
    .map(normalizeToken)
    .filter(Boolean);

  const isMature = categories.some((category) =>
    [...MATURE_CATEGORY_IDS].some(
      (id) =>
        category.includes(id.replace(/-/g, " ")) ||
        LAUNCH_PODCAST_CATEGORIES.find((entry) => entry.id === id)?.title.toLowerCase() ===
          category
    )
  );

  return isMature ? "mature" : "general";
}

function showLanguageBucket(show: HiddenTunesPodcastShow) {
  const categories = [show.primary_category, ...show.categories]
    .map(normalizeToken)
    .join(" ");

  if (/\bafrican\b/.test(categories)) return "african";
  if (/\bfaith\b|spiritual/.test(categories)) return "faith";
  return "general";
}

function scoreRelatedShow(
  current: HiddenTunesPodcastShow,
  candidate: HiddenTunesPodcastShow
) {
  if (candidate.id === current.id) return -1;

  let score = 0;

  const currentPublisher = normalizeToken(current.host_name);
  const candidatePublisher = normalizeToken(candidate.host_name);
  if (currentPublisher && currentPublisher === candidatePublisher) {
    score += 40;
  }

  const currentCategories = new Set(
    [current.primary_category, ...current.categories].map(normalizeToken).filter(Boolean)
  );
  const candidateCategories = [candidate.primary_category, ...candidate.categories]
    .map(normalizeToken)
    .filter(Boolean);

  for (const category of candidateCategories) {
    if (currentCategories.has(category)) score += 18;
  }

  if (showMatureLevel(current) === showMatureLevel(candidate)) {
    score += 12;
  }

  if (showLanguageBucket(current) === showLanguageBucket(candidate)) {
    score += 10;
  }

  if (candidate.is_featured) score += 4;
  if (candidate.is_exclusive) score += 2;

  return score;
}

export function getRelatedPodcastShows(
  currentShow: HiddenTunesPodcastShow,
  limit = 5
) {
  const pool = listCachedPodcastShows().filter((show) => show.id !== currentShow.id);

  return pool
    .map((show) => ({ show, score: scoreRelatedShow(currentShow, show) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.show);
}
