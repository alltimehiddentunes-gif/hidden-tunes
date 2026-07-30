/**
 * Sample canonical Sports members for false-positive review (read-only).
 *   npx tsx scripts/audit-tv-sports-membership-sample.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { buildTvCategoryMembershipOrFilter } from "../lib/tvCanonicalCategory";
import { applyTvPublicCatalogFilters, type SupabaseFilterQuery } from "../lib/tvPlatformPolicy";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const filter = buildTvCategoryMembershipOrFilter("Sports")!;

  let q = sb
    .from("tv_videos")
    .select("id,title,category,genre,tags")
    .or(filter)
    .order("title")
    .range(0, 999) as unknown as SupabaseFilterQuery;
  applyTvPublicCatalogFilters(q, "android");
  const { data, error } = await q;
  if (error) throw error;

  const hist = new Map<string, number>();
  const suspicious: Array<{ id: string; title: string; category: string }> = [];
  for (const row of data || []) {
    const cat = String(row.category || "(null)");
    hist.set(cat, (hist.get(cat) || 0) + 1);
    const lower = cat.toLowerCase();
    if (
      !lower.includes("sport") &&
      !lower.includes("deport") &&
      !lower.includes("baseball") &&
      !lower.includes("football") &&
      !lower.includes("soccer") &&
      !lower.includes("motor") &&
      !lower.includes("auto")
    ) {
      const tags = Array.isArray(row.tags) ? row.tags.map(String) : [];
      const genre = String(row.genre || "").toLowerCase();
      const tagHit = tags.some((t) => /sport|deport|football|soccer|baseball/i.test(t));
      const genreHit = genre.includes("sport");
      if (!tagHit && !genreHit) {
        suspicious.push({ id: row.id, title: row.title, category: cat });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        sampled: (data || []).length,
        topCategories: [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25),
        suspiciousCount: suspicious.length,
        suspiciousSample: suspicious.slice(0, 20),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
