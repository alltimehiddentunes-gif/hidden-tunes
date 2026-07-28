import {
  RADIO_PUBLIC_STATION_SELECT,
  buildRadioPagination,
  buildRadioTextSearchOrFilter,
  cleanRadioText,
  parseRadioLimit,
  parseRadioPage,
  toRadioPublicStation,
} from "@/lib/radioPublicCatalog";
import { applyMatureRadioPublicFilters } from "@/lib/radioMature/platformPolicy";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function listMatureRadioStations(options: {
  page: number;
  limit: number;
  category?: string | null;
  country?: string | null;
  language?: string | null;
  searchQuery?: string | null;
}) {
  const from = (options.page - 1) * options.limit;
  const to = from + options.limit - 1;

  let query = supabaseAdmin
    .from("radio_stations")
    .select(RADIO_PUBLIC_STATION_SELECT, { count: "exact" })
    .order("reliability_score", { ascending: false })
    .order("created_at", { ascending: false });

  query = applyMatureRadioPublicFilters(query);

  const category = cleanRadioText(options.category, 80).toLowerCase();
  if (category) {
    query = query.or(`category_slug.eq.${category},categories.cs.{${category}},tags.cs.{${category}}`);
  }

  const country = cleanRadioText(options.country, 80);
  if (country) {
    query = query.or(`country.ilike.%${country}%,country_code.ilike.${country}`);
  }

  const language = cleanRadioText(options.language, 80);
  if (language) {
    query = query.ilike("language", `%${language}%`);
  }

  const searchOr = buildRadioTextSearchOrFilter(options.searchQuery);
  if (searchOr) {
    query = query.or(searchOr);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  return {
    stations: ((data || []) as Record<string, unknown>[]).map((row) => toRadioPublicStation(row)),
    pagination: buildRadioPagination(options.page, options.limit, count || 0),
  };
}

export function parseMatureRadioListParams(params: URLSearchParams) {
  return {
    page: parseRadioPage(params.get("page")),
    limit: parseRadioLimit(params.get("limit")),
    category: params.get("category"),
    country: params.get("country"),
    language: params.get("language"),
    searchQuery: params.get("q"),
  };
}
