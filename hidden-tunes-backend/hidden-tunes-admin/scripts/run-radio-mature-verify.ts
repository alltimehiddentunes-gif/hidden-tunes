import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { chunk } from "@/lib/radioExpansion25k/insertOnlyImport";
import {
  applyRadioVerificationProbe,
  probeRadioStream,
  type RadioStreamProbeResult,
} from "@/lib/radioStreamVerification";

const BATCH_NAME = "radio-mature-verify-unchecked";
const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkpointPath = path.join(adminRoot, "data", `${BATCH_NAME}-checkpoint.json`);
const resultPath = path.join(adminRoot, "data", `${BATCH_NAME}-result.json`);

type Mode = "dry-run" | "execute";

type RadioVerifyRow = {
  id: string;
  name: string | null;
  stream_url: string | null;
  source_stream_url: string | null;
  playback_status: string | null;
  reliability_score: number | null;
  consecutive_failures: number | null;
  status: string | null;
  is_active: boolean | null;
  is_verified: boolean | null;
  is_mature: boolean | null;
  mature_review_status: string | null;
  rights_status: string | null;
  quarantined_at: string | null;
  disabled_at: string | null;
};

function readArgs() {
  const args = new Set(process.argv.slice(2));
  const limitIndex = process.argv.indexOf("--limit");
  return {
    mode: args.has("--execute") ? ("execute" as Mode) : ("dry-run" as Mode),
    limit: limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : null,
    concurrency: Number(process.env.RADIO_VERIFY_CONCURRENCY || 4),
    timeoutMs: Number(process.env.RADIO_VERIFY_TIMEOUT_MS || 12_000),
    retries: Number(process.env.RADIO_VERIFY_RETRIES || 2),
    pageSize: Number(process.env.RADIO_VERIFY_PAGE_SIZE || 500),
  };
}

async function loadMatureUncheckedIds(supabase: SupabaseClient, limit: number | null, pageSize: number) {
  const ids: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("radio_stations")
      .select("id")
      .eq("playback_status", "unchecked")
      .eq("is_mature", true)
      .eq("mature_review_status", "confirmed")
      .is("disabled_at", null)
      .order("imported_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) ids.push(String(row.id));
    if (limit && ids.length >= limit) return ids.slice(0, limit);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return ids;
}

async function loadRows(supabase: SupabaseClient, ids: string[]) {
  const rows: RadioVerifyRow[] = [];
  const select =
    "id, name, stream_url, source_stream_url, playback_status, reliability_score, consecutive_failures, status, is_active, is_verified, is_mature, mature_review_status, rights_status, quarantined_at, disabled_at";
  for (const idChunk of chunk(ids, 100)) {
    const { data, error } = await supabase
      .from("radio_stations")
      .select(select)
      .in("id", idChunk)
      .eq("is_mature", true);
    if (error) throw error;
    rows.push(...((data || []) as RadioVerifyRow[]));
  }
  return rows.filter((row) => row.playback_status === "unchecked");
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

  const ids = await loadMatureUncheckedIds(supabase, options.limit, options.pageSize);
  const rows = await loadRows(supabase, ids);
  const stats = {
    mode: options.mode,
    eligible: rows.length,
    attempted: 0,
    playable: 0,
    failed: 0,
    updated: 0,
    total_duration_ms: 0,
  };
  const started = performance.now();

  for (const row of rows) {
    const url = row.stream_url || row.source_stream_url;
    let probe: RadioStreamProbeResult = {
      playable: false,
      outcome: "failed",
      reason: "missing stream",
      finalUrl: null,
      contentType: null,
      bytesRead: 0,
      redirects: 0,
      playlistResolved: false,
      retryable: false,
      durationMs: 0,
    };
    if (url) probe = await probeRadioStream(url, { timeoutMs: options.timeoutMs });
    stats.attempted += 1;
    if (probe.playable) stats.playable += 1;
    else stats.failed += 1;

    if (options.mode === "execute") {
      const update = applyRadioVerificationProbe(row, probe);
      const payload: Record<string, unknown> = { ...update };
      if (probe.playable && probe.finalUrl) payload.stream_url = probe.finalUrl;
      const { error } = await supabase.from("radio_stations").update(payload).eq("id", row.id);
      if (!error) stats.updated += 1;
    }
  }

  stats.total_duration_ms = Math.round(performance.now() - started);
  const report = { batch: BATCH_NAME, ...stats };
  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
