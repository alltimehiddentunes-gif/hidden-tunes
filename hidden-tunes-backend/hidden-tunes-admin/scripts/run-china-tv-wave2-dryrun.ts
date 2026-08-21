/**
 * China wave2 dry-run verify of Tier-1 leads (no import).
 * npx tsx scripts/run-china-tv-wave2-dryrun.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { probeStreamUrl } from "@/lib/tvStreamProtocol";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadAdminEnv(adminRoot);
const OUT = path.join(adminRoot, "data", "china-tv-deep");

function urlKey(u: string) {
  return String(u || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}
function titleKey(t: string) {
  return String(t || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

async function main() {
  const leads = JSON.parse(
    fs
      .readFileSync(path.join(OUT, "10-wave2-source-leads.json"), "utf8")
      .replace(/^\uFEFF/, "")
  );
  const cands = (leads.candidates || []).filter(
    (c: any) => c.url && /\.m3u8|\.mpd/i.test(c.url)
  );

  const sb = getSupabaseAdmin();
  const urls = new Set<string>();
  const titles = new Set<string>();
  for (const region of ["CN", "HK", "MO", "TW"]) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("tv_videos")
        .select("source_url,validated_stream_url,title,region")
        .eq("region", region)
        .range(from, from + 999);
      if (error) throw error;
      if (!data?.length) break;
      for (const r of data) {
        if (r.source_url) urls.add(urlKey(r.source_url));
        if (r.validated_stream_url) urls.add(urlKey(r.validated_stream_url));
        titles.add(
          `${titleKey(String(r.title || ""))}::${String(r.region || "").toLowerCase()}`
        );
      }
      if (data.length < 1000) break;
    }
  }

  const results: any[] = [];
  for (const c of cands) {
    const uk = urlKey(c.url);
    const tk = `${titleKey(c.title || c.nativeName || "")}::${String(
      c.territory || "CN"
    ).toLowerCase()}`;
    if (urls.has(uk) || titles.has(tk)) {
      results.push({
        title: c.title,
        territory: c.territory,
        status: "duplicate",
        url: c.url,
      });
      continue;
    }
    const probe = await probeStreamUrl(c.url) as Awaited<ReturnType<typeof probeStreamUrl>> & {
      geoRestricted?: boolean;
      error?: unknown;
      authRequired?: boolean;
      drm?: boolean;
      isHls?: boolean;
    };
    let status = "rejected";
    if (probe?.geoRestricted || String(probe?.error || "").includes("403")) {
      status = "geo_restricted";
    } else if (probe?.authRequired) status = "authentication_required";
    else if (probe?.drm) status = "drm_unsupported";
    else if (!probe?.ok) status = "dead";
    else if (
      probe?.ok &&
      (probe?.isHls || probe?.protocol === "hls" || probe?.protocol === "dash")
    ) {
      status = "verified_playable";
    } else status = "playable_unstable";
    results.push({
      title: c.title,
      territory: c.territory,
      status,
      protocol: probe?.protocol ?? null,
      ok: probe?.ok ?? false,
      isHls: probe?.isHls ?? false,
      error: probe?.error ?? null,
      url: c.url,
      provenance: c.provenance,
    });
  }

  const summary = {
    at: new Date().toISOString(),
    dryRun: true,
    total: results.length,
    duplicate: results.filter((r) => r.status === "duplicate").length,
    verified_playable: results.filter((r) => r.status === "verified_playable")
      .length,
    playable_unstable: results.filter((r) => r.status === "playable_unstable")
      .length,
    geo_restricted: results.filter((r) => r.status === "geo_restricted").length,
    dead: results.filter((r) => r.status === "dead").length,
    authentication_required: results.filter(
      (r) => r.status === "authentication_required"
    ).length,
    drm_unsupported: results.filter((r) => r.status === "drm_unsupported")
      .length,
    verifiedSample: results
      .filter((r) => r.status === "verified_playable")
      .slice(0, 30),
    results,
  };

  const outPath = path.join(OUT, "11-wave2-dryrun-verify.json");
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(
    JSON.stringify(
      {
        outPath,
        totals: {
          total: summary.total,
          duplicate: summary.duplicate,
          verified_playable: summary.verified_playable,
          playable_unstable: summary.playable_unstable,
          geo_restricted: summary.geo_restricted,
          dead: summary.dead,
          authentication_required: summary.authentication_required,
          drm_unsupported: summary.drm_unsupported,
        },
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
