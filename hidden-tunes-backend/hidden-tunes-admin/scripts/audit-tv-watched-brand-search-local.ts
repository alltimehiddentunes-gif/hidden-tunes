/**
 *   npx tsx scripts/audit-tv-watched-brand-search-local.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import {
  applyTvPublicSearchCatalogFilters,
  type SupabaseFilterQuery,
} from "../lib/tvPlatformPolicy";
import { buildTvTextSearchOrFilter } from "../lib/tvPublicSearchQuery";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  );

  for (const q of [
    "Storage Wars TV",
    "Alone",
    "Alone TV",
    "Deadliest Catch",
    "Pawn Stars",
    "Storage Wars",
  ]) {
    const filter = buildTvTextSearchOrFilter(q)!;
    let query = sb
      .from("tv_videos")
      .select("id,title,catalog_eligibility_tier", { count: "exact" }) as unknown as SupabaseFilterQuery;
    applyTvPublicSearchCatalogFilters(query, "android");
    query.or(filter);
    const { data, count, error } = await (query as any).order("title").limit(10);
    if (error) throw error;
    console.log(
      JSON.stringify(
        {
          q,
          count,
          rows: (data || []).map((r: any) => ({
            title: r.title,
            tier: r.catalog_eligibility_tier,
            id: r.id,
          })),
        },
        null,
        2
      )
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
