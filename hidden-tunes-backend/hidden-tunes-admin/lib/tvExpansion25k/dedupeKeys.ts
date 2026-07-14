import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dedupeTvGrowthCandidates, type TvGrowthCandidate } from "@/lib/tvStationHealth";

const PAGE_SIZE = 1000;

function normalizeUrlKey(value: string | null | undefined) {
  return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
}

function normalizeTitleKey(title: string | null | undefined, country?: string | null) {
  return `${String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}::${String(country || "").trim().toLowerCase()}`;
}

/**
 * Paginated dedupe key load for expansion pre-filtering.
 * Additive safety layer — does not replace importVerifiedTvGrowthCandidates dedup.
 */
export async function loadAllTvDedupeKeys() {
  const sourceKeys = new Set<string>();
  const urlKeys = new Set<string>();
  const titleCountryKeys = new Set<string>();

  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("tv_videos")
      .select("source_type, source_id, source_url, title, region, source_key")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const rows = data || [];
    if (rows.length === 0) break;

    for (const row of rows as Array<Record<string, unknown>>) {
      sourceKeys.add(`${row.source_type || ""}:${row.source_id || ""}`);
      urlKeys.add(normalizeUrlKey(String(row.source_url || "")));
      titleCountryKeys.add(
        normalizeTitleKey(String(row.title || ""), String(row.region || ""))
      );
      if (row.source_key) sourceKeys.add(String(row.source_key));
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { sourceKeys, urlKeys, titleCountryKeys };
}

export async function prefilterNewTvCandidates(candidates: TvGrowthCandidate[]) {
  const existing = await loadAllTvDedupeKeys();
  const before = candidates.length;
  const accepted = dedupeTvGrowthCandidates(candidates, existing);
  return {
    accepted,
    removed: before - accepted.length,
    existingKeyCount: existing.sourceKeys.size,
  };
}
