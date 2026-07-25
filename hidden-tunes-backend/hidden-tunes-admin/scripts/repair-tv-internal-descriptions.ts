/**
 * Clean internal importer/discovery text out of public tv_videos.description.
 *
 * Usage:
 *   npx tsx scripts/repair-tv-internal-descriptions.ts           # dry-run
 *   npx tsx scripts/repair-tv-internal-descriptions.ts --execute # write nulls
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  sanitizePublicTvDescription,
} from "../lib/tvDescriptionSanitizer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");
const outDir = path.join(adminRoot, "data", "tv-description-cleanup");

function loadEnv(file: string) {
  const p = path.join(adminRoot, file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

type Row = {
  id: string;
  title: string;
  description: string | null;
  region: string | null;
  source_key: string | null;
  catalog_eligibility_tier: string | null;
  status: string | null;
  playback_status: string | null;
  is_active: boolean | null;
  quarantined_at: string | null;
  created_at: string | null;
};

async function fetchDescribedRows(sb: {
  from: (table: string) => any;
}): Promise<Row[]> {
  const pageSize = 1000;
  let from = 0;
  const all: Row[] = [];
  while (true) {
    const { data, error } = await sb
      .from("tv_videos")
      .select(
        "id,title,description,region,source_key,catalog_eligibility_tier,status,playback_status,is_active,quarantined_at,created_at"
      )
      .not("description", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as Row[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  loadEnv(".env.local");
  const execute = process.argv.includes("--execute");
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  fs.mkdirSync(outDir, { recursive: true });

  console.log(
    JSON.stringify(
      {
        mode: execute ? "execute" : "dry-run",
        supabase: url,
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  const rows = await fetchDescribedRows(sb);
  const toNull: Array<{
    id: string;
    title: string;
    region: string | null;
    reason: string | null;
    before: string;
    source_key: string | null;
  }> = [];
  const preserved: Array<{ id: string; title: string; description: string }> =
    [];

  for (const row of rows) {
    const result = sanitizePublicTvDescription(row.description);
    if (result.rejected) {
      toNull.push({
        id: row.id,
        title: row.title,
        region: row.region,
        reason: result.reason,
        before: String(row.description || "").slice(0, 500),
        source_key: row.source_key,
      });
    } else if (result.text) {
      preserved.push({
        id: row.id,
        title: row.title,
        description: result.text.slice(0, 300),
      });
    }
  }

  const byReason: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  for (const item of toNull) {
    const reason = item.reason || "unknown";
    byReason[reason] = (byReason[reason] || 0) + 1;
    const country = String(item.region || "?").toUpperCase() || "?";
    byCountry[country] = (byCountry[country] || 0) + 1;
  }

  const proofIds = [
    "8f30fc88-416a-4e44-bf1f-0d07399b562d", // RTM+
  ];
  const proofBefore = toNull.filter(
    (r) =>
      proofIds.includes(r.id) ||
      /RTM\+/i.test(r.title) ||
      (r.region === "GH" && /G-eye/i.test(r.title)) ||
      (r.region === "FR" && toNull.indexOf(r) < 3) ||
      (r.region === "US" && toNull.indexOf(r) < 5) ||
      (r.region === "CA" && toNull.indexOf(r) < 5) ||
      (r.region === "ZA" && toNull.indexOf(r) < 3)
  );

  let updated = 0;
  let failures: Array<{ id: string; error: string }> = [];

  if (execute && toNull.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < toNull.length; i += batchSize) {
      const batch = toNull.slice(i, i + batchSize);
      const ids = batch.map((b) => b.id);
      const { error } = await sb
        .from("tv_videos")
        .update({ description: null })
        .in("id", ids);
      if (error) {
        failures.push({ id: ids[0], error: error.message });
        console.error("batch_failed", i, error.message);
      } else {
        updated += ids.length;
      }
    }
  }

  const report = {
    mode: execute ? "execute" : "dry-run",
    audited_with_description: rows.length,
    flagged_to_null: toNull.length,
    preserved_good: preserved.length,
    updated,
    failures,
    byReason,
    byCountry: Object.fromEntries(
      Object.entries(byCountry)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
    ),
    proof_samples_before: proofBefore.slice(0, 20),
    preserved_sample: preserved.slice(0, 20),
    finishedAt: new Date().toISOString(),
  };

  const reportPath = path.join(
    outDir,
    execute ? "CLEANUP-EXECUTE-REPORT.json" : "CLEANUP-DRY-RUN-REPORT.json"
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(outDir, "CLEANUP-IDS.json"),
    JSON.stringify(
      toNull.map((r) => ({ id: r.id, reason: r.reason, title: r.title })),
      null,
      2
    )
  );

  console.log(JSON.stringify(report, null, 2));
  console.log("Wrote", reportPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
