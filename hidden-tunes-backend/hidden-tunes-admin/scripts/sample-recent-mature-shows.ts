import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

const FALSE_POSITIVE_HINT =
  /\b(adult education|adult contemporary|mind pump|fitness truth|language learning|mindset mentor|how to be 60)\b/i;

async function main() {
  const { data: shows, error } = await supabaseAdmin
    .from("podcast_shows")
    .select(
      "id, slug, title, publisher, language, feed_url, is_mature, mature_category, primary_category, episode_count, status, is_active, feed_status, artwork_url, created_at"
    )
    .eq("is_mature", true)
    .eq("status", "approved")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) throw new Error(error.message);

  const ids = (shows || []).map((row) => row.id);
  const playableByShow: Record<string, number> = {};
  if (ids.length) {
    const { data: episodes } = await supabaseAdmin
      .from("podcast_episodes")
      .select("show_id")
      .in("show_id", ids)
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("playback_status", "playable");
    for (const episode of episodes || []) {
      const showId = String(episode.show_id || "");
      playableByShow[showId] = (playableByShow[showId] || 0) + 1;
    }
  }

  const sample = (shows || []).map((show) => {
    const title = String(show.title || "");
    const playable = playableByShow[show.id] || 0;
    const flags: string[] = [];
    if (!show.feed_url) flags.push("missing_feed");
    if (playable <= 0) flags.push("no_playable");
    if (!show.artwork_url) flags.push("missing_artwork");
    if (FALSE_POSITIVE_HINT.test(title)) flags.push("possible_false_positive");
    if (Number(show.episode_count || 0) <= 0) flags.push("zero_episodes");
    return {
      title,
      publisher: show.publisher,
      language: show.language,
      mature_category: show.mature_category,
      episode_count: show.episode_count,
      playable,
      public: show.status === "approved" && show.is_active && show.feed_status === "active",
      flags,
    };
  });

  const zeroEpisodeShows = await supabaseAdmin
    .from("podcast_shows")
    .select("id", { count: "exact", head: true })
    .eq("is_mature", true)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("episode_count", 0);

  console.log(
    JSON.stringify(
      {
        sample_size: sample.length,
        flagged: sample.filter((row) => row.flags.length > 0).length,
        no_playable: sample.filter((row) => row.playable <= 0).length,
        possible_false_positives: sample.filter((row) =>
          row.flags.includes("possible_false_positive")
        ).length,
        approved_mature_zero_episode_count: zeroEpisodeShows.count || 0,
        sample,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
