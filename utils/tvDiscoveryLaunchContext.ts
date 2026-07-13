import type { HiddenTunesTvVideo } from "@/services/tvCatalogApi";
import type { TvDiscoveryLaunchContext, TvContextType } from "@/types/tvDiscovery";

type BuildTvDiscoveryLaunchContextInput = {
  query?: string;
  laneId?: string;
  laneTitle?: string;
  categorySlug?: string;
  categoryTitle?: string;
  browseReturnPath?: string;
};

function clean(value: unknown, max = 200) {
  return String(value || "").trim().slice(0, max);
}

export function buildTvDiscoveryLaunchContext(
  video: HiddenTunesTvVideo,
  input: BuildTvDiscoveryLaunchContextInput = {}
): TvDiscoveryLaunchContext {
  const category =
    clean(input.categoryTitle) ||
    clean(video.category) ||
    clean(video.categories?.[0]) ||
    "";
  const country = clean(video.country);
  const language = clean(video.language);
  const region = clean(video.categories?.find((entry) => /africa|europe|americas|asia/i.test(entry)));
  const browseReturnPath = input.browseReturnPath || "/youtube-feed";
  const query = clean(input.query);
  const metadataMode = video.metadataMode;

  if (query.length >= 2) {
    return {
      contextType: "tv-search",
      contextId: query.toLowerCase(),
      contextTitle: `Search: ${query}`,
      originalSearchQuery: query,
      originalCategory: category,
      originalCountry: country,
      originalLanguage: language,
      originalRegion: region,
      browseReturnPath,
      metadataMode,
    };
  }

  if (input.categorySlug && input.categoryTitle) {
    return {
      contextType: "tv-category",
      contextId: input.categorySlug,
      contextTitle: input.categoryTitle,
      originalCategory: input.categoryTitle,
      originalCountry: country,
      originalLanguage: language,
      originalRegion: region,
      browseReturnPath,
      metadataMode,
    };
  }

  if (input.laneId) {
    let contextType: TvContextType = "tv-category";
    if (input.laneId === "featured") contextType = "tv-featured";
    else if (input.laneId === "recent") contextType = "tv-recent";

    return {
      contextType,
      contextId: input.laneId,
      contextTitle: clean(input.laneTitle) || "Hidden Tunes TV",
      originalCategory: category || clean(input.laneTitle),
      originalCountry: country,
      originalLanguage: language,
      originalRegion: region,
      browseReturnPath,
      metadataMode,
    };
  }

  return {
    contextType: "tv-global",
    contextId: "tv-browse",
    contextTitle: "Hidden Tunes TV",
    originalCategory: category,
    originalCountry: country,
    originalLanguage: language,
    originalRegion: region,
    browseReturnPath,
    metadataMode,
  };
}
