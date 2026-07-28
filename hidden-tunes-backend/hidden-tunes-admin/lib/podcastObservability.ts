import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type PodcastObservabilitySnapshot = {
  captured_at: string;
  feeds_discovered: number;
  feeds_imported: number;
  feeds_rejected: number;
  duplicate_feeds: number;
  duplicate_episodes: number;
  verification_pass_rate: number;
  verification_failures: number;
  worker_queue_depth: number;
  ingest_throughput_last_run: number;
  shows_total: number;
  shows_public: number;
  shows_verified: number;
  episodes_total: number;
  episodes_playable: number;
  episodes_verified: number;
  quarantined_total: number;
  health_check_success_rate: number;
  feed_checks_attempted: number;
  feed_checks_passed: number;
  feed_checks_failed: number;
  audio_checks_attempted: number;
  audio_checks_passed: number;
  audio_checks_failed: number;
  retry_count: number;
  quarantine_count: number;
  average_feed_probe_latency_ms: number;
  average_audio_probe_latency_ms: number;
  worker_throughput_last_batch: number;
  verification_success_percentage: number;
  oldest_pending_job_at: string | null;
  jobs_stuck_processing: number;
  public_verified_show_count: number;
  public_verified_episode_count: number;
  mature_queue_depth: number;
  mature_feeds_verified: number;
  mature_feeds_failed: number;
  mature_episodes_verified: number;
  mature_quarantine_count: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countTable(table: string, filters?: (query: any) => any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  if (filters) query = filters(query);
  const { count, error } = await query;
  if (error) {
    if (/does not exist|relation|column/i.test(error.message)) return 0;
    throw new Error(error.message);
  }
  return count || 0;
}

export async function collectPodcastObservability(): Promise<PodcastObservabilitySnapshot> {
  const showsTotal = await countTable("podcast_shows");
  const showsPublic = await countTable("podcast_shows", (q) =>
    q
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("feed_status", "active")
      .eq("is_verified", true)
      .eq("is_mature", false)
      .is("quarantined_at", null)
  );
  const showsVerified = await countTable("podcast_shows", (q) =>
    q.eq("is_verified", true).eq("status", "approved").eq("is_active", true)
  );
  const episodesTotal = await countTable("podcast_episodes");
  const episodesPlayable = await countTable("podcast_episodes", (q) =>
    q.eq("status", "approved").eq("is_active", true).eq("playback_status", "playable")
  );
  const episodesVerified = await countTable("podcast_episodes", (q) =>
    q.eq("is_verified", true).eq("playback_status", "playable")
  );
  const quarantinedTotal = await countTable("podcast_quarantine");
  const queueDepth = await countTable("podcast_health_queue", (q) =>
    q.in("status", ["pending", "running"])
  );
  const queueFailed = await countTable("podcast_health_queue", (q) => q.eq("status", "failed"));
  const matureQueueDepth = await countTable("podcast_health_queue", (q) =>
    q.in("status", ["pending", "running"]).eq("catalog", "mature")
  );
  const matureShowsVerified = await countTable("podcast_shows", (q) =>
    q.eq("is_mature", true).eq("is_verified", true).eq("status", "approved")
  );
  const matureEpisodesVerified = await countTable("podcast_episodes", (q) =>
    q.eq("is_verified", true).eq("playback_status", "playable")
  );
  const matureQuarantine = await countTable("podcast_quarantine", (q) =>
    q.contains("details", { catalog: "mature" })
  );
  const publicVerifiedShows = await countTable("podcast_shows", (q) =>
    q
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("feed_status", "active")
      .eq("is_verified", true)
      .is("quarantined_at", null)
  );
  const publicVerifiedEpisodes = await countTable("podcast_episodes", (q) =>
    q
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("playback_status", "playable")
      .eq("is_verified", true)
      .not("last_play_verified_at", "is", null)
      .is("quarantined_at", null)
  );

  const importRuns = await supabaseAdmin
    .from("podcast_import_runs")
    .select("imported_count, skipped_count, failed_count, duplicate_count, metadata")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const oldestPending = await supabaseAdmin
    .from("podcast_health_queue")
    .select("scheduled_at")
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const stuckJobs = await supabaseAdmin
    .from("podcast_health_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - 30 * 60_000).toISOString());

  const lastRun = importRuns.data as Record<string, unknown> | null;
  const metadata = (lastRun?.metadata || {}) as Record<string, unknown>;
  const feedsDiscovered = Number(metadata.feeds_discovered || 0);
  const feedsImported = Number(lastRun?.imported_count || 0);
  const feedsRejected = Number(lastRun?.failed_count || 0);
  const duplicateFeeds = Number(lastRun?.duplicate_count || 0);
  const duplicateEpisodes = Number(metadata.duplicate_episodes || 0);
  const verificationFailures = Number(metadata.verification_failures || 0);
  const verificationPasses = Number(metadata.verification_passes || 0);
  const verificationTotal = verificationPasses + verificationFailures;
  const healthPasses = Number(metadata.health_passes || 0);
  const healthTotal = healthPasses + Number(metadata.health_failures || 0);

  const feedChecksAttempted = Number(metadata.feed_checks_attempted || 0);
  const feedChecksPassed = Number(metadata.feed_checks_passed || 0);
  const feedChecksFailed = Number(metadata.feed_checks_failed || 0);
  const audioChecksAttempted = Number(metadata.audio_checks_attempted || 0);
  const audioChecksPassed = Number(metadata.audio_checks_passed || 0);
  const audioChecksFailed = Number(metadata.audio_checks_failed || 0);
  const retryCount = Number(metadata.retry_count || queueFailed || 0);
  const avgFeedLatency = Number(metadata.average_feed_probe_latency_ms || 0);
  const avgAudioLatency = Number(metadata.average_audio_probe_latency_ms || 0);
  const workerThroughput = Number(metadata.worker_throughput_last_batch || 0);

  return {
    captured_at: new Date().toISOString(),
    feeds_discovered: feedsDiscovered,
    feeds_imported: feedsImported,
    feeds_rejected: feedsRejected,
    duplicate_feeds: duplicateFeeds,
    duplicate_episodes: duplicateEpisodes,
    verification_pass_rate:
      verificationTotal > 0 ? Number((verificationPasses / verificationTotal).toFixed(4)) : 0,
    verification_failures: verificationFailures,
    worker_queue_depth: queueDepth,
    ingest_throughput_last_run: feedsImported,
    shows_total: showsTotal,
    shows_public: showsPublic,
    shows_verified: showsVerified,
    episodes_total: episodesTotal,
    episodes_playable: episodesPlayable,
    episodes_verified: episodesVerified,
    quarantined_total: quarantinedTotal,
    health_check_success_rate:
      healthTotal > 0 ? Number((healthPasses / healthTotal).toFixed(4)) : 0,
    feed_checks_attempted: feedChecksAttempted,
    feed_checks_passed: feedChecksPassed,
    feed_checks_failed: feedChecksFailed,
    audio_checks_attempted: audioChecksAttempted,
    audio_checks_passed: audioChecksPassed,
    audio_checks_failed: audioChecksFailed,
    retry_count: retryCount,
    quarantine_count: quarantinedTotal,
    average_feed_probe_latency_ms: avgFeedLatency,
    average_audio_probe_latency_ms: avgAudioLatency,
    worker_throughput_last_batch: workerThroughput,
    verification_success_percentage:
      verificationTotal > 0 ? Number(((verificationPasses / verificationTotal) * 100).toFixed(2)) : 0,
    oldest_pending_job_at: (oldestPending.data as { scheduled_at?: string } | null)?.scheduled_at || null,
    jobs_stuck_processing: Number(stuckJobs.count || 0),
    public_verified_show_count: publicVerifiedShows,
    public_verified_episode_count: publicVerifiedEpisodes,
    mature_queue_depth: matureQueueDepth,
    mature_feeds_verified: matureShowsVerified,
    mature_feeds_failed: Number(metadata.mature_feeds_failed || 0),
    mature_episodes_verified: matureEpisodesVerified,
    mature_quarantine_count: matureQuarantine,
  };
}
