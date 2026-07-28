import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { supabaseAdmin } from "../lib/supabaseAdmin";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exactCount(apply?: (query: any) => any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabaseAdmin.from("podcast_quarantine").select("id", { count: "exact", head: true });
  if (apply) query = apply(query);
  const { count, error } = await query;
  if (error) {
    if (/does not exist|relation/i.test(error.message)) return 0;
    throw new Error(error.message);
  }
  return count || 0;
}

async function main() {
  const dryRun = !process.argv.includes("--execute");

  const [total, showRows, episodeRows, feedRows, matureRows] = await Promise.all([
    exactCount(),
    exactCount((q) => q.eq("entity_type", "show")),
    exactCount((q) => q.eq("entity_type", "episode")),
    exactCount((q) => q.eq("entity_type", "feed")),
    exactCount((q) => q.contains("details", { catalog: "mature" })),
  ]);

  const { data: samples, error } = await supabaseAdmin
    .from("podcast_quarantine")
    .select("id, entity_type, entity_id, feed_url, reason, created_at, details")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error && !/podcast_quarantine/i.test(error.message)) {
    throw new Error(error.message);
  }

  const reasonCounts: Record<string, number> = {};
  for (const row of samples || []) {
    const reason = String(row.reason || "(missing)");
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        dry_run: dryRun,
        totals: {
          quarantine_rows: total,
          shows: showRows,
          episodes: episodeRows,
          feeds: feedRows,
          mature_catalog: matureRows,
        },
        recent_reasons: reasonCounts,
        samples: samples || [],
        note: dryRun
          ? "Read-only review. Pass --execute only for future manual release workflows."
          : "Execute mode is audit-only in Phase B.",
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
