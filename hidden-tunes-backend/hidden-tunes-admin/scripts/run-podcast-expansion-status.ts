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
  const { getPodcastMassExpansionCounts, computeExpansionRemaining } = await import(
    "../lib/podcastMassExpansionStatus"
  );
  const { loadPodcastMassExpansionState } = await import("../lib/podcastMassExpansionCheckpoint");
  const {
    PODCAST_EXPANSION_TARGET_MATURE,
    PODCAST_EXPANSION_TARGET_STANDARD,
  } = await import("../lib/podcastExpansionConstants");
  const baselineShows = 402;

  const [counts, state] = await Promise.all([
    getPodcastMassExpansionCounts(),
    Promise.resolve(loadPodcastMassExpansionState(adminRoot)),
  ]);

  const remaining = computeExpansionRemaining(counts, {
    standard: state?.targets.standard || PODCAST_EXPANSION_TARGET_STANDARD,
    mature: state?.targets.mature || PODCAST_EXPANSION_TARGET_MATURE,
  });

  const [shows, episodes, pendingShows, pendingEpisodes, publicShows, publicEpisodes] =
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

  const batch3Result = path.join(adminRoot, "data/podcast-expansion-batch3-result.json");
  let batch3Status = "not_started";
  if (fs.existsSync(batch3Result)) {
    const result = JSON.parse(fs.readFileSync(batch3Result, "utf8"));
    batch3Status = result.dry_run ? "dry_run_only" : result.finished_at ? "complete" : "running";
  }

  console.log(
    JSON.stringify(
      {
        mass_expansion: {
          state: state
            ? {
                status: state.status,
                batch_number: state.batch_number,
                active_source_key: state.active_source_key,
                exhausted_sources: state.exhausted_sources,
              }
            : null,
          targets: {
            standard: state?.targets.standard || PODCAST_EXPANSION_TARGET_STANDARD,
            mature: state?.targets.mature || PODCAST_EXPANSION_TARGET_MATURE,
          },
          counts,
          remaining,
        },
        database: {
          shows: shows.count || 0,
          episodes: episodes.count || 0,
          pending_shows: pendingShows.count || 0,
          pending_episodes: pendingEpisodes.count || 0,
          public_shows: publicShows.count || 0,
          public_episodes: publicEpisodes.count || 0,
        },
        batch3: {
          status: batch3Status,
          shows_since_baseline: (shows.count || 0) - baselineShows,
          target: 500,
        },
      },
      null,
      2
    )
  );
}

void main();
