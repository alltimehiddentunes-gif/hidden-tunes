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

async function main() {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");

  const { data: shows, error: showError } = await supabaseAdmin
    .from("podcast_shows")
    .select("id, slug, title, primary_category, episode_count, is_mature, status, is_active, feed_status");

  if (showError) {
    throw new Error(showError.message);
  }

  const zeroEpisodeShows = (shows || []).filter(
    (show) => Number(show.episode_count || 0) === 0
  );

  const { count: episodeCount, error: episodeError } = await supabaseAdmin
    .from("podcast_episodes")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable");

  if (episodeError) {
    throw new Error(episodeError.message);
  }

  const categories = ["music", "society-culture", "true-crime"] as const;
  const byCategory: Record<string, { shows: number; episodes: number }> = {};

  for (const category of categories) {
    const response = await fetch(
      `https://admin.hiddentunes.com/api/podcasts/episodes?category=${category}&limit=5`
    );
    const payload = await response.json();
    byCategory[category] = {
      shows: (shows || []).filter(
        (show) =>
          !show.is_mature &&
          String(show.primary_category || "").toLowerCase().includes(category.replace("-", ""))
      ).length,
      episodes: Array.isArray(payload?.episodes) ? payload.episodes.length : 0,
    };
  }

  console.log(
    JSON.stringify(
      {
        total_shows: shows?.length || 0,
        zero_episode_shows: zeroEpisodeShows.length,
        playable_episodes: episodeCount || 0,
        sample_zero_episode_shows: zeroEpisodeShows.slice(0, 10).map((show) => ({
          slug: show.slug,
          title: show.title,
          primary_category: show.primary_category,
        })),
        public_category_samples: byCategory,
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
