import {
  computeRetryDelayMs,
  PODCAST_VERIFY_BATCH_SIZE,
  type PodcastCatalogKind,
} from "@/lib/podcastVerification";
import { cleanText } from "@/lib/tvCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type PodcastHealthJobType = "feed" | "audio" | "metadata" | "full";

export async function enqueuePodcastHealthJob(input: {
  entity_type: "show" | "episode";
  entity_id: string;
  check_type: PodcastHealthJobType;
  catalog?: PodcastCatalogKind;
  priority?: number;
  scheduled_at?: string;
}) {
  const payload: Record<string, unknown> = {
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    check_type: input.check_type,
    priority: input.priority ?? 100,
    status: "pending",
    scheduled_at: input.scheduled_at || new Date().toISOString(),
    attempts: 0,
    last_error: null,
  };

  if (input.catalog) {
    payload.catalog = input.catalog;
  }

  const { error } = await supabaseAdmin.from("podcast_health_queue").insert(payload);

  if (
    error &&
    !/duplicate|unique|conflict/i.test(error.message) &&
    !/podcast_health_queue|does not exist|column/i.test(error.message)
  ) {
    throw new Error(error.message);
  }
}

export async function enqueuePodcastCatalogVerification(
  catalog: PodcastCatalogKind = "general",
  limit = 10_000
) {
  let showQuery = supabaseAdmin
    .from("podcast_shows")
    .select("id, is_mature")
    .in("status", ["approved", "pending", "inactive"])
    .limit(limit);

  showQuery =
    catalog === "mature"
      ? showQuery.eq("is_mature", true)
      : showQuery.eq("is_mature", false);

  const { data: shows, error } = await showQuery;
  if (error) throw new Error(error.message);

  let queued = 0;
  for (const show of shows || []) {
    await enqueuePodcastHealthJob({
      entity_type: "show",
      entity_id: String(show.id),
      check_type: "feed",
      catalog,
      priority: catalog === "mature" ? 80 : 100,
    });
    queued += 1;
  }

  const showIds = (shows || []).map((row) => String(row.id));
  if (showIds.length === 0) {
    return { catalog, shows_queued: 0, episodes_queued: 0 };
  }

  const { data: episodes, error: episodeError } = await supabaseAdmin
    .from("podcast_episodes")
    .select("id")
    .in("show_id", showIds)
    .in("status", ["approved", "pending", "inactive"])
    .limit(limit * 40);

  if (episodeError) throw new Error(episodeError.message);

  for (const episode of episodes || []) {
    await enqueuePodcastHealthJob({
      entity_type: "episode",
      entity_id: String(episode.id),
      check_type: "audio",
      catalog,
      priority: catalog === "mature" ? 80 : 100,
    });
    queued += 1;
  }

  return {
    catalog,
    shows_queued: (shows || []).length,
    episodes_queued: (episodes || []).length,
    total_jobs_touched: queued,
  };
}

export async function claimPodcastHealthJobs(limit = PODCAST_VERIFY_BATCH_SIZE) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("podcast_health_queue")
    .select("id, entity_type, entity_id, check_type, catalog, attempts, priority")
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .order("priority", { ascending: true })
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  if (error) {
    if (/podcast_health_queue|does not exist/i.test(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  const claimed: typeof data = [];
  for (const job of data || []) {
    const { data: locked, error: lockError } = await supabaseAdmin
      .from("podcast_health_queue")
      .update({
        status: "running",
        started_at: now,
        attempts: Number(job.attempts || 0) + 1,
      })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id, entity_type, entity_id, check_type, catalog, attempts, priority")
      .maybeSingle();

    if (!lockError && locked) claimed.push(locked);
  }

  return claimed;
}

export async function completePodcastHealthJob(
  jobId: string,
  result: { ok: boolean; reason?: string }
) {
  const now = new Date().toISOString();
  if (result.ok) {
    const { error } = await supabaseAdmin
      .from("podcast_health_queue")
      .update({
        status: "completed",
        finished_at: now,
        last_error: null,
      })
      .eq("id", jobId);
    if (error && !/podcast_health_queue/i.test(error.message)) throw new Error(error.message);
    return;
  }

  const { data: job, error: readError } = await supabaseAdmin
    .from("podcast_health_queue")
    .select("attempts")
    .eq("id", jobId)
    .maybeSingle();

  if (readError && !/podcast_health_queue/i.test(readError.message)) {
    throw new Error(readError.message);
  }

  const attempts = Number(job?.attempts || 1);
  const delayMs = computeRetryDelayMs(attempts);
  const { error } = await supabaseAdmin
    .from("podcast_health_queue")
    .update({
      status: attempts >= 5 ? "failed" : "pending",
      finished_at: attempts >= 5 ? now : null,
      scheduled_at: new Date(Date.now() + delayMs).toISOString(),
      last_error: cleanText(result.reason, 500),
    })
    .eq("id", jobId);

  if (error && !/podcast_health_queue/i.test(error.message)) throw new Error(error.message);
}

export async function recoverStuckPodcastHealthJobs(staleMinutes = 30) {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("podcast_health_queue")
    .select("id")
    .eq("status", "running")
    .lt("started_at", cutoff);

  if (error) {
    if (/podcast_health_queue/i.test(error.message)) return 0;
    throw new Error(error.message);
  }

  if (!data?.length) return 0;

  const { error: updateError } = await supabaseAdmin
    .from("podcast_health_queue")
    .update({
      status: "pending",
      scheduled_at: new Date().toISOString(),
      last_error: "recovered_stuck_job",
    })
    .in(
      "id",
      data.map((row) => String(row.id))
    );

  if (updateError && !/podcast_health_queue/i.test(updateError.message)) {
    throw new Error(updateError.message);
  }

  return data.length;
}
