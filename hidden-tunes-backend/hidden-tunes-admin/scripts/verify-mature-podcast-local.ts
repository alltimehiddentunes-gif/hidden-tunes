export {};

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export {};

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
  const {
    listMaturePodcastCategories,
    listMaturePodcastEpisodes,
    matureGateEnabled,
  } = await import("../lib/podcastMatureCatalog");
  const { applyPublicShowFilters } = await import("../lib/podcastCatalog");
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");

  const gateClosed = matureGateEnabled({
    mature_enabled: "false",
    age_confirmed: "false",
  });
  const gateOpen = matureGateEnabled({
    mature_enabled: "true",
    age_confirmed: "true",
  });

  const matureCategories = await listMaturePodcastCategories();
  const matureEpisodes = await listMaturePodcastEpisodes({
    category: "mature-comedy",
    page: 1,
    limit: 3,
  });

  const { data: comedyShows } = await applyPublicShowFilters(
    supabaseAdmin.from("podcast_shows").select("id, slug, title"),
    { category: "comedy", includeMature: false }
  );

  const { data: searchRows } = await applyPublicShowFilters(
    supabaseAdmin.from("podcast_shows").select("id, slug, title"),
    { includeMature: false, searchQuery: "whoreible" }
  );

  console.log(
    JSON.stringify(
      {
        gate_closed: gateClosed,
        gate_open: gateOpen,
        mature_categories: matureCategories.map((category) => ({
          slug: category.slug,
          item_count: category.item_count,
        })),
        mature_comedy_episodes: matureEpisodes.items.map((episode) => ({
          id: episode.id,
          title: episode.title,
          has_audio_url: "audio_url" in (episode as object),
        })),
        normal_comedy_show_slugs: (comedyShows || []).map(
          (show: { slug?: string | null }) => show.slug
        ),
        normal_search_whoreible_hits: (searchRows || []).map(
          (show: { slug?: string | null }) => show.slug
        ),
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
