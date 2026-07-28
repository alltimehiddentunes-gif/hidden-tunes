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

const FALSE_POSITIVE_TITLES = [
  "ADHD Women's Wellbeing Podcast",
  "Women & ADHD",
  "EXPANDED Podcast by To Be Magnetic™",
  "Soberly Speaking",
  "Maintenance Phase",
  "Joint Dynamics Podcast - The Intelligent Movement Series",
  "We're All Insane",
];

function looksFalsePositive(title: string, primaryCategory: string | null) {
  const haystack = `${title} ${primaryCategory || ""}`.toLowerCase();
  if (
    /\b(adhd|maintenance phase|mind pump|fitness|yoga|nutrition|biohack|mindset mentor|joint dynamics|expanded podcast|soberly speaking)\b/i.test(
      haystack
    )
  ) {
    return true;
  }
  if (FALSE_POSITIVE_TITLES.includes(title)) return true;
  return false;
}

async function main() {
  const dryRun = !process.argv.includes("--execute");
  const { data: shows, error } = await supabaseAdmin
    .from("podcast_shows")
    .select("id, title, primary_category, episode_count, status, is_active, feed_status")
    .eq("is_mature", true)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("feed_status", "active")
    .order("created_at", { ascending: false })
    .limit(600);
  if (error) throw new Error(error.message);

  const showIds = (shows || []).map((row) => row.id);
  const playableByShow: Record<string, number> = {};

  for (let index = 0; index < showIds.length; index += 100) {
    const chunk = showIds.slice(index, index + 100);
    const { data: episodes } = await supabaseAdmin
      .from("podcast_episodes")
      .select("show_id")
      .in("show_id", chunk)
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("playback_status", "playable");
    for (const episode of episodes || []) {
      const showId = String(episode.show_id || "");
      playableByShow[showId] = (playableByShow[showId] || 0) + 1;
    }
  }

  const quarantineCandidates = (shows || []).filter((show) =>
    looksFalsePositive(String(show.title || ""), show.primary_category)
  );

  const quarantineIds = quarantineCandidates.map((show) => show.id);

  let updated = 0;
  if (!dryRun && quarantineIds.length > 0) {
    const { error: updateError } = await supabaseAdmin
      .from("podcast_shows")
      .update({
        is_active: false,
        feed_status: "inactive",
      })
      .in("id", quarantineIds);
    if (updateError) throw new Error(updateError.message);
    updated = quarantineIds.length;
  }

  console.log(
    JSON.stringify(
      {
        dry_run: dryRun,
        public_mature_examined: (shows || []).length,
        false_positive_candidates: quarantineCandidates.length,
        quarantine_target_ids: quarantineIds.length,
        updated,
        sample_false_positives: quarantineCandidates.slice(0, 20).map((show) => show.title),
        note: dryRun
          ? "Dry run only. Re-run with --execute to quarantine false positives."
          : "Quarantined false-positive mature shows only.",
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
