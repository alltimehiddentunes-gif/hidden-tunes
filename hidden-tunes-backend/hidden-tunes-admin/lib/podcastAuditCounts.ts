import {
  isPublicVerifiedMaturePodcastShow,
  isPublicVerifiedPodcastEpisode,
  isPublicVerifiedPodcastShow,
  PODCAST_RELIABILITY_THRESHOLD,
} from "@/lib/podcastVerification";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CountQuery = any;

async function exactCount(table: string, apply?: (query: CountQuery) => CountQuery) {
  let query: CountQuery = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  if (apply) query = apply(query);
  const { count, error } = await query;
  if (error) {
    if (/does not exist|relation|column/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return count ?? 0;
}

async function countAll(
  entries: Array<{ key: string; table: string; apply?: (query: CountQuery) => CountQuery }>
) {
  const result: Record<string, number | null> = {};
  for (const entry of entries) {
    result[entry.key] = await exactCount(entry.table, entry.apply);
  }
  return result;
}

async function fetchAllRows<T extends Record<string, unknown>>(
  table: string,
  select: string,
  pageSize = 1000
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);

    if (error) {
      if (/column/i.test(error.message)) return { rows, missing_columns: true };
      throw new Error(error.message);
    }

    const batch = (data || []) as unknown as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return { rows, missing_columns: false };
}

function reliabilityBucket(score: number | null | undefined) {
  const value = Number(score ?? 0);
  if (value >= 90) return "90-100";
  if (value >= 75) return "75-89";
  if (value >= PODCAST_RELIABILITY_THRESHOLD) return "60-74";
  if (value >= 30) return "30-59";
  return "0-29";
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] || 0) + 1;
}

export async function collectPodcastAuditCounts() {
  const counts = await countAll([
    { key: "totalShows", table: "podcast_shows" },
    { key: "totalEpisodes", table: "podcast_episodes" },
    { key: "approvedShows", table: "podcast_shows", apply: (q) => q.eq("status", "approved") },
    { key: "activeShows", table: "podcast_shows", apply: (q) => q.eq("is_active", true) },
    { key: "verifiedShows", table: "podcast_shows", apply: (q) => q.eq("is_verified", true) },
    {
      key: "feedsNeverChecked",
      table: "podcast_shows",
      apply: (q) => q.is("last_health_checked_at", null),
    },
    {
      key: "episodesNeverChecked",
      table: "podcast_episodes",
      apply: (q) => q.is("last_health_checked_at", null),
    },
    { key: "missingAudioUrls", table: "podcast_episodes", apply: (q) => q.is("audio_url", null) },
    {
      key: "quarantinedShows",
      table: "podcast_shows",
      apply: (q) => q.not("quarantined_at", "is", null),
    },
    {
      key: "quarantinedEpisodes",
      table: "podcast_episodes",
      apply: (q) => q.not("quarantined_at", "is", null),
    },
    {
      key: "uncheckedEpisodes",
      table: "podcast_episodes",
      apply: (q) => q.eq("playback_status", "unchecked"),
    },
    {
      key: "failedEpisodes",
      table: "podcast_episodes",
      apply: (q) => q.eq("playback_status", "failed"),
    },
    {
      key: "playableEpisodes",
      table: "podcast_episodes",
      apply: (q) =>
        q.eq("status", "approved").eq("is_active", true).eq("playback_status", "playable"),
    },
    {
      key: "verifiedPlayableEpisodes",
      table: "podcast_episodes",
      apply: (q) =>
        q
          .eq("status", "approved")
          .eq("is_active", true)
          .eq("playback_status", "playable")
          .eq("is_verified", true)
          .not("last_play_verified_at", "is", null)
          .is("quarantined_at", null),
    },
    { key: "queuePending", table: "podcast_health_queue", apply: (q) => q.eq("status", "pending") },
    { key: "queueRunning", table: "podcast_health_queue", apply: (q) => q.eq("status", "running") },
    { key: "queueFailed", table: "podcast_health_queue", apply: (q) => q.eq("status", "failed") },
    { key: "quarantineRows", table: "podcast_quarantine" },
    { key: "matureShowsTotal", table: "podcast_shows", apply: (q) => q.eq("is_mature", true) },
    {
      key: "matureQuarantinedShows",
      table: "podcast_shows",
      apply: (q) => q.eq("is_mature", true).not("quarantined_at", "is", null),
    },
  ]);

  const totalShows = counts.totalShows;
  const totalEpisodes = counts.totalEpisodes;
  const approvedShows = counts.approvedShows;
  const activeShows = counts.activeShows;
  const verifiedShows = counts.verifiedShows;
  const feedsNeverChecked = counts.feedsNeverChecked;
  const episodesNeverChecked = counts.episodesNeverChecked;
  const missingAudioUrls = counts.missingAudioUrls;
  const quarantinedShows = counts.quarantinedShows;
  const quarantinedEpisodes = counts.quarantinedEpisodes;
  const uncheckedEpisodes = counts.uncheckedEpisodes;
  const failedEpisodes = counts.failedEpisodes;
  const playableEpisodes = counts.playableEpisodes;
  const verifiedPlayableEpisodes = counts.verifiedPlayableEpisodes;
  const queuePending = counts.queuePending;
  const queueRunning = counts.queueRunning;
  const queueFailed = counts.queueFailed;
  const quarantineRows = counts.quarantineRows;
  const matureShowsTotal = counts.matureShowsTotal;
  const matureQuarantinedShows = counts.matureQuarantinedShows;

  const showSelect =
    "id, slug, feed_url, source_type, source_id, status, feed_status, is_verified, is_active, is_mature, reliability_score, consecutive_failures, quarantined_at, primary_category, language, episode_count, last_health_checked_at";
  const episodeSelect =
    "id, show_id, audio_url, episode_guid, status, playback_status, is_verified, is_active, reliability_score, consecutive_failures, quarantined_at, last_health_checked_at, last_play_verified_at";

  const showFetch = await fetchAllRows<Record<string, unknown>>("podcast_shows", showSelect);
  let episodeFetch = await fetchAllRows<Record<string, unknown>>(
    "podcast_episodes",
    `${episodeSelect}, episode_guid`
  );
  if (episodeFetch.missing_columns) {
    episodeFetch = await fetchAllRows<Record<string, unknown>>("podcast_episodes", episodeSelect);
  }

  const showRows = showFetch.rows;
  const episodeRows = episodeFetch.rows;
  const showById = new Map(showRows.map((row) => [String(row.id), row]));

  let publicVerifiedShows = 0;
  let publicVerifiedMatureShows = 0;
  let publicVerifiedEpisodes = 0;
  let publicVerifiedMatureEpisodes = 0;

  const showReliability: Record<string, number> = {};
  const showFailures: Record<string, number> = {};
  const episodeReliability: Record<string, number> = {};
  const episodeFailures: Record<string, number> = {};
  const generalCategories: Record<string, number> = {};
  const matureCategories: Record<string, number> = {};
  const generalLanguages: Record<string, number> = {};
  const matureLanguages: Record<string, number> = {};

  const episodeCountsByShow = new Map<string, number>();
  for (const episode of episodeRows) {
    if (!isPublicVerifiedPodcastEpisode(episode)) continue;
    const showId = String(episode.show_id);
    episodeCountsByShow.set(showId, (episodeCountsByShow.get(showId) || 0) + 1);
  }

  for (const show of showRows) {
    increment(showReliability, reliabilityBucket(show.reliability_score as number));
    increment(showFailures, String(show.consecutive_failures ?? 0));
    const verifiedEpisodeCount = episodeCountsByShow.get(String(show.id)) || 0;
    const isPublic = isPublicVerifiedPodcastShow(show, { verifiedPlayableEpisodeCount: verifiedEpisodeCount });
    if (isPublic) publicVerifiedShows += 1;
    if (isPublicVerifiedMaturePodcastShow(show, { verifiedPlayableEpisodeCount: verifiedEpisodeCount })) {
      publicVerifiedMatureShows += 1;
      increment(
        matureCategories,
        String(show.primary_category || "(missing)").trim() || "(missing)"
      );
      increment(matureLanguages, String(show.language || "(missing)").trim() || "(missing)");
    } else if (show.is_mature !== true && isPublic) {
      increment(
        generalCategories,
        String(show.primary_category || "(missing)").trim() || "(missing)"
      );
      increment(generalLanguages, String(show.language || "(missing)").trim() || "(missing)");
    }
  }

  for (const episode of episodeRows) {
    increment(episodeReliability, reliabilityBucket(episode.reliability_score as number));
    increment(episodeFailures, String(episode.consecutive_failures ?? 0));
    if (!isPublicVerifiedPodcastEpisode(episode)) continue;
    publicVerifiedEpisodes += 1;
    const show = showById.get(String(episode.show_id));
    if (show?.is_mature === true) publicVerifiedMatureEpisodes += 1;
  }

  const feedUrlMap = new Map<string, number>();
  const sourceIdMap = new Map<string, number>();
  const guidMap = new Map<string, number>();
  let missingGuids = 0;

  for (const show of showRows) {
    const feed = String(show.feed_url || "").trim().toLowerCase();
    if (feed) feedUrlMap.set(feed, (feedUrlMap.get(feed) || 0) + 1);
    const sourceKey = `${show.source_type || ""}:${show.source_id || ""}`.trim();
    if (sourceKey !== ":") sourceIdMap.set(sourceKey, (sourceIdMap.get(sourceKey) || 0) + 1);
  }

  for (const episode of episodeRows) {
    const guid = String((episode as Record<string, unknown>).episode_guid || "").trim();
    if (!guid) missingGuids += 1;
    else {
      const key = `${episode.show_id}::${guid}`;
      guidMap.set(key, (guidMap.get(key) || 0) + 1);
    }
  }

  const duplicateFeedUrls = [...feedUrlMap.values()].filter((count) => count > 1).length;
  const duplicateSourceIds = [...sourceIdMap.values()].filter((count) => count > 1).length;
  const duplicateEpisodeGuids = [...guidMap.values()].filter((count) => count > 1).length;

  return {
    totals: {
      total_shows: totalShows,
      total_episodes: totalEpisodes,
      approved_shows: approvedShows,
      active_shows: activeShows,
      verified_shows: verifiedShows,
      public_verified_shows: publicVerifiedShows,
      playable_episodes: playableEpisodes,
      verified_playable_episodes: verifiedPlayableEpisodes,
      public_verified_playable_episodes: publicVerifiedEpisodes,
      unchecked_episodes: uncheckedEpisodes,
      failed_episodes: failedEpisodes,
      feeds_never_checked: feedsNeverChecked,
      episodes_never_checked: episodesNeverChecked,
      missing_audio_urls: missingAudioUrls,
      missing_guids: missingGuids,
      duplicate_feed_urls: duplicateFeedUrls,
      duplicate_source_ids: duplicateSourceIds,
      duplicate_episode_guids_within_show: duplicateEpisodeGuids,
    },
    general: {
      public_verified_shows: publicVerifiedShows - publicVerifiedMatureShows,
      public_verified_playable_episodes: publicVerifiedEpisodes - publicVerifiedMatureEpisodes,
      reliability_distribution: showReliability,
      episode_reliability_distribution: episodeReliability,
      consecutive_failure_distribution: showFailures,
      episode_consecutive_failure_distribution: episodeFailures,
      by_category: generalCategories,
      by_language: generalLanguages,
    },
    mature: {
      total_shows: matureShowsTotal,
      public_verified_shows: publicVerifiedMatureShows,
      public_verified_playable_episodes: publicVerifiedMatureEpisodes,
      quarantined_shows: matureQuarantinedShows,
      quarantined_episodes: episodeRows.filter(
        (episode) =>
          showById.get(String(episode.show_id))?.is_mature === true &&
          episode.quarantined_at
      ).length,
      failed_episodes: episodeRows.filter(
        (episode) =>
          showById.get(String(episode.show_id))?.is_mature === true &&
          episode.playback_status === "failed"
      ).length,
      by_category: matureCategories,
      by_language: matureLanguages,
    },
    quarantine: {
      quarantined_shows: quarantinedShows,
      quarantined_episodes: quarantinedEpisodes,
      quarantine_rows: quarantineRows,
    },
    queue: {
      pending: queuePending,
      running: queueRunning,
      failed: queueFailed,
    },
    distributions: {
      show_reliability: showReliability,
      episode_reliability: episodeReliability,
      show_consecutive_failures: showFailures,
      episode_consecutive_failures: episodeFailures,
    },
  };
}
