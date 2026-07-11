import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

const adminRoot = path.resolve(__dirname, "..");
const candidatePath = path.join(adminRoot, "data", "radio-general-batch2-candidates.json");
const resultPath = path.join(adminRoot, "data", "radio-general-batch2-resume-result.json");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function main() {
  loadEnvFile(path.join(adminRoot, ".env.production"));
  loadEnvFile(path.join(adminRoot, ".env.local"));
  loadEnvFile(path.join(adminRoot, ".env"));
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase environment variables.");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { importNormalizedRadioStation } = await import("@/lib/radioCatalogWorker");
  const parsed = JSON.parse(fs.readFileSync(candidatePath, "utf8")) as { candidates?: Array<Record<string, unknown>> };
  const candidates = parsed.candidates || [];
  const sourceKeys = candidates.map((candidate) => `${candidate.source_name}:${candidate.source_station_id}`);
  const mapped = new Set<string>();
  for (const sourceChunk of chunk(sourceKeys, 100)) {
    const names = Array.from(new Set(sourceChunk.map((key) => key.split(":")[0])));
    const ids = sourceChunk.map((key) => key.slice(key.indexOf(":") + 1));
    const { data, error } = await supabase
      .from("radio_station_sources")
      .select("source_name, source_station_id")
      .in("source_name", names)
      .in("source_station_id", ids);
    if (error) throw error;
    for (const row of data || []) mapped.add(`${row.source_name}:${row.source_station_id}`);
  }

  const remaining = candidates.filter((candidate) => !mapped.has(`${candidate.source_name}:${candidate.source_station_id}`));
  const stats = {
    mode: "execute-resume",
    batch_candidate_count: candidates.length,
    already_mapped_before_resume: mapped.size,
    remaining_candidates: remaining.length,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    duplicate_canonical_stations: 0,
    conflicts: 0,
    failed_writes: 0,
    curated_field_protections_triggered: 0,
    verification_fields_preserved: 0,
  };
  const started = performance.now();
  for (const candidate of remaining) {
    try {
      const result = await importNormalizedRadioStation(candidate as never, { dryRun: false });
      if (result.classification === "inserted") stats.inserted += 1;
      else if (result.classification === "updated") stats.updated += 1;
      else if (result.classification === "unchanged") stats.unchanged += 1;
      else if (result.classification === "duplicate_canonical") stats.duplicate_canonical_stations += 1;
      else if (result.classification === "conflict") stats.conflicts += 1;
      if (result.curatedProtected) stats.curated_field_protections_triggered += 1;
      if (result.verificationPreserved) stats.verification_fields_preserved += 1;
    } catch {
      stats.failed_writes += 1;
    }
  }
  const now = new Date().toISOString();
  await supabase.from("radio_import_runs").upsert({
    run_id: "radio-general-batch2-execute-resume",
    source_name: "radio_browser",
    started_at: now,
    completed_at: now,
    status: "completed_metadata_import_resume",
    records_received: candidates.length,
    records_normalized: candidates.length,
    records_inserted: stats.inserted,
    records_updated: stats.updated,
    records_unchanged: stats.unchanged,
    duplicate_source_count: Math.max(0, candidates.length - mapped.size - remaining.length),
    duplicate_canonical_count: stats.duplicate_canonical_stations,
    conflict_count: stats.conflicts,
    invalid_count: 0,
    error_count: stats.failed_writes,
    updated_at: now,
  }, { onConflict: "run_id" });
  const report = { ...stats, runtime_seconds: Math.round((performance.now() - started) / 1000) };
  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
