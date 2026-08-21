/**
 * One-shot import from radio-garden-harvest-candidates.json only (no static SEEDS).
 *   npx tsx scripts/run-radio-africa-import-candidates.ts --execute
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { getAfricanCountry } from "@/lib/radioAfricaExpansion/africanCountries";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import {
  findExistingRadioStationId,
  insertNewRadioStationOnly,
} from "@/lib/radioExpansion25k/insertOnlyImport";
import {
  buildRadioStationFingerprint,
  cleanRadioText,
  getHomepageHost,
  normalizeRadioName,
  normalizeRadioUrl,
} from "@/lib/radioNormalization";
import {
  applyRadioVerificationProbe,
  probeRadioStream,
} from "@/lib/radioStreamVerification";

const adminRoot = path.resolve(__dirname, "..");
const CANDIDATES = path.join(
  adminRoot,
  "data/radio-africa-reports/radio-garden-harvest-candidates.json"
);

function hashId(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 32);
}

async function main() {
  loadAdminEnv(adminRoot);
  const execute = process.argv.includes("--execute");
  const seeds = JSON.parse(fs.readFileSync(CANDIDATES, "utf8").replace(/^\uFEFF/, "")) as Array<{
    code: string;
    name: string;
    url: string;
    attribution?: string;
  }>;
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const results: Array<Record<string, unknown>> = [];
  let imported = 0;
  let failed = 0;
  let duplicates = 0;

  for (const seed of seeds) {
    const country = getAfricanCountry(seed.code);
    if (!country) {
      failed += 1;
      results.push({ ...seed, outcome: "unknown_country" });
      continue;
    }
    const sourceStreamUrl = normalizeRadioUrl(seed.url, { stream: true });
    const normalizedStreamUrl = normalizeRadioUrl(sourceStreamUrl, { stream: true }).toLowerCase();
    const cleanedName = cleanRadioText(seed.name, 300);
    const normalizedName = normalizeRadioName(cleanedName);
    if (!sourceStreamUrl || !normalizedStreamUrl || !cleanedName || !normalizedName) {
      failed += 1;
      results.push({ ...seed, outcome: "normalize_failed" });
      continue;
    }
    const now = new Date().toISOString();
    const sourceStationId = `curated_${seed.code.toLowerCase()}_${hashId(normalizedStreamUrl)}`;
    const candidate = {
      name: cleanedName,
      normalized_name: normalizedName,
      station_fingerprint: buildRadioStationFingerprint({
        normalized_stream_url: normalizedStreamUrl,
        normalized_name: normalizedName,
        country_code: seed.code,
        normalized_homepage_host: null,
      }),
      fingerprint_version: 1,
      source_name: "radio_browser" as const,
      source_type: "radio_browser" as const,
      source_uuid: sourceStationId,
      source_station_id: sourceStationId,
      source_station_uuid: sourceStationId,
      source_server: `hidden_tunes_trusted_catalog:${seed.attribution || "harvest"}`,
      source_stream_url: sourceStreamUrl,
      stream_url: sourceStreamUrl,
      normalized_stream_url: normalizedStreamUrl,
      homepage_url: null,
      normalized_homepage_host: getHomepageHost(null),
      favicon_url: null,
      country: country.name,
      country_code: seed.code,
      state: null,
      language: null,
      tags: [country.name.toLowerCase(), "curated", "africa"],
      bitrate: null,
      codec: null,
      votes: null,
      click_count: null,
      category_slug: "global",
      categories: ["global"],
      source_payload_hash: hashId(`${cleanedName}|${normalizedStreamUrl}`),
      source_last_seen_at: now,
      is_active: true as const,
      last_checked_at: now,
    };

    const probe = await probeRadioStream(candidate.stream_url, {
      timeoutMs: 20_000,
      maxRedirects: 5,
      maxPlaylistBytes: 128 * 1024,
      maxReadBytes: 24 * 1024,
    });
    if (!probe.playable) {
      failed += 1;
      results.push({ ...seed, outcome: "probe_failed", reason: probe.outcome });
      continue;
    }
    const existing = await findExistingRadioStationId(supabase, candidate);
    if (existing) {
      duplicates += 1;
      results.push({ ...seed, outcome: "duplicate", id: existing.id });
      continue;
    }
    if (!execute) {
      imported += 1;
      results.push({ ...seed, outcome: "dry_run_would_insert" });
      continue;
    }
    const inserted = await insertNewRadioStationOnly(supabase, candidate, { dryRun: false });
    if (inserted.outcome !== "inserted" || !inserted.stationId) {
      failed += 1;
      results.push({ ...seed, outcome: inserted.outcome, error: inserted.error });
      continue;
    }
    const update = applyRadioVerificationProbe(
      { id: inserted.stationId, reliability_score: 0, consecutive_failures: 0 } as never,
      probe
    );
    await supabase
      .from("radio_stations")
      .update({
        ...update,
        delivery_mode: candidate.stream_url.startsWith("https://") ? "direct_https" : "backend_relay",
        resolved_stream_url: probe.finalUrl || candidate.stream_url,
      })
      .eq("id", inserted.stationId);
    imported += 1;
    results.push({ ...seed, outcome: "imported", id: inserted.stationId });
  }

  const out = { mode: execute ? "execute" : "dry-run", imported, failed, duplicates, results };
  const outPath = path.join(adminRoot, "data/radio-africa-reports/africa-candidates-import-report.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ outPath, imported, failed, duplicates }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
