import { Alert } from "react-native";

import {
  formatPodcastEpisodeDuration,
  type HiddenTunesPodcastEpisode,
  type HiddenTunesPodcastShow,
} from "../services/podcastCatalogApi";
import { HIDDEN_TUNES_PODCASTS_LABEL } from "./launchPodcastCategories";

const HIDDEN_PROVIDER_PATTERN =
  /\b(podcast index|podcastindex|spotify|apple podcasts|google podcasts|anchor\.fm|buzzsprout|acast|libsyn|overcast|stitcher|iheart|rss feed|rss)\b/i;

export function sanitizePodcastDiscoveryText(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "";

  if (!HIDDEN_PROVIDER_PATTERN.test(text)) return text;

  return text
    .replace(HIDDEN_PROVIDER_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function podcastDiscoveryDisplayName(value?: string | null) {
  const cleaned = sanitizePodcastDiscoveryText(value);
  return cleaned || HIDDEN_TUNES_PODCASTS_LABEL;
}

export function podcastShowSubtitle(show: HiddenTunesPodcastShow) {
  const parts = [
    show.host_name,
    show.primary_category,
    typeof show.episode_count === "number" && show.episode_count > 0
      ? `${show.episode_count} episodes`
      : null,
  ]
    .map((part) => sanitizePodcastDiscoveryText(part))
    .filter(Boolean);

  return parts.join(" · ") || HIDDEN_TUNES_PODCASTS_LABEL;
}

export function podcastEpisodeSubtitle(episode: HiddenTunesPodcastEpisode) {
  let publishedLabel: string | null = null;
  if (episode.published_at) {
    const parsed = new Date(episode.published_at);
    if (!Number.isNaN(parsed.getTime())) {
      publishedLabel = parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    }
  }

  const parts = [
    formatPodcastEpisodeDuration(episode.duration_seconds),
    publishedLabel,
    typeof episode.episode_number === "number"
      ? `Episode ${episode.episode_number}`
      : null,
  ].filter(Boolean);

  return parts.join(" · ") || HIDDEN_TUNES_PODCASTS_LABEL;
}

export function openHiddenTunesPodcastEpisode(
  episode: HiddenTunesPodcastEpisode,
  showTitle?: string
) {
  Alert.alert(
    HIDDEN_TUNES_PODCASTS_LABEL,
    `In-app podcast playback is coming soon. Episode listings for ${podcastDiscoveryDisplayName(
      showTitle
    )} are ready now in Hidden Tunes Podcasts.`,
    [{ text: "OK", style: "default" }]
  );
}
