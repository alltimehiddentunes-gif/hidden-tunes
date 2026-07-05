export {};

export {};

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const BASE = "https://admin.hiddentunes.com";

const CATEGORIES = [
  "sports",
  "music",
  "society-culture",
  "science",
  "history",
  "education",
  "faith",
  "news",
  "comedy",
  "business",
  "technology",
  "health",
  "true-crime",
] as const;

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

async function fetchCategoryTotal(category: string) {
  const response = await fetch(
    `${BASE}/api/podcasts/episodes?category=${encodeURIComponent(category)}&limit=1`,
    { signal: AbortSignal.timeout(25_000) }
  );
  const body = await response.json().catch(() => ({}));
  return {
    status: response.status,
    total: Number(body?.pagination?.total || 0),
  };
}

async function main() {
  const { buildShowCategoryOrFilter } = await import("../lib/podcastCatalog");
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");

  const live: Record<string, { status: number; total: number }> = {};
  const db: Record<string, { shows: number; episodes: number }> = {};

  for (const category of CATEGORIES) {
    live[category] = await fetchCategoryTotal(category);

    const { data: showRows, error: showError } = await supabaseAdmin
      .from("podcast_shows")
      .select("id")
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("feed_status", "active")
      .eq("is_mature", false)
      .or(buildShowCategoryOrFilter(category));

    if (showError) throw new Error(showError.message);

    const showIds = (showRows || []).map((row) => String(row.id));
    let episodeCount = 0;

    if (showIds.length > 0) {
      const { count, error: episodeError } = await supabaseAdmin
        .from("podcast_episodes")
        .select("id", { count: "exact", head: true })
        .in("show_id", showIds)
        .eq("status", "approved")
        .eq("is_active", true)
        .eq("playback_status", "playable");

      if (episodeError) throw new Error(episodeError.message);
      episodeCount = count || 0;
    }

    db[category] = { shows: showIds.length, episodes: episodeCount };
  }

  const empty = CATEGORIES.filter(
    (category) => live[category].total === 0 || db[category].episodes === 0
  );

  console.log(
    JSON.stringify(
      {
        live_api: live,
        database: db,
        empty_categories: empty,
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
