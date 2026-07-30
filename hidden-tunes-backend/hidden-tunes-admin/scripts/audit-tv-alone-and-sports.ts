/**
 * Trace Alone + Sports category discrepancy (read-only).
 *   npx tsx scripts/audit-tv-alone-and-sports.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { applyTvPublicCatalogFilters } from "@/lib/tvPlatformPolicy";
import { TV_RELIABILITY_THRESHOLD } from "@/lib/tvStationHealth";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadAdminEnv(adminRoot);

const SELECT =
  "id,title,channel_name,category,genre,mood,format,tags,region,language,source_type,source_url,status,is_active,playback_status,reliability_score,consecutive_failures,disabled_at,quarantined_at,catalog_eligibility_tier,last_health_checked_at,last_health_error,ios_playable,android_playable,stream_is_https,is_featured";

async function main() {
  const sb = getSupabaseAdmin();
  const host = new URL(String(process.env.SUPABASE_URL || "")).hostname;

  const alonePatterns = [
    "%Alone%",
    "%ALONE%",
    "%alone%",
  ];

  const aloneHits: any[] = [];
  const seen = new Set<string>();

  for (const pat of alonePatterns) {
    const { data, error } = await sb
      .from("tv_videos")
      .select(SELECT)
      .or(
        `title.ilike.${pat},channel_name.ilike.${pat},category.ilike.${pat},genre.ilike.${pat},source_url.ilike.${pat}`
      )
      .limit(200);
    if (error) throw error;
    for (const row of data || []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      aloneHits.push(row);
    }
  }

  // tighter title equals / starts
  const { data: aloneExact } = await sb
    .from("tv_videos")
    .select(SELECT)
    .or(
      'title.ilike."Alone",title.ilike."Alone %",title.ilike."% Alone",title.ilike."Alone TV%",title.ilike."Alone Television%",title.ilike."Alone Channel%",title.ilike."Alone Network%",title.ilike."Alone Live%"'
    )
    .limit(100);

  for (const row of aloneExact || []) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    aloneHits.push(row);
  }

  function classify(row: any) {
    const playable =
      row.status === "approved" &&
      row.is_active === true &&
      row.playback_status === "playable" &&
      !row.disabled_at &&
      !row.quarantined_at &&
      Number(row.reliability_score ?? 0) >= TV_RELIABILITY_THRESHOLD &&
      row.stream_is_https === true &&
      row.ios_playable === true &&
      row.android_playable === true &&
      Boolean(row.last_health_checked_at);
    return {
      id: row.id,
      title: row.title,
      channel_name: row.channel_name,
      category: row.category,
      genre: row.genre,
      tags: row.tags,
      region: row.region,
      tier: row.catalog_eligibility_tier,
      status: row.status,
      is_active: row.is_active,
      playback_status: row.playback_status,
      disabled_at: row.disabled_at,
      quarantined_at: row.quarantined_at,
      reliability_score: row.reliability_score,
      consecutive_failures: row.consecutive_failures,
      last_health_checked_at: row.last_health_checked_at,
      last_health_error: row.last_health_error,
      source_type: row.source_type,
      host: (() => {
        try {
          return new URL(String(row.source_url || "")).hostname;
        } catch {
          return null;
        }
      })(),
      evidenceEligible: playable,
      browseEligible:
        playable && String(row.catalog_eligibility_tier || "") === "verified",
    };
  }

  const aloneClassified = aloneHits.map(classify).sort((a, b) => {
    if (a.browseEligible !== b.browseEligible) return a.browseEligible ? -1 : 1;
    if (a.evidenceEligible !== b.evidenceEligible) return a.evidenceEligible ? -1 : 1;
    return String(a.title).localeCompare(String(b.title));
  });

  // Sports funnel
  async function count(build: (q: any) => any) {
    let q = sb.from("tv_videos").select("id", { count: "exact", head: true });
    q = build(q);
    const { count, error } = await q;
    if (error) throw error;
    return count || 0;
  }

  const sportsOr =
    'category.ilike."%sport%",genre.ilike."%sport%",mood.ilike."%sport%",format.ilike."%sport%"';

  const sports = {
    allTitleOrCategoryMention: await count((q) =>
      q.or(`${sportsOr},title.ilike."%sport%",tags.cs.{"Sports"},tags.cs.{"sports"},tags.cs.{"Sport"}`)
    ),
    categoryIlikeSport: await count((q) => q.ilike("category", "%sport%")),
    categoryExactSports: await count((q) => q.eq("category", "Sports")),
    categoryExactSport: await count((q) => q.eq("category", "Sport")),
    categoryExactLower: await count((q) => q.eq("category", "sports")),
    genreIlikeSport: await count((q) => q.ilike("genre", "%sport%")),
    evidenceEligibleCategorySport: await count((q) => {
      applyTvPublicCatalogFilters(q, "android");
      return q.or('category.ilike."%Sport%",tags.cs.{"Sports"},tags.cs.{"sports"},tags.cs.{"Sport"}');
    }),
    evidenceEligibleCategoryOrGenre: await count((q) => {
      applyTvPublicCatalogFilters(q, "android");
      return q.or(
        'category.ilike."%sport%",genre.ilike."%sport%",tags.cs.{"Sports"},tags.cs.{"sports"},tags.cs.{"Sport"}'
      );
    }),
    currentApiStyleMoviesFilter: await count((q) => {
      applyTvPublicCatalogFilters(q, "android");
      return q.or('category.ilike."%Sports%",tags.cs.{"Sports"}');
    }),
    currentApiStyleCaseSensitiveish: await count((q) => {
      applyTvPublicCatalogFilters(q, "android");
      // mirrors production videos route quoteFilterValue("%Sports%")
      return q.or('category.ilike."%Sports%",tags.cs.{"Sports"}');
    }),
    lowerSportsCategoryEligible: await count((q) => {
      applyTvPublicCatalogFilters(q, "android");
      return q.or('category.ilike."%sports%",tags.cs.{"sports"}');
    }),
  };

  // Sample category values for sport-like rows among evidence eligible
  let q: any = sb.from("tv_videos").select("category,genre,tags").limit(2000);
  applyTvPublicCatalogFilters(q, "android");
  q = q.or(
    'category.ilike."%sport%",genre.ilike."%sport%",tags.cs.{"Sports"},tags.cs.{"sports"},tags.cs.{"Sport"}'
  );
  const { data: sportSample, error: sportErr } = await q;
  if (sportErr) throw sportErr;
  const catBag: Record<string, number> = {};
  for (const row of sportSample || []) {
    const c = String(row.category || "(null)");
    catBag[c] = (catBag[c] || 0) + 1;
  }

  // Production API live totals
  const apiSports = await fetch(
    "https://admin.hiddentunes.com/api/tv/videos?platform=android&limit=1&page=1&category=Sports",
    { signal: AbortSignal.timeout(60000) }
  ).then((r) => r.json());
  const apiSport = await fetch(
    "https://admin.hiddentunes.com/api/tv/videos?platform=android&limit=1&page=1&category=Sport",
    { signal: AbortSignal.timeout(60000) }
  ).then((r) => r.json());
  const apiAlone = await fetch(
    "https://admin.hiddentunes.com/api/tv/videos?platform=android&limit=20&page=1&q=Alone",
    { signal: AbortSignal.timeout(60000) }
  ).then((r) => r.json());

  console.log(
    JSON.stringify(
      {
        mode: "read-only",
        host,
        alone: {
          candidates: aloneClassified.length,
          browseEligible: aloneClassified.filter((r) => r.browseEligible).length,
          evidenceEligible: aloneClassified.filter((r) => r.evidenceEligible).length,
          top: aloneClassified.slice(0, 40),
          apiSearchTotal: apiAlone.pagination?.total,
          apiSearchSample: (apiAlone.videos || []).slice(0, 10).map((v: any) => ({
            id: v.id,
            title: v.title,
          })),
        },
        sports,
        sportCategoryHistogramSample: Object.entries(catBag)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30),
        api: {
          categorySportsTotal: apiSports.pagination?.total,
          categorySportTotal: apiSport.pagination?.total,
        },
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
