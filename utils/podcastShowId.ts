import { getPodcastCategory } from "../constants/podcastCategories";
import { isItunesPodcastShowId } from "../services/podcast/podcastItunesRssSource";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPodcastCategoryId(id: string) {
  return Boolean(getPodcastCategory(String(id || "").trim()));
}

export function isValidPodcastShowId(id: string) {
  const safe = String(id || "").trim();
  if (!safe || safe.length < 3) return false;
  if (isPodcastCategoryId(safe)) return false;

  if (isItunesPodcastShowId(safe)) {
    return /^itunes-\d+$/.test(safe);
  }

  if (/^\d{4,}$/.test(safe)) return true;
  if (UUID_PATTERN.test(safe)) return true;

  return false;
}
