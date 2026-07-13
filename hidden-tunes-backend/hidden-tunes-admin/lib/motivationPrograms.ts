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

function applyPublicProgramFilters(query: ReturnType<typeof supabaseAdmin.from>) {
  const next: any = query as any;
  return next
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
