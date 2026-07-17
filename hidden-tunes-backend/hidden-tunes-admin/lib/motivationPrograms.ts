import {
  MOTIVATION_DEFAULT_PAGE_SIZE,
  MOTIVATION_MAX_PAGE_SIZE,
  MOTIVATION_PUBLIC_SELECT,
  applyPublicMotivationFilters,
  buildMotivationPagination,
  cleanMotivationFilter,
  isValidMotivationUuid,
  parsePositiveInt,
  toMotivationPublicItem,
} from "@/lib/motivationCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanText } from "@/lib/tvCatalog";

export const MOTIVATION_PROGRAM_PUBLIC_SELECT =
  "id, slug, title, subtitle, description, creator_id, category_id, category_slug, artwork_url, banner_url, language_code, country_code, content_rating, program_type, session_count, total_duration_seconds, published_at, is_featured, is_public, is_active, status, rights_status";

export const MOTIVATION_PROGRAM_ITEM_SELECT =
  `${MOTIVATION_PUBLIC_SELECT}, program_id, creator_id, season_number, episode_number, sort_order, media_type, verification_status, is_public`;

export const MOTIVATION_PROGRAM_ORDER =
  "season_number.asc.nullsfirst,episode_number.asc.nullsfirst,sort_order.asc,published_at.asc.nullslast,id.asc";

export type MotivationProgramRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  creator_id: string | null;
  category_slug: string | null;
  artwork_url: string | null;
  banner_url: string | null;
  language_code: string | null;
  country_code: string | null;
  content_rating: string | null;
  program_type: string;
  session_count: number;
  total_duration_seconds: number;
  published_at: string | null;
  is_featured: boolean;
};

export function toMotivationProgramPublic(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    slug: cleanText(row.slug, 160),
    title: String(row.title || "Untitled Program"),
    subtitle: cleanText(row.subtitle, 240),
    description: cleanText(row.description, 4000),
    creator_id: cleanText(row.creator_id, 80),
    category_slug: cleanText(row.category_slug, 120),
    artwork_url: cleanText(row.artwork_url, 2000) || cleanText(row.banner_url, 2000),
    language_code: cleanText(row.language_code, 16),
    country_code: cleanText(row.country_code, 16),
    content_rating: cleanText(row.content_rating, 40) || "general",
    program_type: cleanText(row.program_type, 80) || "standalone_collection",
    session_count: Math.max(0, Number(row.session_count || 0)),
    total_duration_seconds: Math.max(0, Number(row.total_duration_seconds || 0)),
    published_at: cleanText(row.published_at, 40),
    is_featured: row.is_featured === true,
  };
}

export function toMotivationSessionPublic(row: Record<string, unknown>) {
  const base = toMotivationPublicItem(row);
  return {
    ...base,
    program_id: cleanText(row.program_id, 80),
    creator_id: cleanText(row.creator_id, 80),
    season_number:
      row.season_number == null ? null : Math.max(0, Number(row.season_number)),
    episode_number:
      row.episode_number == null ? null : Math.max(0, Number(row.episode_number)),
    sort_order: Math.max(0, Number(row.sort_order || 0)),
    media_type: cleanText(row.media_type, 40) || "audio",
    verification_status: cleanText(row.verification_status, 40) || "ready",
  };
}

function applyPublicProgramFilters(query: any) {
  return query
    .eq("is_public", true)
    .eq("is_active", true)
    .eq("status", "published")
    .in("rights_status", ["approved", "licensed", "authorized"]);
}

export async function listMotivationPrograms(options: {
  page: number;
  limit: number;
  categorySlug?: string | null;
  featuredOnly?: boolean;
  languageCode?: string | null;
  countryCode?: string | null;
}) {
  const from = (options.page - 1) * options.limit;
  const to = from + options.limit - 1;

  let query = applyPublicProgramFilters(
    supabaseAdmin.from("motivation_programs").select(MOTIVATION_PROGRAM_PUBLIC_SELECT, {
      count: "exact",
    })
  )
    .order("is_featured", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("title", { ascending: true });

  if (options.featuredOnly) query = query.eq("is_featured", true);
  if (options.categorySlug) query = query.eq("category_slug", options.categorySlug);
  if (options.languageCode) query = query.eq("language_code", options.languageCode);
  if (options.countryCode) query = query.eq("country_code", options.countryCode);

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  return {
    programs: ((data || []) as Record<string, unknown>[]).map(toMotivationProgramPublic),
    pagination: buildMotivationPagination(options.page, options.limit, count || 0),
  };
}

export async function loadMotivationProgram(idOrSlug: string) {
  const cleaned = String(idOrSlug || "").trim();
  if (!cleaned) return null;

  let query = applyPublicProgramFilters(
    supabaseAdmin.from("motivation_programs").select(MOTIVATION_PROGRAM_PUBLIC_SELECT)
  );

  query = isValidMotivationUuid(cleaned) ? query.eq("id", cleaned) : query.eq("slug", cleaned);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return toMotivationProgramPublic(data as Record<string, unknown>);
}

export async function listMotivationProgramItems(options: {
  programId: string;
  page: number;
  limit: number;
}) {
  const from = (options.page - 1) * options.limit;
  const to = from + options.limit - 1;

  let query = applyPublicMotivationFilters(
    supabaseAdmin
      .from("motivation_items")
      .select(MOTIVATION_PROGRAM_ITEM_SELECT, { count: "exact" })
      .eq("program_id", options.programId),
    {}
  )
    .order("season_number", { ascending: true, nullsFirst: true })
    .order("episode_number", { ascending: true, nullsFirst: true })
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  return {
    items: ((data || []) as Record<string, unknown>[]).map(toMotivationSessionPublic),
    pagination: buildMotivationPagination(options.page, options.limit, count || 0),
  };
}

export async function loadStandaloneProgramFromItem(itemId: string) {
  const cleaned = String(itemId || "").trim();
  if (!isValidMotivationUuid(cleaned)) return null;

  const { data, error } = await applyPublicMotivationFilters(
    supabaseAdmin.from("motivation_items").select(MOTIVATION_PROGRAM_ITEM_SELECT),
    {}
  )
    .eq("id", cleaned)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const item = toMotivationSessionPublic(data as Record<string, unknown>);
  return {
    program: {
      id: item.id,
      slug: item.slug || item.id,
      title: item.title,
      subtitle: item.subcategory || item.category || null,
      description: item.description,
      creator_id: item.creator_id,
      category_slug: item.category_slug,
      artwork_url: item.artwork,
      language_code: item.language,
      country_code: item.country,
      content_rating: "general",
      program_type: "standalone_collection",
      session_count: 1,
      total_duration_seconds: item.duration_seconds || 0,
      published_at: item.published_at,
      is_featured: item.is_featured,
    },
    items: [item],
    pagination: buildMotivationPagination(1, 1, 1),
    standalone: true as const,
  };
}

export async function resolveMotivationProgramBundle(idOrSlug: string) {
  const program = await loadMotivationProgram(idOrSlug);
  if (program) {
    const items = await listMotivationProgramItems({
      programId: program.id,
      page: 1,
      limit: MOTIVATION_DEFAULT_PAGE_SIZE,
    });
    return { program, ...items, standalone: false as const };
  }

  if (isValidMotivationUuid(idOrSlug)) {
    return loadStandaloneProgramFromItem(idOrSlug);
  }

  return null;
}

export function parseMotivationListParams(searchParams: URLSearchParams) {
  return {
    page: parsePositiveInt(searchParams.get("page"), 1, 10_000),
    limit: parsePositiveInt(
      searchParams.get("limit"),
      MOTIVATION_DEFAULT_PAGE_SIZE,
      MOTIVATION_MAX_PAGE_SIZE
    ),
    categorySlug: cleanMotivationFilter(searchParams.get("category")),
    featuredOnly: searchParams.get("featured") === "true",
    languageCode: cleanMotivationFilter(searchParams.get("language")),
    countryCode: cleanMotivationFilter(searchParams.get("country")),
  };
}

export type MotivationCategoryProgramSummary = {
  program_id: string | null;
  title: string;
  speaker: string | null;
  organization: string | null;
  artwork_url: string | null;
  episode_count: number;
  category_slug: string | null;
  first_item_id: string;
  media_type: string;
  source: string | null;
  series_title: string | null;
  volume_count: number;
};

function toCategoryProgramSummary(row: Record<string, unknown>): MotivationCategoryProgramSummary {
  return {
    program_id: cleanText(row.program_id, 80),
    title: String(row.title || "Untitled"),
    speaker: cleanText(row.speaker, 200),
    organization: cleanText(row.organization, 200),
    artwork_url: cleanText(row.artwork_url, 2000),
    episode_count: Math.max(0, Number(row.episode_count || 0)),
    category_slug: cleanText(row.category_slug, 120),
    first_item_id: String(row.first_item_id || ""),
    media_type: cleanText(row.media_type, 40) || "audio",
    source: cleanText(row.source, 80),
    series_title: cleanText(row.series_title, 240),
    volume_count: Math.max(1, Number(row.volume_count || 1)),
  };
}

const PROGRAM_TITLE_SPLIT_RE = /\s+[—–-]\s+/;

function programTitleFromItemTitle(title: string) {
  const cleaned = String(title || "").trim();
  const parts = cleaned.split(PROGRAM_TITLE_SPLIT_RE);
  if (parts.length >= 2 && parts[0].trim().length >= 3) return parts[0].trim();
  return cleaned || "Untitled";
}

function programKeyFromItemRow(row: Record<string, unknown>) {
  const programId = cleanText(row.program_id, 80);
  if (programId) return `program:${programId}`;
  const identity = cleanText(row.program_identity_key, 240);
  if (identity) return `identity:${identity}`;
  const title = programTitleFromItemTitle(String(row.title || "")).toLowerCase();
  const speaker = String(row.speaker_name || row.channel_name || "")
    .trim()
    .toLowerCase();
  return `title:${title}|speaker:${speaker}`;
}

type CachedCategoryPrograms = {
  at: number;
  programs: MotivationCategoryProgramSummary[];
};

const CATEGORY_PROGRAM_SUMMARY_CACHE_TTL_MS = 5 * 60_000;
const categoryProgramSummaryCache = new Map<string, CachedCategoryPrograms>();

const CATEGORY_PROGRAM_LIGHT_SELECT =
  "id, title, program_id, program_identity_key, speaker_name, channel_name, thumbnail_url, media_type, source_type, category_slug, season_number, is_featured, sort_order, published_at";

async function buildCategoryProgramSummariesFromItems(categorySlug: string) {
  const pageSize = 1000;
  let from = 0;
  const buckets = new Map<
    string,
    {
      program_id: string | null;
      title: string;
      speaker: string | null;
      artwork_url: string | null;
      first_item_id: string;
      episode_count: number;
      category_slug: string | null;
      media_type: string;
      source: string | null;
      volumeSeasons: Set<number | null>;
      is_featured: boolean;
      sort_order: number;
      published_at: string | null;
    }
  >();

  while (from < 100_000) {
    const { data, error } = await applyPublicMotivationFilters(
      supabaseAdmin.from("motivation_items").select(CATEGORY_PROGRAM_LIGHT_SELECT),
      { categorySlug }
    )
      .order("sort_order", { ascending: false })
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as Record<string, unknown>[];
    if (!rows.length) break;

    for (const row of rows) {
      const key = programKeyFromItemRow(row);
      const title = programTitleFromItemTitle(String(row.title || ""));
      const speaker =
        cleanText(row.speaker_name, 200) || cleanText(row.channel_name, 200);
      const sortOrder = Math.max(0, Number(row.sort_order || 0));
      const season =
        row.season_number == null || Number.isNaN(Number(row.season_number))
          ? null
          : Math.max(0, Number(row.season_number));
      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, {
          program_id: cleanText(row.program_id, 80),
          title,
          speaker,
          artwork_url: cleanText(row.thumbnail_url, 2000),
          first_item_id: String(row.id || ""),
          episode_count: 1,
          category_slug: cleanText(row.category_slug, 120) || categorySlug,
          media_type: cleanText(row.media_type, 40) || "audio",
          source: cleanText(row.source_type, 80),
          volumeSeasons: new Set([season]),
          is_featured: row.is_featured === true,
          sort_order: sortOrder,
          published_at: cleanText(row.published_at, 40),
        });
        continue;
      }
      existing.episode_count += 1;
      existing.volumeSeasons.add(season);
      existing.is_featured = existing.is_featured || row.is_featured === true;
      if (sortOrder > existing.sort_order) {
        existing.sort_order = sortOrder;
        existing.artwork_url = cleanText(row.thumbnail_url, 2000) || existing.artwork_url;
        existing.first_item_id = String(row.id || existing.first_item_id);
        existing.published_at = cleanText(row.published_at, 40) || existing.published_at;
        existing.title = title || existing.title;
        existing.speaker = speaker || existing.speaker;
      }
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return [...buckets.entries()]
    .map(([key, value]) => ({
      key,
      isFeatured: value.is_featured,
      sortOrder: value.sort_order,
      publishedAt: value.published_at,
      summary: {
        program_id: value.program_id,
        title: value.title,
        speaker: value.speaker,
        organization: null as string | null,
        artwork_url: value.artwork_url,
        episode_count: value.episode_count,
        category_slug: value.category_slug,
        first_item_id: value.first_item_id,
        media_type: value.media_type,
        source: value.source,
        series_title: value.title,
        volume_count: Math.max(
          1,
          [...value.volumeSeasons].filter((entry) => entry != null).length || 1
        ),
      } satisfies MotivationCategoryProgramSummary,
    }))
    .sort((a, b) => {
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
      if (b.sortOrder !== a.sortOrder) return b.sortOrder - a.sortOrder;
      const published = String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""));
      if (published) return published;
      return a.key.localeCompare(b.key);
    })
    .map((entry) => entry.summary);
}

async function loadCachedCategoryProgramSummaries(categorySlug: string) {
  const cached = categoryProgramSummaryCache.get(categorySlug);
  if (cached && Date.now() - cached.at < CATEGORY_PROGRAM_SUMMARY_CACHE_TTL_MS) {
    return cached.programs;
  }
  const programs = await buildCategoryProgramSummariesFromItems(categorySlug);
  categoryProgramSummaryCache.set(categorySlug, { at: Date.now(), programs });
  return programs;
}

/**
 * Program-paginated category browse.
 * Prefers SQL RPC from 20260717210000_motivation_category_program_summaries.sql.
 * Falls back to light-field server aggregation (no descriptions) when RPC is absent.
 */
export async function listMotivationCategoryProgramSummaries(options: {
  categorySlug: string;
  page: number;
  limit: number;
}) {
  const page = Math.max(1, Number(options.page || 1));
  const limit = Math.min(
    MOTIVATION_MAX_PAGE_SIZE,
    Math.max(1, Number(options.limit || 24))
  );
  const categorySlug = cleanMotivationFilter(options.categorySlug);
  if (!categorySlug) {
    return {
      items: [] as MotivationCategoryProgramSummary[],
      pagination: buildMotivationPagination(page, limit, 0),
      source: "empty" as const,
    };
  }

  const { data, error } = await supabaseAdmin.rpc(
    "motivation_list_category_program_summaries",
    {
      p_category_slug: categorySlug,
      p_page: page,
      p_limit: limit,
    }
  );

  if (!error) {
    const rows = ((data || []) as Record<string, unknown>[]).map(toCategoryProgramSummary);
    const total = Number((data as Record<string, unknown>[] | null)?.[0]?.total_count || 0);
    return {
      items: rows,
      pagination: buildMotivationPagination(page, limit, total),
      source: "rpc" as const,
      rpcAvailable: true as const,
    };
  }

  const code = String((error as { code?: string }).code || "");
  const message = String(error.message || "");
  if (code !== "PGRST202" && !/could not find the function/i.test(message)) {
    throw error;
  }

  // Prefer published programs table when populated.
  const programsTable = await listMotivationPrograms({
    page,
    limit,
    categorySlug,
  });
  if (programsTable.pagination.total > 0) {
    return {
      items: programsTable.programs.map((program) => ({
        program_id: program.id,
        title: program.title,
        speaker: program.subtitle,
        organization: null,
        artwork_url: program.artwork_url,
        episode_count: program.session_count,
        category_slug: program.category_slug,
        first_item_id: program.id,
        media_type: "audio",
        source: null,
        series_title: program.title,
        volume_count: 1,
      })),
      pagination: programsTable.pagination,
      source: "programs_table" as const,
      rpcAvailable: false as const,
    };
  }

  // Interim: server-side light aggregation (no descriptions sent to clients).
  const allPrograms = await loadCachedCategoryProgramSummaries(categorySlug);
  const from = (page - 1) * limit;
  const slice = allPrograms.slice(from, from + limit);
  return {
    items: slice,
    pagination: buildMotivationPagination(page, limit, allPrograms.length),
    source: "items_light_aggregate" as const,
    rpcAvailable: false as const,
  };
}
