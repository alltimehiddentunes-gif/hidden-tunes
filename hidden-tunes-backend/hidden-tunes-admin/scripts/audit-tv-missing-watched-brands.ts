/**
 * Read-only audit: formerly-watched TV brands missing from public search.
 *   npx tsx scripts/audit-tv-missing-watched-brands.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { applyTvPublicCatalogFilters, type SupabaseFilterQuery } from "../lib/tvPlatformPolicy";
import { buildTvTextSearchOrFilter } from "../lib/tvPublicSearchQuery";

dotenv.config({ path: ".env.local" });
dotenv.config();

const QUERIES = [
  "Storage Wars",
  "Storage Wars TV",
  "Alone",
  "Alone By History",
  "Pawn Stars",
  "Auction Hunters",
  "Hardcore Pawn",
  "American Pickers",
  "Shipping Wars",
  "Barter Kings",
  "Casino",
  "History Channel",
];

type Row = Record<string, unknown>;

function evidenceEligible(row: Row) {
  return (
    row.playback_status === "playable" &&
    row.is_active === true &&
    !row.disabled_at &&
    !row.quarantined_at &&
    row.last_health_checked_at != null &&
    Number(row.reliability_score ?? 0) >= 50
  );
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const host = new URL(url).host;
  const report: unknown[] = [];

  for (const q of QUERIES) {
    const pat = `"%${q.replace(/"/g, "")}%"`;
    const { data, error } = await sb
      .from("tv_videos")
      .select(
        "id,title,channel_name,category,region,catalog_eligibility_tier,status,is_active,playback_status,disabled_at,quarantined_at,reliability_score,consecutive_failures,last_health_checked_at,last_health_error,source_url,source_type,tags"
      )
      .or(`title.ilike.${pat},channel_name.ilike.${pat}`)
      .order("title")
      .limit(40);
    if (error) throw error;

    const rows = (data || []) as Row[];
    const filter = buildTvTextSearchOrFilter(q);

    let browseCount = 0;
    if (filter) {
      let bq = sb
        .from("tv_videos")
        .select("id", { count: "exact", head: true }) as unknown as SupabaseFilterQuery;
      applyTvPublicCatalogFilters(bq, "android");
      bq.or(filter);
      const { count } = await bq;
      browseCount = count ?? 0;
    }

    // Also hit production API
    const apiRes = await fetch(
      `https://admin.hiddentunes.com/api/tv/videos?platform=android&limit=10&page=1&q=${encodeURIComponent(q)}`,
      { cache: "no-store", signal: AbortSignal.timeout(45_000) }
    );
    const apiBody = await apiRes.json();

    report.push({
      query: q,
      dbMatches: rows.length,
      browseEligibleViaSearchFilter: browseCount,
      apiTotal: apiBody?.pagination?.total ?? null,
      apiTitles: (apiBody?.videos || []).map((v: Row) => ({ id: v.id, title: v.title })),
      candidates: rows.map((r) => ({
        id: r.id,
        title: r.title,
        channel_name: r.channel_name,
        category: r.category,
        region: r.region,
        tier: r.catalog_eligibility_tier,
        status: r.status,
        is_active: r.is_active,
        playback_status: r.playback_status,
        disabled: Boolean(r.disabled_at),
        quarantined: Boolean(r.quarantined_at),
        reliability: r.reliability_score,
        failures: r.consecutive_failures,
        last_health: r.last_health_checked_at,
        last_error: r.last_health_error,
        host: (() => {
          try {
            return new URL(String(r.source_url || "")).host;
          } catch {
            return null;
          }
        })(),
        evidenceEligible: evidenceEligible(r),
        browseEligible: evidenceEligible(r) && r.catalog_eligibility_tier === "verified",
        tags: r.tags,
      })),
    });
  }

  console.log(JSON.stringify({ mode: "read-only", host, report }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
