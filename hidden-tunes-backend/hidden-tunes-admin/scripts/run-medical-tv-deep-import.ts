import fs from "node:fs";
import path from "node:path";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import {
  importVerifiedTvGrowthCandidates,
  probeTvStation,
} from "../lib/tvStationHealth";
type C = {
  name: string;
  country: string;
  language: string;
  subcategory: string;
  streamUrl: string | null;
  website: string;
  logo: string | null;
  description: string;
  provenance: string;
  rights: string;
  eligible: boolean;
  classification: string;
};
const out = path.resolve(__dirname, "../data/medical-tv-deep");
const candidates = (
  JSON.parse(
    fs.readFileSync(path.join(out, "candidate-manifest.json"), "utf8"),
  ) as { candidates: C[] }
).candidates;
const apply = process.argv.includes("--apply");
const waitMs = Number(process.env.MEDICAL_TV_CONTINUITY_WAIT_MS || 15000);
const sleep = (n: number) => new Promise((r) => setTimeout(r, n));
const key = (c: C) =>
  `medical-tv-20260817:${c.country.toLowerCase()}:${c.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
async function duplicates(c: C) {
  const { data, error } = await supabaseAdmin
    .from("tv_videos")
    .select(
      "id,title,channel_name,description,thumbnail_url,region,language,category,genre,tags,source_type,source_key,source_url,status,is_active,playback_status,reliability_score,ios_playable,android_playable,stream_is_https,stream_protocol,last_health_checked_at",
    )
    .or(`title.ilike.%${c.name}%,channel_name.ilike.%${c.name}%`)
    .limit(25);
  if (error) throw new Error(error.message);
  return (data || []).filter(
    (r) =>
      r.source_key === key(c) ||
      (c.streamUrl &&
        String(r.source_url || "").replace(/\/+$/, "") ===
          c.streamUrl.replace(/\/+$/, "")) ||
      (String(r.title || r.channel_name || "")
        .trim()
        .toLowerCase() === c.name.toLowerCase() &&
        String(r.region || "").toUpperCase() === c.country),
  );
}
async function verifyExisting(rows: any[]) {
  const checks = [];
  for (const row of rows) {
    let productionPlay: Record<string, unknown>;
    try {
      const response = await fetch(
        `https://admin.hiddentunes.com/api/tv/videos/${row.id}/play`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "HiddenTunes-MedicalTV-Audit/1.0",
          },
          signal: AbortSignal.timeout(20_000),
        },
      );
      const body = (await response.json().catch(() => null)) as any;
      productionPlay = {
        ok: response.ok,
        status: response.status,
        deliveryMode: body?.deliveryMode || body?.delivery_mode || null,
        protocol: body?.protocol || body?.stream_protocol || null,
        hasUrl: Boolean(
          body?.url || body?.playUrl || body?.stream_url || body?.source_url,
        ),
        error: body?.error || body?.message || null,
      };
    } catch (error) {
      productionPlay = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    checks.push({
      id: row.id,
      catalog: row,
      medicalCategory:
        row.category === "Medical & Health" ||
        (Array.isArray(row.tags) && row.tags.includes("Medical & Health")),
      publicPlayable:
        row.status === "approved" &&
        row.is_active === true &&
        row.playback_status === "playable",
      metadataComplete: Boolean(
        row.title &&
        row.region &&
        row.language &&
        row.description &&
        row.thumbnail_url,
      ),
      productionPlay,
    });
  }
  return checks;
}
async function main() {
  const results: any[] = [];
  for (const c of candidates) {
    const d = await duplicates(c);
    if (d.length) {
      results.push({
        name: c.name,
        classification: "DUPLICATE_EXISTING",
        duplicateIds: d.map((x) => x.id),
        existingVerification: await verifyExisting(d),
      });
      continue;
    }
    if (!c.eligible || !c.streamUrl) {
      results.push({
        name: c.name,
        classification: c.classification,
        reason: c.rights,
      });
      continue;
    }
    const row = {
      id: "candidate",
      source_type: "hls_stream",
      source_id: key(c),
      source_url: c.streamUrl,
      embed_url: null,
      title: c.name,
      status: "approved",
      playback_status: "unchecked",
      is_active: false,
      reliability_score: 100,
      consecutive_failures: 0,
    };
    const first = await probeTvStation(row);
    if (waitMs) await sleep(waitMs);
    const second = await probeTvStation(row);
    if (!(
      first.playable &&
      second.playable &&
      first.stream_is_https &&
      second.stream_is_https
    )) {
      results.push({
        name: c.name,
        classification: "TEMPORARY_FAILURE_RETEST",
        first,
        second,
      });
      continue;
    }
    if (!apply) {
      results.push({
        name: c.name,
        classification: "VERIFIED_PLAYABLE_NOT_IMPORTED",
        first,
        second,
      });
      continue;
    }
    const imported = await importVerifiedTvGrowthCandidates([
      {
        source_type: "hls_stream",
        source_id: key(c),
        source_key: key(c),
        source_url: c.streamUrl,
        title: c.name,
        channel_name: c.name,
        description: c.description,
        thumbnail_url: c.logo,
        category: "Medical & Health",
        categories: ["Medical & Health", c.subcategory],
        genre: c.subcategory,
        language: c.language,
        country: c.country,
        tags: [
          "Medical & Health",
          c.subcategory,
          `official:${c.website}`,
          `provenance:${c.provenance}`,
          `rights:${c.rights}`,
          `verified_at:${new Date().toISOString()}`,
        ],
      },
    ]);
    const { data } = await supabaseAdmin
      .from("tv_videos")
      .select("id,title,source_key")
      .eq("source_key", key(c))
      .maybeSingle();
    results.push({
      name: c.name,
      classification:
        imported.imported === 1
          ? "VERIFIED_PLAYABLE_IMPORTED"
          : "TEMPORARY_FAILURE_RETEST",
      insertedId: data?.id || null,
      imported,
      first,
      second,
    });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    apply,
    continuityWaitMs: waitMs,
    results,
  };
  fs.writeFileSync(
    path.join(out, apply ? "import-result.json" : "verification-result.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
