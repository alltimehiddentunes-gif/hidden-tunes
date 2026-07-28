import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import {
  defaultMatureRadioCheckpoint,
  loadMatureRadioCheckpoint,
  saveMatureRadioCheckpoint,
  saveMatureRadioResult,
} from "@/lib/radioMature/checkpoint";
import { RADIO_MATURE_EXPANSION_SOURCE_KEY } from "@/lib/radioMature/constants";
import { runMatureRadioDiscoveryImport } from "@/lib/radioMature/runner";
import { getMatureRadioSource } from "@/lib/radioMature/sourceRegistry";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function readArgs() {
  const args = new Set(process.argv.slice(2));
  const maxPagesIndex = process.argv.indexOf("--max-pages");
  return {
    mode: args.has("--execute") ? ("execute" as const) : ("dry-run" as const),
    reset: args.has("--reset"),
    maxPages: maxPagesIndex >= 0 ? Number(process.argv[maxPagesIndex + 1]) : 500,
    delayMs: Number(process.env.RADIO_MATURE_BATCH_DELAY_MS || 750),
    timeoutMs: Number(process.env.RADIO_MATURE_BATCH_TIMEOUT_MS || 12_000),
    pageSize: Number(process.env.RADIO_MATURE_PAGE_SIZE || 25),
  };
}

async function assertMatureSchemaReady(supabase: SupabaseClient) {
  const { error } = await supabase
    .from("radio_stations")
    .select("id,mature_review_status,mature_source_approved,rights_status")
    .limit(1);
  if (error) {
    throw new Error(
      `Mature radio schema not ready (${error.message}). Apply supabase/migrations/20260715193000_radio_mature_catalog.sql first (npm run radio:mature:apply-migration).`
    );
  }
  const queue = await supabase.from("radio_mature_review_queue").select("id").limit(1);
  if (queue.error) {
    throw new Error(
      `Mature radio review queue missing (${queue.error.message}). Apply the mature radio migration first.`
    );
  }
}

async function syncSourceRegistry(
  supabase: SupabaseClient,
  checkpoint: ReturnType<typeof loadMatureRadioCheckpoint>,
  report: Record<string, unknown>
) {
  const source = getMatureRadioSource(RADIO_MATURE_EXPANSION_SOURCE_KEY);
  if (!source) return;

  const payload = {
    source_key: source.source_key,
    source_name: source.source_name,
    provider_name: source.provider_name,
    official_url: source.official_url,
    discovery_url: source.discovery_url,
    country_or_region: source.country_or_region,
    languages: source.languages,
    rights_status: source.rights_status,
    rights_notes: source.rights_notes,
    automation_status: source.automation_status,
    embedding_status: source.embedding_status,
    playback_status: source.playback_status,
    approval_status: checkpoint.cursor_complete ? "exhausted" : source.approval_status,
    requires_manual_review: source.requires_manual_review,
    adapter_name: source.adapter_name,
    cursor_offset: Object.values(checkpoint.query_offsets).reduce((max, value) => Math.max(max, value), 0),
    cursor_complete: checkpoint.cursor_complete,
    last_discovery_at: new Date().toISOString(),
    last_success_at: new Date().toISOString(),
    candidate_count: checkpoint.stats.raw_candidates,
    imported_count: checkpoint.stats.inserted,
    rejected_count: checkpoint.stats.rejected,
    published_count: 0,
    metadata: { stats: checkpoint.stats, report },
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("radio_mature_source_registry")
    .upsert(payload as never, { onConflict: "source_key" });
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

  if (options.mode === "execute") {
    await assertMatureSchemaReady(supabase);
  }

  let checkpoint = loadMatureRadioCheckpoint(adminRoot);
  if (options.reset) {
    checkpoint = defaultMatureRadioCheckpoint();
    saveMatureRadioCheckpoint(adminRoot, checkpoint);
  }

  if (checkpoint.cursor_complete) {
    console.log(
      JSON.stringify(
        {
          success: true,
          message: "Source already exhausted. Re-run with --reset after migration if a fresh import is needed.",
          checkpoint,
        },
        null,
        2
      )
    );
    return;
  }

  const run = await runMatureRadioDiscoveryImport(supabase, checkpoint, options);
  saveMatureRadioCheckpoint(adminRoot, checkpoint);

  const report = {
    success: true,
    mode: options.mode,
    source: RADIO_MATURE_EXPANSION_SOURCE_KEY,
    pages_processed: run.pagesProcessed,
    remaining_queries: run.remainingQueries,
    cursor_complete: run.cursorComplete,
    stats: checkpoint.stats,
    query_offsets: checkpoint.query_offsets,
    exhausted_queries: checkpoint.exhausted_queries,
  };

  saveMatureRadioResult(adminRoot, report);
  await syncSourceRegistry(supabase, checkpoint, report).catch(() => undefined);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
