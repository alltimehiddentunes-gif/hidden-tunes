import { probePodcastAudioUrl } from "@/lib/podcastAudioProbe";
import { probePodcastFeedUrl } from "@/lib/podcastFeedProbe";
import {
  claimPodcastHealthJobs,
  completePodcastHealthJob,
  enqueuePodcastCatalogVerification,
  enqueuePodcastHealthJob,
  recoverStuckPodcastHealthJobs,
} from "@/lib/podcastHealthQueue";
import {
  computePodcastReliabilityScore,
  isPublicVerifiedPodcastEpisode,
  isPublicVerifiedPodcastShow,
  PODCAST_AUTO_DISABLE_THRESHOLD,
  PODCAST_QUARANTINE_FAILURE_THRESHOLD,
  PODCAST_VERIFY_BATCH_SIZE,
  type PodcastCatalogKind,
} from "@/lib/podcastVerification";
import { cleanText } from "@/lib/tvCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export {
  PODCAST_AUTO_DISABLE_THRESHOLD,
  PODCAST_RELIABILITY_THRESHOLD,
  PODCAST_VERIFY_BATCH_SIZE,
} from "@/lib/podcastVerification";

export {
  isPublicVerifiedPodcastEpisode,
  isPublicVerifiedPodcastShow,
  isPublicVerifiedMaturePodcastShow,
} from "@/lib/podcastVerification";

export {
  enqueuePodcastCatalogVerification,
  enqueuePodcastHealthJob,
  recoverStuckPodcastHealthJobs,
} from "@/lib/podcastHealthQueue";

const nowIso = () => new Date().toISOString();

export async function quarantinePodcastEntity(input: {
  entity_type: "show" | "episode" | "feed";
  entity_id?: string | null;
  feed_url?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  reason: string;
  details?: Record<string, unknown>;
  catalog?: PodcastCatalogKind;
}) {
  const { error } = await supabaseAdmin.from("podcast_quarantine").insert({
    entity_type: input.entity_type,
    entity_id: input.entity_id || null,
    feed_url: cleanText(input.feed_url, 2000),
    source_type: cleanText(input.source_type, 40),
    source_id: cleanText(input.source_id, 120),
    reason: cleanText(input.reason, 500) || "quarantined",
    details: {
      ...(input.details || {}),
      catalog: input.catalog || "general",
    },
  });

  if (error && !/podcast_quarantine|does not exist/i.test(error.message)) {
    throw new Error(error.message);
  }
}

async function countVerifiedPlayableEpisodes(showId: string) {
  const { count, error } = await supabaseAdmin
    .from("podcast_episodes")
    .select("id", { count: "exact", head: true })
    .eq("show_id", showId)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .eq("is_verified", true)
    .not("last_play_verified_at", "is", null)
    .is("quarantined_at", null);

  if (error) throw new Error(error.message);
  return count || 0;
}

export async function verifyPodcastEpisode(episodeId: string, options?: { dryRun?: boolean }) {
  const { data, error } = await supabaseAdmin
    .from("podcast_episodes")
    .select(
      "id, show_id, audio_url, title, status, playback_status, is_active, is_verified, reliability_score, consecutive_failures, quarantined_at, last_play_verified_at"
    )
    .eq("id", episodeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Episode not found.");

  const row = data as Record<string, unknown>;
  const audioUrl = cleanText(row.audio_url, 2000);
  const checkedAt = nowIso();

  if (!audioUrl) {
    if (!options?.dryRun) {
      await supabaseAdmin
        .from("podcast_episodes")
        .update({
          playback_status: "failed",
          is_verified: false,
          is_active: false,
          last_health_checked_at: checkedAt,
          last_health_error: "missing_audio_url",
        })
        .eq("id", episodeId);
    }
    return { verified: false, reason: "missing_audio_url" };
  }

  const probe = await probePodcastAudioUrl(audioUrl);
  const score = computePodcastReliabilityScore({
    previousScore: Number(row.reliability_score ?? 100),
    consecutiveFailures: Number(row.consecutive_failures ?? 0),
    probeSucceeded: probe.ok,
    lastSuccessAt: probe.ok ? checkedAt : String(row.last_play_verified_at || ""),
  });

  const failures = score.consecutive_failures;
  const autoDisabled = score.reliability_score < PODCAST_AUTO_DISABLE_THRESHOLD;
  const verified = probe.ok && !autoDisabled;

  const update = {
    playback_status: verified
      ? "playable"
      : failures >= PODCAST_QUARANTINE_FAILURE_THRESHOLD || autoDisabled
        ? "failed"
        : "unchecked",
    status: row.status === "blocked" ? "blocked" : verified ? "approved" : row.status,
    is_active: verified,
    is_verified: verified,
    reliability_score: score.reliability_score,
    consecutive_failures: failures,
    quarantined_at:
      verified || options?.dryRun
        ? null
        : failures >= PODCAST_QUARANTINE_FAILURE_THRESHOLD
          ? checkedAt
          : row.quarantined_at,
    last_health_checked_at: checkedAt,
    last_health_error: verified ? null : probe.reason,
    last_play_verified_at: verified ? checkedAt : null,
  };

  if (!options?.dryRun) {
    await supabaseAdmin.from("podcast_episodes").update(update).eq("id", episodeId);

    if (!verified && failures >= PODCAST_QUARANTINE_FAILURE_THRESHOLD) {
      await quarantinePodcastEntity({
        entity_type: "episode",
        entity_id: episodeId,
        reason: probe.reason,
        details: { probe },
      });
    }
  }

  return {
    verified,
    reason: probe.reason,
    probe,
    update,
  };
}

export async function verifyPodcastShow(showId: string, options?: { dryRun?: boolean }) {
  const { data, error } = await supabaseAdmin
    .from("podcast_shows")
    .select(
      "id, feed_url, title, artwork_url, language, primary_category, status, feed_status, is_active, is_verified, is_mature, reliability_score, consecutive_failures, quarantined_at, source_type, source_id"
    )
    .eq("id", showId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Show not found.");

  const row = data as Record<string, unknown>;
  const feedUrl = cleanText(row.feed_url, 2000);
  const checkedAt = nowIso();
  const catalog: PodcastCatalogKind = row.is_mature === true ? "mature" : "general";

  if (!feedUrl) {
    if (!options?.dryRun) {
      await supabaseAdmin
        .from("podcast_shows")
        .update({
          feed_status: "offline",
          is_verified: false,
          is_active: false,
          last_health_checked_at: checkedAt,
          last_health_error: "missing_feed_url",
        })
        .eq("id", showId);
      await quarantinePodcastEntity({
        entity_type: "show",
        entity_id: showId,
        reason: "missing_feed_url",
        catalog,
      });
    }
    return { verified: false, reason: "missing_feed_url", catalog };
  }

  const probe = await probePodcastFeedUrl(feedUrl);
  const hasMetadata =
    Boolean(cleanText(row.title, 300)) &&
    Boolean(cleanText(row.language, 40) || cleanText(row.primary_category, 120));

  const score = computePodcastReliabilityScore({
    previousScore: Number(row.reliability_score ?? 100),
    consecutiveFailures: Number(row.consecutive_failures ?? 0),
    probeSucceeded: probe.ok && hasMetadata,
    lastSuccessAt: probe.ok ? checkedAt : null,
  });

  const failures = score.consecutive_failures;
  const autoDisabled = score.reliability_score < PODCAST_AUTO_DISABLE_THRESHOLD;

  let verifiedEpisodeCount = 0;
  if (!options?.dryRun && probe.ok) {
    const { data: episodeRows } = await supabaseAdmin
      .from("podcast_episodes")
      .select("id")
      .eq("show_id", showId)
      .in("status", ["approved", "pending"])
      .limit(25);

    for (const episode of episodeRows || []) {
      const result = await verifyPodcastEpisode(String(episode.id));
      if (result.verified) verifiedEpisodeCount += 1;
    }
  } else {
    verifiedEpisodeCount = await countVerifiedPlayableEpisodes(showId);
  }

  const verified =
    probe.ok &&
    hasMetadata &&
    verifiedEpisodeCount > 0 &&
    !autoDisabled;

  const update = {
    feed_status: verified
      ? "active"
      : failures >= PODCAST_QUARANTINE_FAILURE_THRESHOLD || autoDisabled
        ? "offline"
        : "inactive",
    status: row.status === "blocked" ? "blocked" : verified ? "approved" : row.status,
    is_active: verified,
    is_verified: verified,
    reliability_score: score.reliability_score,
    consecutive_failures: failures,
    quarantined_at:
      verified || options?.dryRun
        ? null
        : failures >= PODCAST_QUARANTINE_FAILURE_THRESHOLD
          ? checkedAt
          : row.quarantined_at,
    last_health_checked_at: checkedAt,
    last_health_error: verified ? null : probe.reason,
    last_checked_at: checkedAt,
  };

  if (!options?.dryRun) {
    await supabaseAdmin.from("podcast_shows").update(update).eq("id", showId);

    if (!verified && failures >= PODCAST_QUARANTINE_FAILURE_THRESHOLD) {
      await quarantinePodcastEntity({
        entity_type: "show",
        entity_id: showId,
        feed_url: feedUrl,
        source_type: cleanText(row.source_type, 40),
        source_id: cleanText(row.source_id, 120),
        reason: probe.reason,
        details: { probe },
        catalog,
      });
    }
  }

  const publicVerified = isPublicVerifiedPodcastShow(
    {
      status: String(update.status),
      is_active: update.is_active,
      feed_status: String(update.feed_status),
      is_verified: update.is_verified,
      reliability_score: update.reliability_score,
      quarantined_at: update.quarantined_at as string | null,
      is_mature: row.is_mature === true,
    },
    { verifiedPlayableEpisodeCount: verifiedEpisodeCount }
  );

  return {
    verified: publicVerified,
    reason: verified ? "show_verified" : probe.reason,
    catalog,
    verified_episode_count: verifiedEpisodeCount,
    probe,
    update,
  };
}

export async function runPodcastHealthWorkerBatch(options?: {
  limit?: number;
  catalog?: PodcastCatalogKind | "all";
  dryRun?: boolean;
}) {
  await recoverStuckPodcastHealthJobs();
  const jobs = await claimPodcastHealthJobs(options?.limit ?? PODCAST_VERIFY_BATCH_SIZE);

  const stats = {
    jobs_claimed: jobs.length,
    completed: 0,
    failed: 0,
    verified: 0,
    catalog: options?.catalog || "all",
    dry_run: Boolean(options?.dryRun),
  };

  for (const job of jobs) {
    if (options?.catalog && options.catalog !== "all" && job.catalog !== options.catalog) {
      await completePodcastHealthJob(String(job.id), { ok: true, reason: "skipped_catalog" });
      continue;
    }

    try {
      const result =
        job.check_type === "audio" || job.entity_type === "episode"
          ? await verifyPodcastEpisode(String(job.entity_id), { dryRun: options?.dryRun })
          : await verifyPodcastShow(String(job.entity_id), { dryRun: options?.dryRun });

      if (result.verified) stats.verified += 1;
      if (!options?.dryRun) {
        await completePodcastHealthJob(String(job.id), {
          ok: result.verified,
          reason: result.reason,
        });
      }
      stats.completed += 1;
      if (!result.verified) stats.failed += 1;
    } catch (error) {
      stats.failed += 1;
      if (!options?.dryRun) {
        await completePodcastHealthJob(String(job.id), {
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return stats;
}

export async function runPodcastHealthBatch(limit = PODCAST_VERIFY_BATCH_SIZE) {
  const general = await enqueuePodcastCatalogVerification("general", limit);
  const mature = await enqueuePodcastCatalogVerification("mature", limit);
  const worker = await runPodcastHealthWorkerBatch({ limit, catalog: "all" });
  return { general, mature, worker };
}

export async function verifyEntirePodcastCatalog(options?: {
  batchSize?: number;
  maxShows?: number;
  dryRun?: boolean;
}) {
  const batchSize = options?.batchSize ?? PODCAST_VERIFY_BATCH_SIZE;
  const maxShows = options?.maxShows ?? 10_000;
  let processedShows = 0;
  let verifiedShows = 0;
  let verifiedEpisodes = 0;
  let failed = 0;

  while (processedShows < maxShows) {
    let query = supabaseAdmin
      .from("podcast_shows")
      .select("id")
      .range(processedShows, processedShows + batchSize - 1);

    let { data: shows, error } = await query.order("last_health_checked_at", {
      ascending: true,
      nullsFirst: true,
    });

    if (error?.message?.includes("last_health_checked_at")) {
      ({ data: shows, error } = await supabaseAdmin
        .from("podcast_shows")
        .select("id")
        .order("updated_at", { ascending: true })
        .range(processedShows, processedShows + batchSize - 1));
    }

    if (error) throw new Error(error.message);
    if (!shows?.length) break;

    for (const show of shows) {
      const result = await verifyPodcastShow(String(show.id), { dryRun: options?.dryRun });
      if (result.verified) verifiedShows += 1;
      else failed += 1;
      verifiedEpisodes += result.verified_episode_count || 0;
      processedShows += 1;
      if (processedShows >= maxShows) break;
    }
  }

  return {
    processed_shows: processedShows,
    verified_shows: verifiedShows,
    verified_episodes: verifiedEpisodes,
    failed,
    dry_run: Boolean(options?.dryRun),
  };
}
