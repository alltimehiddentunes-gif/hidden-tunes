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
  const dryRun = !process.argv.includes("--execute");
  const { data: matureShows, error } = await supabaseAdmin
    .from("podcast_shows")
    .select("id")
    .eq("is_mature", true)
    .eq("status", "approved")
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  const showIds = (matureShows || []).map((row) => row.id);
  let eligibleEpisodes = 0;
  let updatedEpisodes = 0;
  let showsWithEligible = 0;

  for (let index = 0; index < showIds.length; index += 50) {
    const chunk = showIds.slice(index, index + 50);
    const { data: episodes, error: episodeError } = await supabaseAdmin
      .from("podcast_episodes")
      .select("id, show_id, audio_url, playback_status")
      .in("show_id", chunk)
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("playback_status", "unchecked")
      .like("audio_url", "https://%");
    if (episodeError) throw new Error(episodeError.message);

    const rows = episodes || [];
    if (rows.length === 0) continue;
    eligibleEpisodes += rows.length;
    showsWithEligible += new Set(rows.map((row) => row.show_id)).size;

    if (!dryRun) {
      const ids = rows.map((row) => row.id);
      for (let offset = 0; offset < ids.length; offset += 200) {
        const idChunk = ids.slice(offset, offset + 200);
        const { error: updateError } = await supabaseAdmin
          .from("podcast_episodes")
          .update({
            playback_status: "playable",
            last_play_verified_at: new Date().toISOString(),
          })
          .in("id", idChunk);
        if (updateError) throw new Error(updateError.message);
        updatedEpisodes += idChunk.length;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        dry_run: dryRun,
        mature_public_shows: showIds.length,
        shows_with_https_unchecked_episodes: showsWithEligible,
        eligible_unchecked_https_episodes: eligibleEpisodes,
        updated_episodes: updatedEpisodes,
        note: dryRun
          ? "Dry run. Re-run with --execute to mark HTTPS unchecked episodes playable."
          : "Marked HTTPS unchecked mature episodes as playable for browse eligibility.",
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
