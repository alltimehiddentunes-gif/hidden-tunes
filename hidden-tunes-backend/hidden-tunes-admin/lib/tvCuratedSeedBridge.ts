import fs from "node:fs";
import path from "node:path";

import { mapTvCategories } from "@/lib/tvCategoryMapper";
import type { TvGrowthCandidate } from "@/lib/tvStationHealth";

type CuratedHlsSeed = {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  streamUrl: string;
  country?: string;
  language?: string;
  category?: string;
  isFeatured?: boolean;
};

const SEED_JSON_PATH = path.resolve(
  process.cwd(),
  "data/tv-curated-hls-seeds.json"
);

export function loadCuratedHlsSeeds(): CuratedHlsSeed[] {
  if (!fs.existsSync(SEED_JSON_PATH)) return [];
  return JSON.parse(fs.readFileSync(SEED_JSON_PATH, "utf8")) as CuratedHlsSeed[];
}

export function curatedHlsSeedsToCandidates(seeds = loadCuratedHlsSeeds()) {
  const candidates: TvGrowthCandidate[] = [];

  for (const seed of seeds) {
    const mapped = mapTvCategories({
      title: seed.name,
      seedCategory: seed.category || null,
      country: seed.country || null,
      isFeatured: seed.isFeatured,
    });

    candidates.push({
      source_type: "hls_stream",
      source_id: `curated-${seed.id}`,
      source_url: seed.streamUrl,
      title: seed.name,
      channel_name: seed.name,
      thumbnail_url: seed.logoUrl || null,
      description: seed.description || null,
      category: mapped.primary,
      categories: mapped.all,
      genre: mapped.all.find((label) =>
        ["Hip Hop", "R&B", "Pop", "Rock", "Jazz", "Classical", "EDM", "Afrobeats", "Amapiano"].includes(
          label
        )
      ) || null,
      country: seed.country || null,
      region: seed.country || null,
      language: seed.language || null,
      tags: mapped.all,
      is_featured: seed.isFeatured === true,
      source_key: `curated:${seed.id}`,
    });
  }

  return candidates;
}
