/**
 * Read-only helper: public station counts by country_code for Wave 1 prioritization.
 */
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { RADIO_PUBLIC_RELIABILITY_THRESHOLD } from "@/lib/radioPublicCatalog";

export async function loadPublicCountryCounts(): Promise<Map<string, number>> {
  loadAdminEnv(path.resolve(__dirname, ".."));
  const sb = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const counts = new Map<string, number>();
  let from = 0;
  while (from < 60_000) {
    const { data, error } = await sb
      .from("radio_stations")
      .select("country_code")
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("is_verified", true)
      .eq("playback_status", "playable")
      .eq("is_mature", false)
      .is("quarantined_at", null)
      .is("disabled_at", null)
      .gte("reliability_score", RADIO_PUBLIC_RELIABILITY_THRESHOLD)
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const cc = String(row.country_code || "ZZ").toUpperCase();
      counts.set(cc, (counts.get(cc) || 0) + 1);
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  return counts;
}

/** Lower score = higher Wave 1 priority (deficit first). */
export function countryDeficitPriority(existingCount: number) {
  if (existingCount <= 0) return 0;
  if (existingCount < 5) return 1;
  if (existingCount < 20) return 2;
  if (existingCount < 50) return 3;
  if (existingCount < 200) return 4;
  return 5;
}
