/**
 * Full Radio Browser walk — import every missing station UUID.
 * Does not stop on duplicate-only pages (unlike query-pack discovery).
 *
 *   npx tsx scripts/run-radio-rb-full-walk-import.ts --execute
 *   npx tsx scripts/run-radio-rb-full-walk-import.ts --execute --target 20000 --page-size 100
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import {
  isCatalogDuplicate,
  loadCatalogDedupeIndex,
} from "@/lib/radioExpansion25k/catalogDedupeIndex";
import { insertNewRadioStationOnly } from "@/lib/radioExpansion25k/insertOnlyImport";
import {
  fetchRadioBrowserJson,
  isMatureRadioCandidate,
  sleep,
} from "@/lib/radioExpansion25k/radioBrowserFetch";
import { normalizeRadioBrowserStationForImport } from "@/lib/radioNormalization";

const adminRoot = path.resolve(__dirname, "..");
const RESULT_PATH = path.join(adminRoot, "data", "radio-rb-full-walk-result.json");
const CHECKPOINT_PATH = path.join(adminRoot, "data", "radio-rb-full-walk-checkpoint.json");
const USER_AGENT = "HiddenTunes/1.0 radio-full-walk";

type Checkpoint = {
  offset: number;
  inserted: number;
  duplicates: number;
  mature_excluded: number;
  invalid: number;
  failed: number;
  pages: number;
  inserted_station_ids: string[];
};

function readArgs() {
  const order =
    process.argv.includes("--order")
      ? String(process.argv[process.argv.indexOf("--order") + 1] || "name")
      : "name";
  const reverse = process.argv.includes("--reverse")
    ? String(process.argv[process.argv.indexOf("--reverse") + 1] || "false")
    : "false";
  const checkpointName =
    process.argv.includes("--checkpoint")
      ? String(process.argv[process.argv.indexOf("--checkpoint") + 1] || "default")
      : "default";
  return {
    execute: process.argv.includes("--execute"),
    target: Number(
      process.argv.includes("--target") ? process.argv[process.argv.indexOf("--target") + 1] : 20_000
    ),
    pageSize: Number(
      process.argv.includes("--page-size")
        ? process.argv[process.argv.indexOf("--page-size") + 1]
        : 100
    ),
    delayMs: Number(process.env.RADIO_BATCH_DELAY_MS || 400),
    maxPages: Number(
      process.argv.includes("--max-pages")
        ? process.argv[process.argv.indexOf("--max-pages") + 1]
        : 1_000
    ),
    order,
    reverse: reverse === "true" || reverse === "1",
    checkpointName,
  };
}

function checkpointPathFor(name: string) {
  if (name === "default") return CHECKPOINT_PATH;
  return path.join(adminRoot, "data", `radio-rb-full-walk-${name}-checkpoint.json`);
}

function resultPathFor(name: string) {
  if (name === "default") return RESULT_PATH;
  return path.join(adminRoot, "data", `radio-rb-full-walk-${name}-result.json`);
}

function loadCheckpoint(filePath: string): Checkpoint {
  if (!fs.existsSync(filePath)) {
    return {
      offset: 0,
      inserted: 0,
      duplicates: 0,
      mature_excluded: 0,
      invalid: 0,
      failed: 0,
      pages: 0,
      inserted_station_ids: [],
    };
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Checkpoint;
}

function saveCheckpoint(filePath: string, checkpoint: Checkpoint) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2));
}

async function main() {
  loadAdminEnv(adminRoot);
  const options = readArgs();
  const checkpointFile = checkpointPathFor(options.checkpointName);
  const resultFile = resultPathFor(options.checkpointName);
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const checkpoint = loadCheckpoint(checkpointFile);
  const catalogIndex = await loadCatalogDedupeIndex(supabase);
  const started = Date.now();

  console.log(
    JSON.stringify({
      mode: options.execute ? "execute" : "dry-run",
      checkpoint: options.checkpointName,
      order: options.order,
      reverse: options.reverse,
      resume_offset: checkpoint.offset,
      target: options.target,
      already_inserted: checkpoint.inserted,
    })
  );

  while (checkpoint.inserted < options.target && checkpoint.pages < options.maxPages) {
    const apiPath = `/json/stations?hidebroken=false&limit=${options.pageSize}&offset=${checkpoint.offset}&order=${encodeURIComponent(options.order)}&reverse=${options.reverse ? "true" : "false"}`;
    await sleep(options.delayMs);

    let stations: Awaited<ReturnType<typeof fetchRadioBrowserJson>>["stations"] = [];
    let server = "unknown";
    try {
      const fetched = await fetchRadioBrowserJson(apiPath, {
        timeoutMs: 20_000,
        userAgent: USER_AGENT,
        maxRetries: 4,
      });
      stations = fetched.stations;
      server = fetched.server;
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "page_fetch_failed",
          offset: checkpoint.offset,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      await sleep(2000);
      continue;
    }

    checkpoint.pages += 1;
    if (!stations.length) {
      console.log(JSON.stringify({ complete: true, reason: "rb_exhausted", offset: checkpoint.offset }));
      break;
    }

    let pageInserted = 0;
    for (const raw of stations) {
      if (checkpoint.inserted >= options.target) break;
      const normalized = normalizeRadioBrowserStationForImport(raw, "global", {
        sourceServer: server,
      });
      if (!normalized) {
        checkpoint.invalid += 1;
        continue;
      }
      if (isMatureRadioCandidate(normalized)) {
        checkpoint.mature_excluded += 1;
        continue;
      }
      if (isCatalogDuplicate(normalized, catalogIndex)) {
        checkpoint.duplicates += 1;
        continue;
      }

      if (!options.execute) {
        checkpoint.inserted += 1;
        pageInserted += 1;
        catalogIndex.sourceKeys.add(`${normalized.source_name}:${normalized.source_station_id}`);
        catalogIndex.streams.add(normalized.normalized_stream_url);
        catalogIndex.fingerprints.add(normalized.station_fingerprint);
        continue;
      }

      const result = await insertNewRadioStationOnly(supabase, normalized, { dryRun: false });
      if (result.outcome === "inserted") {
        checkpoint.inserted += 1;
        pageInserted += 1;
        if (result.stationId) checkpoint.inserted_station_ids.push(result.stationId);
        catalogIndex.sourceKeys.add(`${normalized.source_name}:${normalized.source_station_id}`);
        catalogIndex.streams.add(normalized.normalized_stream_url);
        catalogIndex.fingerprints.add(normalized.station_fingerprint);
      } else if (result.outcome === "duplicate") {
        checkpoint.duplicates += 1;
      } else {
        checkpoint.failed += 1;
      }
    }

    checkpoint.offset += options.pageSize;
    if (checkpoint.pages % 5 === 0 || pageInserted > 0) {
      saveCheckpoint(checkpointFile, checkpoint);
      console.log(
        JSON.stringify({
          walk_progress: {
            checkpoint: options.checkpointName,
            order: options.order,
            pages: checkpoint.pages,
            offset: checkpoint.offset,
            inserted: checkpoint.inserted,
            page_inserted: pageInserted,
            duplicates: checkpoint.duplicates,
            mature_excluded: checkpoint.mature_excluded,
            failed: checkpoint.failed,
            target: options.target,
          },
        })
      );
    }
  }

  saveCheckpoint(checkpointFile, checkpoint);
  const report = {
    ...checkpoint,
    checkpoint: options.checkpointName,
    order: options.order,
    reverse: options.reverse,
    runtime_seconds: Math.round((Date.now() - started) / 1000),
    mode: options.execute ? "execute" : "dry-run",
  };
  fs.writeFileSync(resultFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
