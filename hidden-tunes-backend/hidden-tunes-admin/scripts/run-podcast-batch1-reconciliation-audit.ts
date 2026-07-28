/**
 * Read-only Batch 1 reconciliation audit. No mutations.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

const BATCH1_START = "2026-07-10T18:33:05.782Z";
const BATCH1_END = "2026-07-10T18:47:02.866Z";
const BACKUP_AT = "2026-07-10T17:23:24.179Z";

type SupabaseFilterQuery = {
  eq(column: string, value: unknown): SupabaseFilterQuery;
  range(from: number, to: number): SupabaseFilterQuery;
};

type SupabaseAwaitableQuery = SupabaseFilterQuery &
  PromiseLike<{
    data?: unknown;
    count?: number | null;
    error?: { message: string } | null;
  }>;

type SupabaseFilter = (query: SupabaseFilterQuery) => SupabaseFilterQuery;

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(adminRoot, ".env.local"));
loadEnvFile(path.join(adminRoot, ".env"));

async function fetchAll<T extends Record<string, unknown>>(
  table: string,
  select: string,
  filter?: SupabaseFilter
) {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const rows: T[] = [];
  let from = 0;
  while (true) {
    let query = supabaseAdmin
      .from(table)
      .select(select)
      .range(from, from + 999) as unknown as SupabaseAwaitableQuery;
    if (filter) query = filter(query) as SupabaseAwaitableQuery;
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data || []) as unknown as T[];
    rows.push(...batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function exactCount(apply?: SupabaseFilter) {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  let query = supabaseAdmin
    .from("podcast_shows")
    .select("id", { count: "exact", head: true }) as unknown as SupabaseAwaitableQuery;
  if (apply) query = apply(query) as SupabaseAwaitableQuery;
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count || 0;
}

async function episodeCount(apply?: SupabaseFilter) {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  let query = supabaseAdmin
    .from("podcast_episodes")
    .select("id", { count: "exact", head: true }) as unknown as SupabaseAwaitableQuery;
  if (apply) query = apply(query) as SupabaseAwaitableQuery;
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count || 0;
}

function findDuplicates<T>(rows: T[], keyFn: (row: T) => string | null) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  const dupes = [...map.entries()].filter(([, list]) => list.length > 1);
  return {
    duplicate_groups: dupes.length,
    duplicate_rows: dupes.reduce((sum, [, list]) => sum + list.length, 0),
    samples: dupes.slice(0, 10).map(([key, list]) => ({ key, count: list.length })),
  };
}

async function main() {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");

  const totals = {
    shows: await exactCount(),
    episodes: await episodeCount(),
    public_shows: await exactCount((q) =>
      q.eq("status", "approved").eq("is_active", true).eq("feed_status", "active").eq("is_mature", false)
    ),
    public_episodes: await episodeCount((q) =>
      q.eq("status", "approved").eq("is_active", true).eq("playback_status", "playable")
    ),
    pending_shows: await exactCount((q) => q.eq("status", "pending")),
    pending_unverified_shows: await exactCount((q) =>
      q.eq("status", "pending").eq("is_verified", false)
    ),
    failed_episodes: await episodeCount((q) => q.eq("playback_status", "failed")),
    pending_episodes: await episodeCount((q) => q.eq("status", "pending")),
  };

  const allShows = await fetchAll<{
    id: string;
    slug: string;
    title: string;
    feed_url: string | null;
    status: string;
    is_verified: boolean;
    is_active: boolean;
    feed_status: string;
    created_at: string;
    updated_at: string;
  }>("podcast_shows", "id, slug, title, feed_url, status, is_verified, is_active, feed_status, created_at, updated_at");

  const allEpisodes = await fetchAll<{
    id: string;
    show_id: string;
    title: string;
    status: string;
    playback_status: string;
    is_verified: boolean;
    is_active: boolean;
    created_at: string;
    audio_url: string | null;
  }>(
    "podcast_episodes",
    "id, show_id, title, status, playback_status, is_verified, is_active, created_at, audio_url"
  );

  const batchShows = allShows.filter(
    (s) => s.created_at >= BATCH1_START && s.created_at <= BATCH1_END
  );
  const batchEpisodes = allEpisodes.filter(
    (e) => e.created_at >= BATCH1_START && e.created_at <= BATCH1_END
  );

  const expansionDayShows = allShows.filter((s) => s.created_at.startsWith("2026-07-10"));
  const expansionDayEpisodes = allEpisodes.filter((e) => e.created_at.startsWith("2026-07-10"));

  const outsideBatchWindowShows = expansionDayShows.filter(
    (s) => s.created_at < BATCH1_START || s.created_at > BATCH1_END
  );
  const outsideBatchWindowEpisodes = expansionDayEpisodes.filter(
    (e) => e.created_at < BATCH1_START || e.created_at > BATCH1_END
  );

  const batchShowIds = new Set(batchShows.map((s) => s.id));
  const batchPendingUnverified = batchShows.filter(
    (s) => s.status === "pending" && s.is_verified === false && !s.is_active
  );

  const episodesOnBatchShows = allEpisodes.filter((e) => batchShowIds.has(e.show_id));
  const failedOnBatchShows = episodesOnBatchShows.filter((e) => e.playback_status === "failed");
  const pendingOnBatchShows = episodesOnBatchShows.filter((e) => e.status === "pending");

  const duplicateShowsByFeed = findDuplicates(allShows, (s) =>
    s.feed_url?.trim().toLowerCase() || null
  );
  const duplicateShowsBySlug = findDuplicates(allShows, (s) => s.slug?.trim().toLowerCase() || null);
  const duplicateEpisodesByAudio = findDuplicates(allEpisodes, (e) =>
    e.audio_url?.trim().toLowerCase() || null
  );

  const backupShows = JSON.parse(
    fs.readFileSync(
      path.join(adminRoot, "data/podcast-backups/2026-07-10T17-23-24-168Z/podcast_shows.json"),
      "utf8"
    )
  ) as Array<{ id: string; feed_url?: string }>;
  const backupEpisodeCount = (
    JSON.parse(
      fs.readFileSync(
        path.join(adminRoot, "data/podcast-backups/2026-07-10T17-23-24-168Z/podcast_episodes.json"),
        "utf8"
      )
    ) as unknown[]
  ).length;

  const backupIds = new Set(backupShows.map((s) => s.id));
  const newSinceBackup = allShows.filter((s) => !backupIds.has(s.id));

  const importRuns = await supabaseAdmin
    .from("podcast_import_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(5);

  const report = {
    audit_at: new Date().toISOString(),
    windows: {
      backup_at: BACKUP_AT,
      batch1_start: BATCH1_START,
      batch1_end: BATCH1_END,
    },
    exact_current_totals: totals,
    backup_baseline: {
      shows: backupShows.length,
      episodes: backupEpisodeCount,
    },
    delta_from_backup: {
      shows: totals.shows - backupShows.length,
      episodes: totals.episodes - backupEpisodeCount,
    },
    batch1_window: {
      shows_created: batchShows.length,
      episodes_created: batchEpisodes.length,
      shows_pending_unverified: batchPendingUnverified.length,
      show_samples_outside_pending: batchShows
        .filter((s) => s.status !== "pending" || s.is_verified !== false)
        .slice(0, 10)
        .map((s) => ({
          id: s.id,
          title: s.title,
          status: s.status,
          is_verified: s.is_verified,
          created_at: s.created_at,
        })),
    },
    outside_batch1_window_same_day: {
      shows: outsideBatchWindowShows.length,
      episodes: outsideBatchWindowEpisodes.length,
      show_details: outsideBatchWindowShows.map((s) => ({
        id: s.id,
        title: s.title,
        slug: s.slug,
        feed_url: s.feed_url,
        status: s.status,
        created_at: s.created_at,
        updated_at: s.updated_at,
      })),
      episode_count_by_show: outsideBatchWindowEpisodes.reduce<Record<string, number>>((acc, e) => {
        acc[e.show_id] = (acc[e.show_id] || 0) + 1;
        return acc;
      }, {}),
    },
    new_since_backup_not_in_batch_window: newSinceBackup
      .filter((s) => s.created_at < BATCH1_START || s.created_at > BATCH1_END)
      .map((s) => ({
        id: s.id,
        title: s.title,
        feed_url: s.feed_url,
        created_at: s.created_at,
      })),
    episodes_on_batch1_shows: {
      total: episodesOnBatchShows.length,
      pending: pendingOnBatchShows.length,
      failed_playback: failedOnBatchShows.length,
      created_in_batch_window: batchEpisodes.length,
      created_outside_batch_window_on_batch_shows: episodesOnBatchShows.filter(
        (e) => e.created_at < BATCH1_START || e.created_at > BATCH1_END
      ).length,
    },
    failed_episode_records_explanation: {
      counter_source:
        "Sum of ingestPodcastFeed() episodes_failed per feed — episodes evaluated with playback_status=failed during ingest, not DB insert failures",
      total_failed_playback_in_db: totals.failed_episodes,
      failed_on_batch1_show_ids: failedOnBatchShows.length,
      note: "episodes_considered/inserted count only successful inserts; failed_episode_records counts evaluation failures within parsed feeds",
    },
    duplicates: {
      shows_by_feed_url: duplicateShowsByFeed,
      shows_by_slug: duplicateShowsBySlug,
      episodes_by_audio_url: duplicateEpisodesByAudio,
    },
    reconciliation: {
      expected_shows_after_batch: backupShows.length + 100,
      actual_shows: totals.shows,
      show_discrepancy: totals.shows - (backupShows.length + 100),
      expected_episodes_after_batch: backupEpisodeCount + 3511,
      actual_episodes: totals.episodes,
      episode_discrepancy: totals.episodes - (backupEpisodeCount + 3511),
      shows_in_batch_window: batchShows.length,
      episodes_in_batch_window: batchEpisodes.length,
      shows_outside_window_explaining_gap: outsideBatchWindowShows.length,
      episodes_outside_window_explaining_gap: outsideBatchWindowEpisodes.length,
    },
    import_runs: importRuns.data || [],
  };

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
