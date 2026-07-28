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
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const batch = JSON.parse(
    fs.readFileSync(path.join(adminRoot, "data/podcast-expansion-batch2-result.json"), "utf8")
  );
  const errorUrls = (batch.errors || []).map((e: { feed_url: string }) => e.feed_url);

  const { data: errorShows } = await supabaseAdmin
    .from("podcast_shows")
    .select("id, title, feed_url, created_at")
    .in("feed_url", errorUrls);

  const start = batch.started_at;
  const end = batch.finished_at;
  const { data: windowShows } = await supabaseAdmin
    .from("podcast_shows")
    .select("id, title, feed_url, created_at")
    .gte("created_at", start)
    .lte("created_at", end);

  const zeroEpisodeShows: Array<{ title: string; feed_url: string | null }> = [];
  for (const show of windowShows || []) {
    const { count } = await supabaseAdmin
      .from("podcast_episodes")
      .select("id", { count: "exact", head: true })
      .eq("show_id", show.id);
    if ((count || 0) === 0) {
      zeroEpisodeShows.push({ title: show.title, feed_url: show.feed_url });
    }
  }

  console.log(
    JSON.stringify(
      {
        error_feed_urls: errorUrls.length,
        error_shows_in_db: errorShows,
        window_show_count: windowShows?.length || 0,
        zero_episode_shows: zeroEpisodeShows,
      },
      null,
      2
    )
  );
}

void main();
