import type { HiddenTunesPodcastShow } from "../podcastCatalogApi";

/**
 * Client-side quality_score (0–100) until backend index lands.
 */
export function computePodcastQualityScore(show: HiddenTunesPodcastShow): number {
  let score = 40;

  const artwork = String(show.artwork_url || "").trim();
  if (artwork.startsWith("https://")) score += 16;
  else if (artwork) score += 6;
  else score -= 10;

  const title = String(show.title || "").trim();
  if (title.length >= 4) score += 6;

  const description = String(show.description || "").trim();
  if (description.length >= 40) score += 8;
  else if (description.length > 0) score += 3;

  const host = String(show.host_name || "").trim();
  if (host.length > 0) score += 5;

  const categories = show.categories?.length || 0;
  if (categories > 0) score += 5;
  if (show.primary_category) score += 3;

  const episodes = Math.max(0, Number(show.episode_count) || 0);
  score += Math.min(16, Math.log10(episodes + 1) * 5.5);

  if (show.is_featured) score += 8;
  if (show.is_exclusive) score += 4;

  const language = String(show.language || "").trim();
  if (language) score += 3;

  const lastPublished = String(show.last_published_at || "").trim();
  if (lastPublished) {
    const publishedMs = Date.parse(lastPublished);
    if (Number.isFinite(publishedMs)) {
      const daysAgo = (Date.now() - publishedMs) / (1000 * 60 * 60 * 24);
      if (daysAgo <= 14) score += 12;
      else if (daysAgo <= 45) score += 8;
      else if (daysAgo <= 120) score += 4;
      else score -= 4;
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function enrichShowWithQuality(show: HiddenTunesPodcastShow): HiddenTunesPodcastShow {
  return {
    ...show,
    quality_score: computePodcastQualityScore(show),
  };
}

export function sortShowsByQuality(shows: HiddenTunesPodcastShow[]) {
  return [...shows].sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));
}

export function sortShowsByEpisodeCount(shows: HiddenTunesPodcastShow[]) {
  return [...shows].sort(
    (a, b) => (b.episode_count || 0) - (a.episode_count || 0)
  );
}

export function sortShowsByRecency(shows: HiddenTunesPodcastShow[]) {
  return [...shows].sort((a, b) => {
    const aMs = Date.parse(String(a.last_published_at || "")) || 0;
    const bMs = Date.parse(String(b.last_published_at || "")) || 0;
    return bMs - aMs;
  });
}
