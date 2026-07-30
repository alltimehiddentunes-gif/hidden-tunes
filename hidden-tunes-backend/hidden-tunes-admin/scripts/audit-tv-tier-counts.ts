import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { TV_RELIABILITY_THRESHOLD } from "@/lib/tvStationHealth";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadAdminEnv(adminRoot);

async function c(label: string, build: (q: any) => any) {
  const sb = getSupabaseAdmin();
  let q = sb.from("tv_videos").select("id", { count: "exact", head: true });
  q = build(q);
  const { count, error } = await q;
  if (error) throw new Error(`${label}: ${error.message}`);
  console.log(`${label}=${count}`);
}

async function main() {
  const d7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const base = (q: any) =>
    q
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("playback_status", "playable")
      .gte("reliability_score", TV_RELIABILITY_THRESHOLD)
      .is("quarantined_at", null)
      .is("disabled_at", null)
      .eq("stream_is_https", true)
      .eq("ios_playable", true)
      .eq("android_playable", true)
      .not("last_health_checked_at", "is", null);

  await c("all", (q) => q);
  await c("tier_verified", (q) => q.eq("catalog_eligibility_tier", "verified"));
  await c("tier_search_only", (q) => q.eq("catalog_eligibility_tier", "search_only"));
  await c("tier_null", (q) => q.is("catalog_eligibility_tier", null));
  await c("evidence_verified_tier", (q) => base(q).eq("catalog_eligibility_tier", "verified"));
  await c("evidence_any_tier", (q) => base(q));
  await c("seven_day_verified", (q) =>
    base(q).eq("catalog_eligibility_tier", "verified").gte("last_health_checked_at", d7)
  );
  await c("stale_verified", (q) =>
    base(q).eq("catalog_eligibility_tier", "verified").lt("last_health_checked_at", d7)
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
