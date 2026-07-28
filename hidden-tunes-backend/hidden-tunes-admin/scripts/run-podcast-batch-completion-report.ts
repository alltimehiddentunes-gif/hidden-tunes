/**
 * Batch completion report + next-batch capacity estimate.
 * Usage: npx tsx scripts/run-podcast-batch-completion-report.ts --batch 5 --next 6
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

const BATCH_TARGETS: Record<number, number> = {
  5: 2500,
  6: 5000,
  7: 10000,
};

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

async function main() {
  const argv = process.argv.slice(2);
  const readValue = (flag: string) => {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    return argv[index + 1];
  };
  const batch = Number(readValue("--batch") || "5");
  const nextBatch = Number(readValue("--next") || String(batch + 1));
  const resultPath =
    readValue("--result") ||
    path.join(adminRoot, "data", `podcast-expansion-batch${batch}-result.json`);
  const validatedPath = path.join(
    adminRoot,
    "data",
    `podcast-expansion-batch${batch}-validated.json`
  );

  const result = JSON.parse(fs.readFileSync(resultPath, "utf8")) as Record<string, unknown>;
  const validated = fs.existsSync(validatedPath)
    ? (JSON.parse(fs.readFileSync(validatedPath, "utf8")) as Record<string, unknown>)
    : null;

  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const [shows, episodes, pendingShows, pendingEpisodes, publicShows, publicEpisodes] =
    await Promise.all([
      supabaseAdmin.from("podcast_shows").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("podcast_episodes").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("podcast_shows").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("podcast_episodes").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin
        .from("podcast_shows")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .eq("is_active", true)
        .eq("is_mature", false),
      supabaseAdmin
        .from("podcast_episodes")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .eq("is_active", true)
        .eq("playback_status", "playable"),
    ]);

  const feedsInserted = Number(result.feeds_inserted || 0);
  const episodesInserted = Number(result.episodes_inserted || 0);
  const runtimeMs = Number(result.runtime_ms || 0);
  const feedsPerHour =
    feedsInserted > 0 && runtimeMs > 0
      ? Math.round((feedsInserted / runtimeMs) * 3_600_000 * 10) / 10
      : null;

  const nextTarget = BATCH_TARGETS[nextBatch] || 0;
  const avgEpisodesPerFeed =
    feedsInserted > 0 ? Math.round(episodesInserted / feedsInserted) : 30;
  const estimatedNextRuntimeHours =
    feedsPerHour && nextTarget > 0
      ? Math.round((nextTarget / feedsPerHour) * 10) / 10
      : null;

  const report = {
    batch,
    validated: validated?.pass === true,
    feeds_inserted: feedsInserted,
    feeds_updated: Number(result.feeds_updated || 0),
    duplicate_feeds: Number(result.duplicate_feeds || 0),
    invalid_feeds: Number(result.invalid_feeds || 0),
    failed_episode_records: Number(result.failed_episode_records || 0),
    episodes_inserted: episodesInserted,
    runtime_ms: runtimeMs,
    runtime_hours: runtimeMs > 0 ? Math.round((runtimeMs / 3_600_000) * 100) / 100 : null,
    feeds_per_hour: feedsPerHour,
    avg_episodes_per_feed: avgEpisodesPerFeed,
    sources_discovered: Number(result.sources_discovered || 0),
    by_category: result.by_category || {},
    database_growth_snapshot: {
      total_shows: shows.count || 0,
      total_episodes: episodes.count || 0,
      pending_shows: pendingShows.count || 0,
      pending_episodes: pendingEpisodes.count || 0,
      public_shows: publicShows.count || 0,
      public_playable_episodes: publicEpisodes.count || 0,
      database_size_bytes: null as number | null,
      largest_tables: null as unknown,
      index_size_bytes: null as number | null,
      metrics_note:
        "Table/index byte sizes require direct Postgres access; unavailable via Supabase REST API.",
    },
    current_totals: {
      shows: shows.count || 0,
      episodes: episodes.count || 0,
      pending_shows: pendingShows.count || 0,
      pending_episodes: pendingEpisodes.count || 0,
      public_shows: publicShows.count || 0,
      public_episodes: publicEpisodes.count || 0,
    },
    next_batch_estimate: {
      batch: nextBatch,
      target_feeds: nextTarget,
      estimated_runtime_hours: estimatedNextRuntimeHours,
      estimated_episodes_added: nextTarget * avgEpisodesPerFeed,
      projected_shows_after: (shows.count || 0) + nextTarget,
      projected_episodes_after: (episodes.count || 0) + nextTarget * avgEpisodesPerFeed,
      avg_episodes_per_feed_observed: avgEpisodesPerFeed,
      storage_note:
        "Episode rows store metadata + audio_url; browse/search remain metadata-first.",
    },
    timestamp: new Date().toISOString(),
  };

  const outPath = path.join(adminRoot, "data", `podcast-expansion-batch${batch}-completion-report.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (nextBatch === 6) {
    const estimatePath = path.join(adminRoot, "data", "podcast-expansion-batch6-estimate.json");
    fs.writeFileSync(
      estimatePath,
      `${JSON.stringify(report.next_batch_estimate, null, 2)}\n`,
      "utf8"
    );
  }

  console.log(JSON.stringify(report, null, 2));
}

void main();
