/**
 * Local dry-run of canonical Sports membership + Alone search filter (read-only).
 *   npx tsx scripts/audit-tv-canonical-category-counts.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import {
  buildTvCategoryMembershipOrFilter,
  resolveTvCanonicalCategory,
} from "../lib/tvCanonicalCategory";
import { buildTvTextSearchOrFilter } from "../lib/tvPublicSearchQuery";
import { applyTvPublicCatalogFilters, type SupabaseFilterQuery } from "../lib/tvPlatformPolicy";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false } });

  async function countWith(label: string, apply: (q: SupabaseFilterQuery) => void) {
    let q = sb.from("tv_videos").select("id", { count: "exact", head: true }) as unknown as SupabaseFilterQuery;
    applyTvPublicCatalogFilters(q, "android");
    apply(q);
    const { count, error } = await q;
    if (error) throw new Error(`${label}: ${error.message}`);
    return { label, count: count ?? 0 };
  }

  const sportsFilter = buildTvCategoryMembershipOrFilter("Sports");
  const sportFilter = buildTvCategoryMembershipOrFilter("Sport");
  const aloneFilter = buildTvTextSearchOrFilter("Alone");

  const results = {
    resolveSports: resolveTvCanonicalCategory("sports"),
    resolveSport: resolveTvCanonicalCategory("Sport"),
    sportsMembershipEligible: await countWith("sports", (q) => q.or(sportsFilter!)),
    sportAliasEligible: await countWith("sport", (q) => q.or(sportFilter!)),
    legacySportsIlike: await countWith("legacy", (q) =>
      q.or('category.ilike."%Sports%",tags.cs.{"Sports"}')
    ),
    aloneSearchEligible: await countWith("alone", (q) => q.or(aloneFilter!)),
  };

  // Sample Alone titles
  let aloneQ = sb
    .from("tv_videos")
    .select("id,title,channel_name,category,catalog_eligibility_tier")
    .or(aloneFilter!)
    .order("title")
    .limit(10) as unknown as SupabaseFilterQuery;
  applyTvPublicCatalogFilters(aloneQ, "android");
  const { data: aloneRows } = await aloneQ;

  console.log(JSON.stringify({ results, aloneSample: aloneRows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
