import { inferCategoryGenreMoodFormat } from "@/lib/tvCatalog";

export const TV_DISCOVERY_QUERY_TYPES = [
  "official_music_video",
  "live_performance",
  "full_concert",
  "documentary",
  "artist_interview",
  "visualizer",
  "acoustic_session",
  "playlist",
  "history_documentary",
] as const;

export type TvDiscoveryQueryType = (typeof TV_DISCOVERY_QUERY_TYPES)[number];

export type TvDiscoveryQueryTemplate = {
  type: TvDiscoveryQueryType;
  label: string;
  buildQuery: (seed: string) => string;
  formatHint: string | null;
  categoryHint: string | null;
};

export const TV_DISCOVERY_QUERY_TEMPLATES: TvDiscoveryQueryTemplate[] = [
  {
    type: "official_music_video",
    label: "Official music video",
    buildQuery: (seed) => `${seed} official music video`,
    formatHint: "Music Video",
    categoryHint: "Music",
  },
  {
    type: "live_performance",
    label: "Live performance",
    buildQuery: (seed) => `${seed} live performance`,
    formatHint: "Live Performances",
    categoryHint: "Music",
  },
  {
    type: "full_concert",
    label: "Full concert",
    buildQuery: (seed) => `${seed} full concert`,
    formatHint: "Live Performances",
    categoryHint: "Music",
  },
  {
    type: "documentary",
    label: "Documentary",
    buildQuery: (seed) => `${seed} documentary`,
    formatHint: "Documentaries",
    categoryHint: "Film",
  },
  {
    type: "artist_interview",
    label: "Artist interview",
    buildQuery: (seed) => `${seed} artist interview`,
    formatHint: "Interview",
    categoryHint: "Music",
  },
  {
    type: "visualizer",
    label: "Visualizer",
    buildQuery: (seed) => `${seed} visualizer`,
    formatHint: "Music Video",
    categoryHint: "Music",
  },
  {
    type: "acoustic_session",
    label: "Acoustic session",
    buildQuery: (seed) => `${seed} acoustic session`,
    formatHint: "Live Performances",
    categoryHint: "Music",
  },
  {
    type: "playlist",
    label: "Playlist",
    buildQuery: (seed) => `${seed} playlist`,
    formatHint: null,
    categoryHint: "Music",
  },
  {
    type: "history_documentary",
    label: "History documentary",
    buildQuery: (seed) => `${seed} history documentary`,
    formatHint: "Documentaries",
    categoryHint: "Education",
  },
];

export type TvDiscoveryPlanRow = {
  id: string;
  seed: string;
  query_type: TvDiscoveryQueryType;
  query_type_label: string;
  generated_query: string;
  suggested_category: string | null;
  suggested_genre: string | null;
  suggested_mood: string | null;
  suggested_format: string | null;
  target_results: number;
};

export type TvDiscoveryPlanSummary = {
  seed_count: number;
  query_type_count: number;
  plan_row_count: number;
  target_results_per_query: number;
  estimated_catalog_records: number;
};

export type TvDiscoveryDefaults = {
  default_category?: string | null;
  default_genre?: string | null;
  default_mood?: string | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function parseDiscoverySeedList(input: unknown, maxSeeds = 500) {
  const raw = typeof input === "string" ? input : "";
  const seen = new Set<string>();
  const seeds: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const cleaned = line.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    seeds.push(cleaned);
    if (seeds.length >= maxSeeds) break;
  }

  return seeds;
}

function buildPlanRowId(seed: string, queryType: TvDiscoveryQueryType) {
  return `${slugify(seed)}__${queryType}`;
}

function resolveSuggestedMetadata(
  seed: string,
  generatedQuery: string,
  template: TvDiscoveryQueryTemplate,
  defaults: TvDiscoveryDefaults
) {
  const inferred = inferCategoryGenreMoodFormat(generatedQuery, null, {
    category: defaults.default_category || template.categoryHint,
    genre: defaults.default_genre || seed,
    mood: defaults.default_mood,
  });

  return {
    suggested_category:
      inferred.category || defaults.default_category || template.categoryHint || null,
    suggested_genre: inferred.genre || defaults.default_genre || seed || null,
    suggested_mood: inferred.mood || defaults.default_mood || null,
    suggested_format: inferred.format || template.formatHint || null,
  };
}

export function generateTvDiscoveryPlan(
  seeds: string[],
  targetResultsPerQuery = 50,
  defaults: TvDiscoveryDefaults = {}
) {
  const safeTarget = Math.min(500, Math.max(1, Math.floor(targetResultsPerQuery)));
  const rows: TvDiscoveryPlanRow[] = [];

  for (const seed of seeds) {
    for (const template of TV_DISCOVERY_QUERY_TEMPLATES) {
      const generatedQuery = template.buildQuery(seed).trim();
      const metadata = resolveSuggestedMetadata(
        seed,
        generatedQuery,
        template,
        defaults
      );

      rows.push({
        id: buildPlanRowId(seed, template.type),
        seed,
        query_type: template.type,
        query_type_label: template.label,
        generated_query: generatedQuery,
        suggested_category: metadata.suggested_category,
        suggested_genre: metadata.suggested_genre,
        suggested_mood: metadata.suggested_mood,
        suggested_format: metadata.suggested_format,
        target_results: safeTarget,
      });
    }
  }

  const summary: TvDiscoveryPlanSummary = {
    seed_count: seeds.length,
    query_type_count: TV_DISCOVERY_QUERY_TEMPLATES.length,
    plan_row_count: rows.length,
    target_results_per_query: safeTarget,
    estimated_catalog_records: rows.length * safeTarget,
  };

  return { rows, summary };
}

export function buildDiscoveryPlanCsv(rows: TvDiscoveryPlanRow[]) {
  const headers = [
    "seed",
    "query_type",
    "generated_query",
    "suggested_category",
    "suggested_genre",
    "suggested_mood",
    "suggested_format",
    "target_results",
  ];

  const escapeCsv = (value: string | number | null | undefined) => {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.seed,
        row.query_type,
        row.generated_query,
        row.suggested_category,
        row.suggested_genre,
        row.suggested_mood,
        row.suggested_format,
        row.target_results,
      ]
        .map(escapeCsv)
        .join(",")
    ),
  ];

  return lines.join("\n");
}

export function buildDiscoveryQueriesText(rows: TvDiscoveryPlanRow[]) {
  return rows.map((row) => row.generated_query).join("\n");
}

export function buildDiscoveryPlaceholderSourceUrl(row: TvDiscoveryPlanRow) {
  const slug = slugify(`${row.seed}-${row.query_type}-${row.generated_query}`);
  return `manual://tv-discovery/${slug}`;
}

export function buildDiscoverySourceTitle(row: TvDiscoveryPlanRow) {
  return `Discovery: ${row.seed} · ${row.query_type_label}`;
}

export type TvDiscoverySourcePlaceholder = {
  source_type: "manual";
  source_url: string;
  source_id: string | null;
  title: string;
  default_category: string | null;
  default_genre: string | null;
  default_mood: string | null;
  scan_frequency: "manual";
  auto_approve: boolean;
  is_active: boolean;
  discovery_query: string;
  discovery_seed: string;
};

export function buildDiscoverySourcePlaceholder(
  row: TvDiscoveryPlanRow,
  autoApprove = false
): TvDiscoverySourcePlaceholder {
  return {
    source_type: "manual",
    source_url: buildDiscoveryPlaceholderSourceUrl(row),
    source_id: row.id,
    title: buildDiscoverySourceTitle(row),
    default_category: row.suggested_category,
    default_genre: row.suggested_genre,
    default_mood: row.suggested_mood,
    scan_frequency: "manual",
    auto_approve: autoApprove,
    is_active: true,
    discovery_query: row.generated_query,
    discovery_seed: row.seed,
  };
}
