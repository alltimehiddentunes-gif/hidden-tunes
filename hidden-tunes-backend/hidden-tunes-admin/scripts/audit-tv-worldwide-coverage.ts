import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { supabaseAdmin } from "../lib/supabaseAdmin";
import { getTvPlatformEligibleCount } from "../lib/tvExpansion25k/platformCount";
import { TV_EXPANSION_CHECKPOINT_DIR } from "../lib/tvExpansion25k/constants";
import { WORLDWIDE_COUNTRY_CODES } from "../lib/tvExpansion25k/worldwide/countryCodes";

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
  const platformEligible = await getTvPlatformEligibleCount();
  const { data, error } = await supabaseAdmin
    .from("tv_videos")
    .select("region, category, source_type, tags, title")
    .eq("is_active", true)
    .eq("status", "approved");

  if (error) throw new Error(error.message);

  const rows = data || [];
  const countries = new Set<string>();
  const categories = new Set<string>();
  const sourceTypes = new Map<string, number>();
  const regionCounts = new Map<string, number>();

  for (const row of rows as Array<Record<string, unknown>>) {
    const region = String(row.region || "").trim().toUpperCase();
    if (region) {
      countries.add(region);
      const worldwide = WORLDWIDE_COUNTRY_CODES.find((entry) => entry.code === region);
      const bucket = worldwide?.region || "Unknown";
      regionCounts.set(bucket, (regionCounts.get(bucket) || 0) + 1);
    }
    const category = String(row.category || "").trim();
    if (category) categories.add(category);
    const sourceType = String(row.source_type || "unknown");
    sourceTypes.set(sourceType, (sourceTypes.get(sourceType) || 0) + 1);
  }

  const report = {
    at: new Date().toISOString(),
    platformEligible,
    catalogRows: rows.length,
    countriesRepresented: countries.size,
    categoriesRepresented: categories.size,
    regionBuckets: Object.fromEntries(regionCounts),
    sourceTypes: Object.fromEntries(sourceTypes),
    worldwideCoverageFile: path.join(adminRoot, TV_EXPANSION_CHECKPOINT_DIR, "worldwide-coverage.json"),
    buildReportFile: path.join(adminRoot, TV_EXPANSION_CHECKPOINT_DIR, "worldwave-build-report.json"),
  };

  const outPath = path.join(adminRoot, TV_EXPANSION_CHECKPOINT_DIR, "worldwide-coverage-audit.json");
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
