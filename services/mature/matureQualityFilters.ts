import { DISCOVERY_QUALITY_RANK_CAP } from "../../constants/discoveryPerformanceBudget";
import type { HiddenTunesPodcastShow } from "../podcastCatalogApi";
import type { HiddenTunesStation } from "../../types/radio";
import {
  MATURE_ABANDONED_PODCAST_DAYS,
  MATURE_PODCAST_MIN_QUALITY,
  MATURE_RADIO_MIN_QUALITY,
} from "../../constants/matureDiscoveryFoundation";
import { enrichShowWithQuality, sortShowsByQuality } from "../podcast/podcastQualityScore";
import { isItunesPodcastShowId } from "../podcast/podcastItunesRssSource";
import { sortStationsByQuality } from "../radio/radioQualityScore";
import {
  logMaturePodcastCategoryAudit,
  logMatureRadioCategoryAudit,
  type MaturePodcastAuditCounts,
  type MatureRadioAuditCounts,
} from "../../utils/matureDiscoveryDiagnostics";

const SPAM_KEYWORD_PATTERN =
  /\b(free download|click here|subscribe now|best podcast ever|#1 podcast|crypto|nft|viagra|casino|betting)\b/i;

const KEYWORD_STUFFING_PATTERN = /(\b\w+\b)(?:\s+\1){3,}/i;

const DEAD_FEED_PROVIDER_PATTERN =
  /\b(test feed|placeholder|lorem ipsum|sample podcast|demo feed)\b/i;

function normalizeLookup(value: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isSpamPodcastText(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return false;
  return SPAM_KEYWORD_PATTERN.test(text) || KEYWORD_STUFFING_PATTERN.test(text);
}

export function isLowQualityPodcastShow(show: HiddenTunesPodcastShow) {
  const title = String(show.title || "").trim();
  if (!title || title.length < 2) return true;

  const combined = `${title} ${show.description || ""} ${show.host_name || ""}`;
  if (DEAD_FEED_PROVIDER_PATTERN.test(combined)) return true;
  if (isSpamPodcastText(combined)) return true;

  const episodes = Math.max(0, Number(show.episode_count) || 0);
  const lastPublished = String(show.last_published_at || "").trim();
  const publishedMs = lastPublished ? Date.parse(lastPublished) : NaN;
  const daysSincePublish = Number.isFinite(publishedMs)
    ? (Date.now() - publishedMs) / (1000 * 60 * 60 * 24)
    : null;

  if (episodes === 0 && !lastPublished) return true;
  if (daysSincePublish !== null && daysSincePublish > MATURE_ABANDONED_PODCAST_DAYS && episodes < 3) {
    return true;
  }

  return false;
}

export function isMaturePlayableShow(show: HiddenTunesPodcastShow) {
  if (isLowQualityPodcastShow(show)) return false;
  const episodes = Math.max(0, Number(show.episode_count) || 0);
  if (episodes <= 0) return false;

  if (isItunesPodcastShowId(show.id)) {
    const artwork = String(show.artwork_url || "").trim();
    return artwork.startsWith("https://") || episodes >= 1;
  }

  return Boolean(String(show.last_published_at || "").trim());
}

export function scoreMaturePodcastShow(show: HiddenTunesPodcastShow) {
  const enriched = enrichShowWithQuality(show);
  let score = enriched.quality_score || 0;

  const episodes = Math.max(0, Number(show.episode_count) || 0);
  if (episodes >= 1) score += 14;
  if (episodes >= 3) score += 18;
  if (episodes >= 10) score += 10;
  if (episodes >= 25) score += 6;

  const artwork = String(show.artwork_url || "").trim();
  if (!artwork) score -= 12;
  else if (!artwork.startsWith("https://")) score -= 4;
  else score += 8;

  const host = String(show.host_name || "").trim();
  if (!host) score -= 6;
  else score += 6;

  const description = String(show.description || "").trim();
  if (!description) score -= 5;
  else if (description.length >= 80) score += 8;
  else score += 4;

  if (!String(show.language || "").trim()) score -= 2;
  else score += 2;

  const publishedMs = show.last_published_at ? Date.parse(show.last_published_at) : NaN;
  if (Number.isFinite(publishedMs)) {
    const days = (Date.now() - publishedMs) / (1000 * 60 * 60 * 24);
    if (days <= 14) score += 18;
    else if (days <= 30) score += 14;
    else if (days <= 90) score += 10;
    else if (days <= 180) score += 5;
    else if (days > MATURE_ABANDONED_PODCAST_DAYS) score -= 12;
  } else if (episodes <= 0) {
    score -= 20;
  }

  if (isSpamPodcastText(`${show.title} ${show.description || ""}`)) score -= 25;

  return Math.max(0, Math.min(100, score));
}

export function passesMaturePodcastQualityGate(
  show: HiddenTunesPodcastShow,
  minQuality = MATURE_PODCAST_MIN_QUALITY
) {
  if (isLowQualityPodcastShow(show)) return false;
  return scoreMaturePodcastShow(show) >= minQuality;
}

export function dedupeMaturePodcastShows(shows: HiddenTunesPodcastShow[]) {
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const seenTitles = new Set<string>();
  const deduped: HiddenTunesPodcastShow[] = [];

  for (const show of shows) {
    if (seenIds.has(show.id)) continue;

    const slugKey = normalizeLookup(show.slug || "");
    if (slugKey && seenSlugs.has(slugKey)) continue;

    const titleKey = normalizeLookup(show.title || "");
    if (titleKey && seenTitles.has(titleKey)) continue;

    seenIds.add(show.id);
    if (slugKey) seenSlugs.add(slugKey);
    if (titleKey) seenTitles.add(titleKey);
    deduped.push(show);
  }

  return deduped;
}

export function filterAndRankMaturePodcastShows(
  shows: HiddenTunesPodcastShow[],
  options?: {
    minQuality?: number;
    categoryId?: string;
    source?: string;
    queryTermsUsed?: string[];
    finalDisplayedCount?: number;
  }
) {
  const minQuality = options?.minQuality ?? MATURE_PODCAST_MIN_QUALITY;
  const capped = shows.slice(0, DISCOVERY_QUALITY_RANK_CAP);
  const deduped = dedupeMaturePodcastShows(capped);
  const showsWithEpisodes = deduped.filter(
    (show) => Math.max(0, Number(show.episode_count) || 0) > 0
  );
  const qualityPassed = deduped.filter((show) => passesMaturePodcastQualityGate(show, minQuality));
  const playableShows = qualityPassed.filter(isMaturePlayableShow);

  if (options?.categoryId) {
    const audit: MaturePodcastAuditCounts = {
      categoryId: options.categoryId,
      queryTermsUsed: options.queryTermsUsed,
      raw: shows.length,
      afterDedupe: deduped.length,
      showsWithEpisodes: showsWithEpisodes.length,
      afterQuality: qualityPassed.length,
      playableShows: playableShows.length,
      finalDisplayedCount: options.finalDisplayedCount ?? playableShows.length,
      first20Titles: playableShows.slice(0, 20).map((show) => String(show.title || "").trim()),
      source: options.source,
    };
    logMaturePodcastCategoryAudit(audit);
  }

  const ranked = qualityPassed
    .map((show) => ({
      ...enrichShowWithQuality(show),
      quality_score: scoreMaturePodcastShow(show),
      is_mature: true,
      content_rating:
        show.content_rating && show.content_rating !== "clean"
          ? show.content_rating
          : ("adult" as const),
    }))
    .sort((left, right) => {
      const leftPlayable = isMaturePlayableShow(left) ? 1 : 0;
      const rightPlayable = isMaturePlayableShow(right) ? 1 : 0;
      if (rightPlayable !== leftPlayable) return rightPlayable - leftPlayable;
      return (right.quality_score || 0) - (left.quality_score || 0);
    });

  return sortShowsByQuality(ranked);
}

export function passesMatureRadioQualityGate(
  station: HiddenTunesStation,
  minQuality = MATURE_RADIO_MIN_QUALITY
) {
  const name = String(station.name || "").trim();
  if (!name || name.length < 2) return false;
  if (isSpamPodcastText(name)) return false;
  const streamUrl = String(station.streamUrl || "").trim();
  if (!streamUrl.startsWith("https://")) return false;
  return (station.quality_score || 0) >= minQuality;
}

export function dedupeMatureRadioStations(stations: HiddenTunesStation[]) {
  const seenIds = new Set<string>();
  const seenStreams = new Set<string>();
  const deduped: HiddenTunesStation[] = [];

  for (const station of stations) {
    if (seenIds.has(station.id)) continue;
    const streamKey = String(station.streamUrl || "").trim().toLowerCase();
    if (streamKey && seenStreams.has(streamKey)) continue;
    seenIds.add(station.id);
    if (streamKey) seenStreams.add(streamKey);
    deduped.push(station);
  }

  return deduped;
}

export function filterAndRankMatureRadioStations(
  stations: HiddenTunesStation[],
  options?: { minQuality?: number; categoryId?: string }
) {
  const minQuality = options?.minQuality ?? MATURE_RADIO_MIN_QUALITY;
  const capped = stations.slice(0, DISCOVERY_QUALITY_RANK_CAP);
  const deduped = dedupeMatureRadioStations(capped);
  const playableStreams = deduped.filter((station) =>
    String(station.streamUrl || "").trim().startsWith("https://")
  );
  const httpsStreams = playableStreams.length;
  const filtered = playableStreams
    .filter((station) => passesMatureRadioQualityGate(station, minQuality))
    .map((station) => ({
      ...station,
      is_mature: true,
      content_rating:
        station.content_rating && station.content_rating !== "clean"
          ? station.content_rating
          : ("adult" as const),
    }));

  if (options?.categoryId) {
    const audit: MatureRadioAuditCounts = {
      categoryId: options.categoryId,
      raw: stations.length,
      afterDedupe: deduped.length,
      playableStreams: playableStreams.length,
      httpsStreams,
      afterQuality: filtered.length,
      finalDisplayedCount: filtered.length,
      first20StationNames: filtered.slice(0, 20).map((station) => String(station.name || "").trim()),
    };
    logMatureRadioCategoryAudit(audit);
  }

  return sortStationsByQuality(filtered);
}
