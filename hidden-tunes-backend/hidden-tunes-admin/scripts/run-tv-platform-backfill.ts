#!/usr/bin/env npx tsx
/**
 * Classify existing TV station URLs and fail-closed platform flags before health validation.
 * Usage: npx tsx scripts/run-tv-platform-backfill.ts [batchSize] [offset]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(adminRoot, ".env.local"));

async function main() {
  const batchSize = Math.max(1, Math.min(Number(process.argv[2] || 500), 5000));
  const offset = Math.max(0, Number(process.argv[3] || 0));

  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const { classifyStreamUrl } = await import("../lib/tvStreamProtocol");

  const { data, error } = await supabaseAdmin
    .from("tv_videos")
    .select("id, source_type, source_url")
    .order("id", { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) {
    throw new Error(error.message);
  }

  let updated = 0;
  for (const row of data || []) {
    const sourceType = String(row.source_type || "");
    const sourceUrl = String(row.source_url || "").trim();
    let streamProtocol: string | null = "unknown";
    let streamIsHttps = false;

    if (sourceType.startsWith("youtube")) {
      streamProtocol = "youtube";
      streamIsHttps = true;
    } else {
      const classification = classifyStreamUrl(sourceUrl);
      streamProtocol = classification.protocol;
      streamIsHttps = classification.streamIsHttps;
    }

    const { error: updateError } = await supabaseAdmin
      .from("tv_videos")
      .update({
        stream_protocol: streamProtocol,
        stream_is_https: streamIsHttps,
        ios_playable: false,
        android_playable: false,
        last_validation_result: "pending_revalidation",
      })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        offset,
        batchSize,
        scanned: (data || []).length,
        updated,
        nextOffset: offset + (data || []).length,
      },
      null,
      2
    )
  );
}

void main();
