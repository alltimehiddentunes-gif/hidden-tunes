import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const migrationPath = path.join(
  adminRoot,
  "supabase/migrations/20260715180000_tv_mature_catalog_isolation.sql"
);

function main() {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const report = {
    at: new Date().toISOString(),
    migrationFilename: "20260715180000_tv_mature_catalog_isolation.sql",
    migrationApplied: false,
    flagEnabled: process.env.TV_MATURE_ISOLATION_ENABLED === "true",
    tableChanged: "tv_videos",
    columns: [
      { name: "is_mature", type: "boolean", default: "false", nullable: false },
      { name: "mature_rating", type: "text", default: null, nullable: true },
      { name: "mature_source_approved", type: "boolean", default: "false", nullable: false },
      { name: "mature_approval_reference", type: "text", default: null, nullable: true },
      { name: "mature_reviewed_at", type: "timestamptz", default: null, nullable: true },
      { name: "mature_allowed_countries", type: "text[]", default: null, nullable: true },
      { name: "mature_blocked_countries", type: "text[]", default: null, nullable: true },
    ],
    indexes: [
      "tv_videos_public_normal_catalog_idx (is_mature=false)",
      "tv_videos_public_mature_catalog_idx (is_mature=true AND mature_source_approved=true)",
    ],
    apiCompatibility:
      "General browse APIs exclude mature rows once TV_MATURE_ISOLATION_ENABLED=true after migration.",
    rollbackPlan:
      "Drop indexes, drop additive columns if no mature rows were imported. Existing rows remain general (is_mature=false).",
    existingRowBehavior: "All existing rows default to is_mature=false; no row becomes mature automatically.",
    runtimeEstimate: "Seconds on current catalog size — additive columns with defaults.",
    deploymentSteps: [
      "Apply migration on production database during maintenance window",
      "Deploy backend with TV_MATURE_ISOLATION_ENABLED=true",
      "Verify general TV API counts unchanged",
      "Run mature isolation tests",
    ],
    sqlPreviewLines: sql.split(/\r?\n/).slice(0, 12),
  };

  const outPath = path.join(adminRoot, "data/tv-expansion-wave4/mature-migration-readiness.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
