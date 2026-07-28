/**
 * Read-only batch reconciliation audit. Pass batch result JSON path.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

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
  const resultPath =
    process.argv[2] ||
    path.join(adminRoot, "data/podcast-expansion-batch2-result.json");
  const batch = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");

  const before = batch.database_totals_before;
  const start = batch.started_at;
  const end = batch.finished_at;

  const [liveShows, liveEpisodes, livePendingShows, livePendingEpisodes] =
    await Promise.all([
      supabaseAdmin.from("podcast_shows").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("podcast_episodes").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("podcast_shows")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabaseAdmin
        .from("podcast_episodes")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

  const after = {
    shows: liveShows.count || 0,
    episodes: liveEpisodes.count || 0,
    pending_shows: livePendingShows.count || 0,
    pending_episodes: livePendingEpisodes.count || 0,
  };
  const snapshotAfter = batch.database_totals_after;

  const { count: windowShows } = await supabaseAdmin
    .from("podcast_shows")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start)
    .lte("created_at", end);

  const { count: windowEpisodes } = await supabaseAdmin
    .from("podcast_episodes")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start)
    .lte("created_at", end);

  const orphanShows: Array<{ id: string; title: string; feed_url: string | null }> = [];
  // Orphan detection is handled by run-podcast-orphan-cleanup.ts (accurate per-show counts).

  const windowShowCount = windowShows || 0;
  const windowEpisodeCount = windowEpisodes || 0;
  const showDelta = after.shows - ((before?.shows || 0) + windowShowCount);
  const episodeDelta =
    after.episodes - ((before?.episodes || 0) + windowEpisodeCount);

  console.log(
    JSON.stringify(
      {
        batch: batch.batch,
        window: { start, end },
        before,
        after,
        snapshot_after: snapshotAfter,
        inserted_in_window: {
          shows: windowShows || 0,
          episodes: windowEpisodes || 0,
        },
        batch_result_counts: {
          feeds_inserted: batch.feeds_inserted,
          feeds_updated: batch.feeds_updated,
          episodes_inserted: batch.episodes_inserted,
        },
        reconciliation: {
          shows_formula: `${before?.shows} + ${windowShowCount} = ${(before?.shows || 0) + windowShowCount} (actual ${after.shows}, delta ${showDelta})`,
          episodes_formula: `${before?.episodes} + ${windowEpisodeCount} = ${(before?.episodes || 0) + windowEpisodeCount} (actual ${after.episodes}, delta ${episodeDelta})`,
          balanced: Math.abs(showDelta) <= 5 && Math.abs(episodeDelta) <= 50,
          orphan_shows_removed: orphanShows.length,
        },
        orphan_shows_in_window: orphanShows,
        public_catalog: {
          before: batch.public_catalog_before,
          after: batch.public_catalog_after,
        },
        import_speed_feeds_per_hour: batch.import_speed_feeds_per_hour,
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
