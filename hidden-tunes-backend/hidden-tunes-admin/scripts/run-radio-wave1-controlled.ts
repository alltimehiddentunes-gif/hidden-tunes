/**
 * Controlled Wave 1 runner for radio 40k expansion.
 *
 * Hard caps (do not enlarge during the run):
 * - discovery max 2,500 unique candidates
 * - import max 1,000
 * - verification max 1,000
 * - public promotion only after independent verification + eligibility
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { insertNewRadioStationOnly } from "@/lib/radioExpansion25k/insertOnlyImport";
import {
  fetchProductionPublicCount,
  getRadioCatalogCounts,
  RADIO_PUBLIC_PLAYABLE_TARGET,
} from "@/lib/radioExpansion25k/publicCounts";
import type { NormalizedRadioStation } from "@/lib/radioNormalization";
import { RADIO_PUBLIC_RELIABILITY_THRESHOLD } from "@/lib/radioPublicCatalog";
import {
  applyRadioVerificationProbe,
  probeRadioStream,
} from "@/lib/radioStreamVerification";
import {
  countryDeficitPriority,
  loadPublicCountryCounts,
} from "@/lib/radioExpansion25k/wave1Coverage";

const adminRoot = path.resolve(__dirname, "..");
const batch8Path = path.join(adminRoot, "data", "radio-general-batch8-candidates.json");
const reportPath = path.join(adminRoot, "data", "radio-40k-wave1-report.json");

export const WAVE1_DISCOVERY_MAX = 2_500;
export const WAVE1_IMPORT_MAX = 1_000;
export const WAVE1_VERIFY_MAX = 1_000;
export const WAVE1_MAX_PER_COUNTRY = 100;
export const WAVE1_MAX_PER_SOURCE_FAMILY = 250;

type Wave1Candidate = NormalizedRadioStation & {
  discovered_query_key?: string;
  discovered_offset?: number;
};

function readArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    execute: args.has("--execute"),
  };
}

function loadBatch8Candidates(): Wave1Candidate[] {
  if (!fs.existsSync(batch8Path)) return [];
  const parsed = JSON.parse(fs.readFileSync(batch8Path, "utf8")) as {
    candidates?: Wave1Candidate[];
  };
  return Array.isArray(parsed.candidates) ? parsed.candidates : [];
}

export function selectWave1Candidates(
  all: Wave1Candidate[],
  publicCountryCounts: Map<string, number> = new Map()
) {
  const byCountry = new Map<string, number>();
  const bySource = new Map<string, number>();
  const selected: Wave1Candidate[] = [];
  let skippedCountryCap = 0;
  let skippedSourceCap = 0;

  const ranked = [...all].sort((a, b) => {
    const ca = String(a.country_code || "ZZ").toUpperCase();
    const cb = String(b.country_code || "ZZ").toUpperCase();
    const pa = countryDeficitPriority(publicCountryCounts.get(ca) || 0);
    const pb = countryDeficitPriority(publicCountryCounts.get(cb) || 0);
    if (pa !== pb) return pa - pb;
    return ca.localeCompare(cb);
  });

  for (const candidate of ranked) {
    if (selected.length >= WAVE1_DISCOVERY_MAX) break;
    const country = String(candidate.country_code || "ZZ").toUpperCase();
    const source = String(candidate.source_name || "unknown");
    const countryCount = byCountry.get(country) || 0;
    const sourceCount = bySource.get(source) || 0;
    if (countryCount >= WAVE1_MAX_PER_COUNTRY) {
      skippedCountryCap += 1;
      continue;
    }
    if (sourceCount >= WAVE1_MAX_PER_SOURCE_FAMILY) {
      skippedSourceCap += 1;
      continue;
    }
    selected.push(candidate);
    byCountry.set(country, countryCount + 1);
    bySource.set(source, sourceCount + 1);
  }

  return {
    selected,
    byCountry: Object.fromEntries([...byCountry.entries()].sort((a, b) => b[1] - a[1])),
    bySource: Object.fromEntries([...bySource.entries()].sort((a, b) => b[1] - a[1])),
    skippedCountryCap,
    skippedSourceCap,
  };
}

async function main() {
  loadAdminEnv(adminRoot);
  const options = readArgs();
  const pool = loadBatch8Candidates();
  const publicCountryCounts = await loadPublicCountryCounts();
  const selection = selectWave1Candidates(pool, publicCountryCounts);
  const publicBefore = await fetchProductionPublicCount().catch(() => 0);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase environment variables.");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const beforeCounts = await getRadioCatalogCounts(supabase);

  const report: Record<string, unknown> = {
    wave: 1,
    mode: options.execute ? "execute" : "dry-run",
    caps: {
      discovery_max: WAVE1_DISCOVERY_MAX,
      import_max: WAVE1_IMPORT_MAX,
      verify_max: WAVE1_VERIFY_MAX,
      max_per_country: WAVE1_MAX_PER_COUNTRY,
      max_per_source_family: WAVE1_MAX_PER_SOURCE_FAMILY,
    },
    started_at: new Date().toISOString(),
    production_public_before: publicBefore,
    db_before: beforeCounts,
    target: RADIO_PUBLIC_PLAYABLE_TARGET,
    remaining_gap_before: Math.max(0, RADIO_PUBLIC_PLAYABLE_TARGET - publicBefore),
    discovery_pool_size: pool.length,
    discovery_selected: selection.selected.length,
    discovery_by_country: selection.byCountry,
    discovery_by_source: selection.bySource,
    skipped_country_cap: selection.skippedCountryCap,
    skipped_source_cap: selection.skippedSourceCap,
    imported: 0,
    import_duplicates: 0,
    import_failed: 0,
    inserted_ids: [] as string[],
    verification_attempted: 0,
    verification_passed: 0,
    verification_failed: 0,
    verification_failed_by_reason: {} as Record<string, number>,
    direct_https_passed: 0,
    https_hls_passed: 0,
    http_relay_candidates_passed: 0,
    publicly_promoted: 0,
    exact_duplicates_rejected: 0,
    probable_duplicates_held: 0,
    mobile_untouched: true,
    api_contract_unchanged: true,
  };

  if (!options.execute) {
    report.finished_at = new Date().toISOString();
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const toImport = selection.selected.slice(0, WAVE1_IMPORT_MAX);
  const insertedIds: string[] = [];
  for (const candidate of toImport) {
    const result = await insertNewRadioStationOnly(supabase, candidate, { dryRun: false });
    if (result.outcome === "inserted" && result.stationId) {
      insertedIds.push(result.stationId);
      (report.imported as number) += 1;
    } else if (result.outcome === "duplicate") {
      (report.import_duplicates as number) += 1;
      (report.exact_duplicates_rejected as number) += 1;
    } else {
      (report.import_failed as number) += 1;
    }
  }
  report.inserted_ids = insertedIds;

  const toVerify = insertedIds.slice(0, WAVE1_VERIFY_MAX);
  for (const id of toVerify) {
    const { data: row, error } = await supabase
      .from("radio_stations")
      .select(
        "id, name, stream_url, source_stream_url, playback_status, reliability_score, consecutive_failures, status, is_active, is_verified, is_mature, quarantined_at, disabled_at"
      )
      .eq("id", id)
      .maybeSingle();
    if (error || !row) {
      (report.verification_failed as number) += 1;
      continue;
    }
    (report.verification_attempted as number) += 1;
    const probe = await probeRadioStream(String(row.stream_url || row.source_stream_url || ""), {
      timeoutMs: 12_000,
    });
    const update = applyRadioVerificationProbe(row, probe);
    const { error: updateError } = await supabase.from("radio_stations").update(update).eq("id", id);
    if (updateError) {
      (report.verification_failed as number) += 1;
      const bag = report.verification_failed_by_reason as Record<string, number>;
      bag.update_error = (bag.update_error || 0) + 1;
      continue;
    }

    if (probe.playable) {
      (report.verification_passed as number) += 1;
      const url = String(row.stream_url || "");
      if (url.startsWith("https://") && /\.m3u8(\?|$)/i.test(url)) {
        (report.https_hls_passed as number) += 1;
      } else if (url.startsWith("https://")) {
        (report.direct_https_passed as number) += 1;
      } else if (url.startsWith("http://")) {
        (report.http_relay_candidates_passed as number) += 1;
      }

      const eligible =
        update.is_verified === true &&
        update.playback_status === "playable" &&
        Number(update.reliability_score) >= RADIO_PUBLIC_RELIABILITY_THRESHOLD &&
        !update.quarantined_at &&
        !update.disabled_at &&
        row.is_mature !== true;
      if (eligible) (report.publicly_promoted as number) += 1;
    } else {
      (report.verification_failed as number) += 1;
      const reason = probe.outcome || "failed";
      const bag = report.verification_failed_by_reason as Record<string, number>;
      bag[reason] = (bag[reason] || 0) + 1;
    }
  }

  const afterCounts = await getRadioCatalogCounts(supabase);
  const publicAfter = await fetchProductionPublicCount().catch(() => afterCounts.public_general);
  report.db_after = afterCounts;
  report.production_public_after = publicAfter;
  report.remaining_gap_after = Math.max(0, RADIO_PUBLIC_PLAYABLE_TARGET - publicAfter);
  report.finished_at = new Date().toISOString();

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
