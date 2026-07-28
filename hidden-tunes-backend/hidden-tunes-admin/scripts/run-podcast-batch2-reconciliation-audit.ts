/**
 * Read-only Batch 2 reconciliation audit. No mutations.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

const BATCH2_START = "2026-07-10T19:03:58.796Z";
const BATCH2_END = "2026-07-10T19:41:43.530Z";
const BEFORE_SHOWS = 156;
const BEFORE_EPISODES = 5609;

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
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");

  const { count: totalShows } = await supabaseAdmin
    .from("podcast_shows")
    .select("id", { count: "exact", head: true });
  const { count: totalEpisodes } = await supabaseAdmin
    .from("podcast_episodes")
    .select("id", { count: "exact", head: true });

  const { data: windowShows, error: showErr } = await supabaseAdmin
    .from("podcast_shows")
    .select("id, title, slug, created_at, status, is_verified, is_mature")
    .gte("created_at", BATCH2_START)
    .lte("created_at", BATCH2_END)
    .order("created_at");
  if (showErr) throw new Error(showErr.message);

  const { count: windowEpisodes } = await supabaseAdmin
    .from("podcast_episodes")
    .select("id", { count: "exact", head: true })
    .gte("created_at", BATCH2_START)
    .lte("created_at", BATCH2_END);

  const { data: preWindow } = await supabaseAdmin
    .from("podcast_shows")
    .select("id, title, created_at")
    .gt("created_at", "2026-07-10T18:47:02.866Z")
    .lt("created_at", BATCH2_START)
    .order("created_at");

  const insertedShows = windowShows?.length || 0;
  const insertedEpisodes = windowEpisodes || 0;
  const afterShows = totalShows || 0;
  const afterEpisodes = totalEpisodes || 0;

  const report = {
    batch: 2,
    window: { start: BATCH2_START, end: BATCH2_END },
    before: { shows: BEFORE_SHOWS, episodes: BEFORE_EPISODES },
    inserted_in_window: { shows: insertedShows, episodes: insertedEpisodes },
    after: { shows: afterShows, episodes: afterEpisodes },
    reconciliation: {
      shows: `${BEFORE_SHOWS} + ${insertedShows} = ${BEFORE_SHOWS + insertedShows} (actual ${afterShows}, delta ${afterShows - (BEFORE_SHOWS + insertedShows)})`,
      episodes: `${BEFORE_EPISODES} + ${insertedEpisodes} = ${BEFORE_EPISODES + insertedEpisodes} (actual ${afterEpisodes}, delta ${afterEpisodes - (BEFORE_EPISODES + insertedEpisodes)})`,
    },
    pre_batch2_artifacts: preWindow || [],
    batch2_result_file: {
      feeds_inserted: 250,
      episodes_inserted: 8365,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
