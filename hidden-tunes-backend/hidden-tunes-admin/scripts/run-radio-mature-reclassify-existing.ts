/**
 * Reclassify existing general-catalog stations that clearly match mature signals.
 * Converts in-place (same row) so they leave the general public filter and enter mature.
 *
 * Usage:
 *   npx tsx scripts/run-radio-mature-reclassify-existing.ts
 *   npx tsx scripts/run-radio-mature-reclassify-existing.ts --execute --limit 5000
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import {
  classifyMatureRadioCandidate,
  shouldAutoInsertMatureCandidate,
  shouldRejectMatureCandidate,
} from "@/lib/radioMature/classifier";
import type { RadioBrowserStation } from "@/lib/radioNormalization";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resultPath = path.join(adminRoot, "data", "radio-mature-reclassify-existing-result.json");

function readArgs() {
  const args = new Set(process.argv.slice(2));
  const limitIndex = process.argv.indexOf("--limit");
  return {
    mode: args.has("--execute") ? ("execute" as const) : ("dry-run" as const),
    limit: limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : 20_000,
    pageSize: Number(process.env.RADIO_MATURE_RECLASSIFY_PAGE || 500),
  };
}

type Row = {
  id: string;
  name: string | null;
  tags: string[] | null;
  homepage_url: string | null;
  country_code: string | null;
  language: string | null;
  stream_url: string | null;
  is_mature: boolean | null;
  playback_status: string | null;
};

function toPseudoStation(row: Row): RadioBrowserStation {
  return {
    changeuuid: "",
    stationuuid: row.id,
    name: row.name || "",
    url: row.stream_url || "",
    url_resolved: row.stream_url || "",
    homepage: row.homepage_url || "",
    favicon: "",
    tags: Array.isArray(row.tags) ? row.tags.join(",") : "",
    country: "",
    countrycode: row.country_code || "",
    state: "",
    language: row.language || "",
    votes: 0,
    lastchangetime: "",
    codec: "",
    bitrate: 0,
    hls: 0,
    lastcheckok: 1,
    lastchecktime: "",
    clickcount: 0,
    clicktrend: 0,
  } as RadioBrowserStation;
}

async function loadCandidates(supabase: SupabaseClient, limit: number, pageSize: number) {
  const rows: Row[] = [];
  let offset = 0;
  while (rows.length < limit) {
    const to = Math.min(offset + pageSize - 1, limit - 1);
    const { data, error } = await supabase
      .from("radio_stations")
      .select(
        "id, name, tags, homepage_url, country_code, language, stream_url, is_mature, playback_status"
      )
      .eq("is_mature", false)
      .is("quarantined_at", null)
      .is("disabled_at", null)
      .or(
        "name.ilike.%adult%,name.ilike.%erotic%,name.ilike.%erotica%,name.ilike.%sexy%,name.ilike.%uncensored%,name.ilike.%explicit%,name.ilike.%18+%,name.ilike.%nsfw%,name.ilike.%porn%,name.ilike.%xxx%,name.ilike.%nightlife%,name.ilike.%club%,name.ilike.%sex %,name.ilike.% fetish%,tags.cs.{adult},tags.cs.{erotic},tags.cs.{erotica},tags.cs.{sexy},tags.cs.{uncensored},tags.cs.{explicit},tags.cs.{nsfw},tags.cs.{porn},tags.cs.{xxx},tags.cs.{nightlife},tags.cs.{club},tags.cs.{sex},tags.cs.{asmr},tags.cs.{lgbt},tags.cs.{lgbtq}"
      )
      .order("id", { ascending: true })
      .range(offset, to);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as Row[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return rows.slice(0, limit);
}

async function main() {
  loadAdminEnv(adminRoot);
  const options = readArgs();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase environment variables.");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const candidates = await loadCandidates(supabase, options.limit, options.pageSize);
  const stats = {
    mode: options.mode,
    scanned: 0,
    matched: 0,
    reclassified: 0,
    skipped_false_positive: 0,
    skipped_not_mature: 0,
    errors: 0,
    by_classification: {} as Record<string, number>,
  };

  for (const row of candidates) {
    stats.scanned += 1;
    const classification = classifyMatureRadioCandidate(toPseudoStation(row));
    stats.by_classification[classification.classification] =
      (stats.by_classification[classification.classification] || 0) + 1;

    if (shouldRejectMatureCandidate(classification.classification)) {
      if (classification.classification === "adult_contemporary_false_positive") {
        stats.skipped_false_positive += 1;
      } else {
        stats.skipped_not_mature += 1;
      }
      continue;
    }
    if (!shouldAutoInsertMatureCandidate(classification.classification)) {
      stats.skipped_not_mature += 1;
      continue;
    }

    stats.matched += 1;
    if (options.mode !== "execute") continue;

    const { error } = await supabase
      .from("radio_stations")
      .update({
        is_mature: true,
        content_rating: "18+",
        mature_review_status: "confirmed",
        mature_review_reason: `reclassify_existing: ${classification.classification}: ${classification.reason}`,
        mature_evidence_type: classification.mature_evidence_type,
        mature_evidence_url: row.homepage_url,
        rights_status: "approved",
        source_authorization_status: "approved",
        mature_source_approved: false,
        is_free: true,
        requires_account: false,
        requires_payment: false,
        requires_drm: false,
      })
      .eq("id", row.id)
      .eq("is_mature", false);
    if (error) stats.errors += 1;
    else stats.reclassified += 1;
  }

  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, JSON.stringify(stats, null, 2));
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
