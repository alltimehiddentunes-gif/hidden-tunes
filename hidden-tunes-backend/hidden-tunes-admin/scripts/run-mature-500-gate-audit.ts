import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getPodcastMassExpansionCounts } from "@/lib/podcastMassExpansionStatus";
import { loadPodcastMassExpansionState } from "@/lib/podcastMassExpansionCheckpoint";
import {
  loadPodcastSourceRegistry,
  parseSourceCursor,
  PODCAST_EXPANSION_ITUNES_COUNTRIES,
  PODCAST_MATURE_ITUNES_QUERIES,
} from "@/lib/podcastSourceRegistry";
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

async function exactCount(
  apply: (query: ReturnType<typeof supabaseAdmin.from>) => {
    then?: unknown;
  }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabaseAdmin
    .from("podcast_shows")
    .select("id", { count: "exact", head: true });
  query = apply(query);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count || 0;
}

const FALSE_POSITIVE_HINT =
  /\b(adult education|adult contemporary|mind pump|fitness truth|language learning|adhd women's wellbeing|how to be 60|mindset mentor)\b/i;

async function main() {
  const counts = await getPodcastMassExpansionCounts();
  const state = loadPodcastMassExpansionState(adminRoot);
  const registry = loadPodcastSourceRegistry(adminRoot);
  const matureSource = registry.find((entry) => entry.source_key === "itunes:mature");
  const cursor = parseSourceCursor(matureSource?.checkpoint_cursor || "0:0:0");

  const maturePending = await exactCount((q) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q as any).eq("is_mature", true).eq("status", "pending")
  );
  const matureQuarantined = await exactCount((q) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q as any).eq("is_mature", true).not("quarantined_at", "is", null)
  );
  const matureRejected = await exactCount((q) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q as any).eq("is_mature", true).eq("status", "rejected")
  );

  const { data: recentMature, error: recentError } = await supabaseAdmin
    .from("podcast_shows")
    .select(
      "id, slug, title, publisher, language, feed_url, is_mature, mature_category, primary_category, categories, episode_count, status, is_active, feed_status, artwork_url, source_type, created_at"
    )
    .eq("is_mature", true)
    .eq("status", "approved")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(25);
  if (recentError) throw new Error(recentError.message);

  const sample = recentMature || [];
  const sampleIds = sample.map((row) => row.id);
  const playableByShow: Record<string, number> = {};

  if (sampleIds.length > 0) {
    const { data: episodes } = await supabaseAdmin
      .from("podcast_episodes")
      .select("show_id")
      .in("show_id", sampleIds)
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("playback_status", "playable");

    for (const episode of episodes || []) {
      const showId = String(episode.show_id || "");
      playableByShow[showId] = (playableByShow[showId] || 0) + 1;
    }
  }

  const sampleReview = sample.map((show) => {
    const title = String(show.title || "");
    const playable = playableByShow[show.id] || 0;
    const flags: string[] = [];
    if (!show.feed_url) flags.push("missing_feed_url");
    if (!show.is_mature) flags.push("not_marked_mature");
    if (playable <= 0) flags.push("no_playable_episodes");
    if (!show.artwork_url) flags.push("missing_artwork");
    if (FALSE_POSITIVE_HINT.test(title)) flags.push("possible_false_positive_title");
    if (Number(show.episode_count || 0) <= 0) flags.push("zero_episode_count");
    return {
      id: show.id,
      slug: show.slug,
      title,
      publisher: show.publisher,
      language: show.language,
      feed_url: show.feed_url,
      mature_category: show.mature_category,
      primary_category: show.primary_category,
      episode_count: show.episode_count,
      playable_episodes: playable,
      artwork_present: Boolean(show.artwork_url),
      source_type: show.source_type,
      public_status:
        show.status === "approved" && show.is_active && show.feed_status === "active",
      flags,
    };
  });

  console.log(
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        counts: {
          mature_shows_total: counts.mature_shows,
          public_mature_shows: counts.public_mature_shows,
          public_episodes: counts.public_episodes,
          mature_pending: maturePending,
          mature_quarantined: matureQuarantined,
          mature_rejected: matureRejected,
        },
        checkpoint: {
          status: state?.status || null,
          batch_number: state?.batch_number || null,
          targets: state?.targets || null,
          itunes_mature_cursor: matureSource?.checkpoint_cursor || null,
          query_index: cursor.queryIndex,
          country_index: cursor.languageIndex,
          offset: cursor.offset,
          current_query: PODCAST_MATURE_ITUNES_QUERIES[cursor.queryIndex] || null,
          current_storefront:
            PODCAST_EXPANSION_ITUNES_COUNTRIES[
              cursor.languageIndex % PODCAST_EXPANSION_ITUNES_COUNTRIES.length
            ] || null,
        },
        sample_size: sampleReview.length,
        sample_with_flags: sampleReview.filter((row) => row.flags.length > 0).length,
        sample_without_playable: sampleReview.filter((row) => row.playable_episodes <= 0)
          .length,
        sample: sampleReview,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
