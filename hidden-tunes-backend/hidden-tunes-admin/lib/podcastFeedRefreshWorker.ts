import { ingestPodcastFeed } from "@/lib/podcastRssIngest";
import { PODCAST_EXPANSION_MAX_EPISODES_PER_FEED } from "@/lib/podcastExpansionConstants";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type PodcastFeedRefreshOptions = {
  limit?: number;
  stale_hours?: number;
  dry_run?: boolean;
  max_episodes_per_feed?: number;
};

export type PodcastFeedRefreshResult = {
  success: boolean;
  dry_run: boolean;
  shows_considered: number;
  shows_refreshed: number;
  shows_failed: number;
  episodes_inserted: number;
  episodes_updated: number;
  shows_retired: number;
  errors: Array<{ show_id: string; feed_url: string; message: string }>;
};

export async function runPodcastFeedRefreshBatch(
  options: PodcastFeedRefreshOptions = {}
): Promise<PodcastFeedRefreshResult> {
  const limit = Math.max(1, Math.min(500, Number(options.limit || 100)));
  const staleHours = Math.max(1, Number(options.stale_hours || 24));
  const dryRun = options.dry_run === true;
  const staleBefore = new Date(Date.now() - staleHours * 3_600_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("podcast_shows")
    .select("id, feed_url, is_mature, mature_category, status, feed_status")
    .not("feed_url", "is", null)
    .or(`last_checked_at.is.null,last_checked_at.lt.${staleBefore}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const result: PodcastFeedRefreshResult = {
    success: true,
    dry_run: dryRun,
    shows_considered: (data || []).length,
    shows_refreshed: 0,
    shows_failed: 0,
    episodes_inserted: 0,
    episodes_updated: 0,
    shows_retired: 0,
    errors: [],
  };

  for (const show of data || []) {
    const feedUrl = String(show.feed_url || "").trim();
    if (!feedUrl) continue;

    if (dryRun) {
      result.shows_refreshed += 1;
      continue;
    }

    try {
      const ingest = await ingestPodcastFeed(feedUrl, {
        auto_approve: true,
        is_mature: Boolean(show.is_mature),
        mature_category: show.mature_category || null,
        max_episodes: options.max_episodes_per_feed || PODCAST_EXPANSION_MAX_EPISODES_PER_FEED,
      });

      result.shows_refreshed += 1;
      result.episodes_inserted += ingest.episodes_inserted;
      result.episodes_updated += ingest.episodes_updated;
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : String(refreshError);
      const transient =
        message.includes("fetch failed") ||
        message.includes("ECONNRESET") ||
        message.includes("ETIMEDOUT");

      if (!transient) {
        await supabaseAdmin
          .from("podcast_shows")
          .update({
            feed_status: "offline",
            last_checked_at: new Date().toISOString(),
          })
          .eq("id", show.id);
        result.shows_retired += 1;
      }

      result.shows_failed += 1;
      result.errors.push({
        show_id: String(show.id),
        feed_url: feedUrl,
        message,
      });
    }
  }

  result.success = result.shows_failed === 0 || result.shows_refreshed > 0;
  return result;
}
