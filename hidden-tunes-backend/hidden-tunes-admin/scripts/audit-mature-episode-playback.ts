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

async function main() {
  const { data: shows, error } = await supabaseAdmin
    .from("podcast_shows")
    .select("id")
    .eq("is_mature", true)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("feed_status", "active");
  if (error) throw new Error(error.message);

  const showIds = (shows || []).map((row) => row.id);
  const statusCounts: Record<string, number> = {};
  let withHttpsAudio = 0;
  let totalEpisodes = 0;

  for (let index = 0; index < showIds.length; index += 40) {
    const chunk = showIds.slice(index, index + 40);
    const { data: episodes, error: episodeError } = await supabaseAdmin
      .from("podcast_episodes")
      .select("playback_status, audio_url")
      .in("show_id", chunk);
    if (episodeError) throw new Error(episodeError.message);
    for (const episode of episodes || []) {
      totalEpisodes += 1;
      const status = String(episode.playback_status || "null");
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      if (String(episode.audio_url || "").startsWith("https://")) withHttpsAudio += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        public_mature_shows: showIds.length,
        total_episodes_on_public_mature_shows: totalEpisodes,
        https_audio_urls: withHttpsAudio,
        playback_status_counts: statusCounts,
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
