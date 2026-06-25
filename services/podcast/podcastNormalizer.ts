import type { HiddenTunesPodcastShow } from "../podcastCatalogApi";
import type { PodcastShowListItem } from "../../types/podcastDiscovery";
import { sanitizePodcastDiscoveryText } from "../../utils/openHiddenTunesPodcast";
import { getUserFacingPodcastSubtitle } from "../ui/displayMetadata";

export function toPodcastShowListItem(show: HiddenTunesPodcastShow): PodcastShowListItem {
  const publisher = show.host_name?.trim() || undefined;
  const category = show.primary_category || show.categories?.[0] || undefined;
  const episodeLabel =
    typeof show.episode_count === "number" && show.episode_count > 0
      ? `${show.episode_count} episode${show.episode_count === 1 ? "" : "s"}`
      : undefined;
  const latestEpisodeDate = show.last_published_at || undefined;

  let qualityLabel: string | undefined;
  const score = show.quality_score || 0;
  if (score >= 75) qualityLabel = "Premium pick";
  else if (score >= 55) qualityLabel = "Quality show";

  return {
    id: show.id,
    title: sanitizePodcastDiscoveryText(show.title) || show.title,
    subtitle: getUserFacingPodcastSubtitle(null, show.title),
    artworkUrl: show.artwork_url,
    publisher,
    category,
    episodeCount: show.episode_count,
    episodeLabel,
    language: show.language,
    latestEpisodeDate,
    qualityScore: show.quality_score,
    qualityLabel,
    is_mature: show.is_mature,
    content_rating: show.content_rating,
  };
}
