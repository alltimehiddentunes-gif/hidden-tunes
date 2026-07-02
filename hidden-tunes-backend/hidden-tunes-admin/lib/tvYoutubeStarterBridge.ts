import fs from "node:fs";
import path from "node:path";

import { mapTvCategories } from "@/lib/tvCategoryMapper";
import type { TvGrowthCandidate } from "@/lib/tvStationHealth";

const STARTER_SQL_PATH = path.resolve(
  process.cwd(),
  "supabase/seeds/tv_starter_catalog.sql"
);

type StarterRow = {
  source_id: string;
  source_url: string;
  embed_url: string;
  title: string;
  thumbnail_url: string;
  channel_name: string;
  category: string;
  genre: string;
  mood: string;
  format: string;
  tags: string[];
  is_featured: boolean;
};

function unquoteSqlString(value: string) {
  return value.replace(/\\'/g, "'");
}

function parseQuotedStrings(segment: string) {
  const matches = [...segment.matchAll(/'((?:\\'|[^'])*)'/g)];
  return matches.map((match) => unquoteSqlString(match[1]));
}

export function parseStarterSql(source: string) {
  const rows: StarterRow[] = [];
  const segments = source.split(/'youtube_video',\s*/);

  for (const segment of segments.slice(1)) {
    const strings = parseQuotedStrings(segment);
    if (strings.length < 11) continue;

    const tagsMatch = segment.match(/array\[([^\]]*)\]/);
    const tags = tagsMatch
      ? tagsMatch[1]
          .split(",")
          .map((tag) => tag.trim().replace(/^'|'$/g, ""))
          .filter(Boolean)
      : [];

    const featuredMatch = segment.match(/'playable',\s*true,\s*(true|false)/);
    const isFeatured = featuredMatch?.[1] === "true";

    rows.push({
      source_id: strings[0],
      source_url: strings[1],
      embed_url: strings[2],
      title: strings[3],
      thumbnail_url: strings[4],
      channel_name: strings[5],
      category: strings[6],
      genre: strings[7],
      mood: strings[8],
      format: strings[9],
      tags,
      is_featured: isFeatured,
    });
  }

  return rows;
}

export function loadYoutubeStarterRows() {
  if (!fs.existsSync(STARTER_SQL_PATH)) return [];
  return parseStarterSql(fs.readFileSync(STARTER_SQL_PATH, "utf8"));
}

export function youtubeStarterRowsToCandidates(rows = loadYoutubeStarterRows()) {
  const candidates: TvGrowthCandidate[] = [];

  for (const row of rows) {
    const mapped = mapTvCategories({
      title: row.title,
      seedCategory: row.category.toLowerCase(),
      genre: row.genre,
      mood: row.mood,
      format: row.format,
      extraTags: row.tags,
      isFeatured: row.is_featured,
    });

    candidates.push({
      source_type: "youtube_video",
      source_id: row.source_id,
      source_url: row.source_url,
      embed_url: row.embed_url,
      title: row.title,
      channel_name: row.channel_name,
      thumbnail_url: row.thumbnail_url,
      description: null,
      category: mapped.primary,
      categories: mapped.all,
      genre: row.genre,
      mood: row.mood,
      format: row.format,
      language: "English",
      tags: [...new Set([...mapped.all, ...row.tags])],
      is_featured: row.is_featured,
      source_key: `youtube:${row.source_id}`,
    });
  }

  return candidates;
}
