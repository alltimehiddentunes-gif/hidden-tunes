/**
 * Rollback Verified Live Concerts Phase 2 schema.
 *
 * Usage:
 *   node scripts/rollback-concerts-migration.mjs --dry-run
 *   node scripts/rollback-concerts-migration.mjs --confirm-destructive
 *
 * Requires --confirm-destructive to execute. Prefer --dry-run.
 * Do not run against production without an explicit operator decision.
 */
import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");
const rollbackPath = path.join(
  adminRoot,
  "supabase/migrations/rollback/20260718190200_rollback_concerts_phase2.sql"
);

function loadEnvFile(filePath) {
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

function projectRefFromUrl(url) {
  try {
    return new URL(url).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

async function applyWithPg(sql) {
  const databaseUrl = String(
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || ""
  ).trim();
  if (!databaseUrl) return { ok: false, method: "pg", skipped: true };

  const pg = await import("pg");
  const client = new pg.default.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    return { ok: true, method: "pg" };
  } finally {
    await client.end();
  }
}

async function applyWithManagementApi(sql) {
  const token = String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const projectRef = projectRefFromUrl(supabaseUrl);
  if (!token || !projectRef) {
    return { ok: false, method: "management_api", skipped: true };
  }

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Management API rollback failed (${response.status}): ${body}`);
  }

  return { ok: true, method: "management_api" };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const confirmed = process.argv.includes("--confirm-destructive");

  if (!fs.existsSync(rollbackPath)) {
    throw new Error(`Missing rollback SQL: ${rollbackPath}`);
  }

  const sql = fs.readFileSync(rollbackPath, "utf8");
  const forbidden = [
    /drop table if exists public\.(tv_|sports_|motivation_|lecture_|radio_|podcast_)/i,
    /prisma/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(sql)) {
      throw new Error(`Rollback SQL failed safety check: ${pattern}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        rollback: path.basename(rollbackPath),
        dry_run: dryRun,
        confirmed_destructive: confirmed,
        bytes: sql.length,
      },
      null,
      2
    )
  );

  if (dryRun) {
    console.log(JSON.stringify({ success: true, dry_run: true }, null, 2));
    return;
  }

  if (!confirmed) {
    throw new Error(
      "Refusing to run destructive rollback without --confirm-destructive"
    );
  }

  const pgResult = await applyWithPg(sql);
  if (pgResult.ok) {
    console.log(JSON.stringify({ success: true, method: pgResult.method }, null, 2));
    return;
  }

  const apiResult = await applyWithManagementApi(sql);
  if (apiResult.ok) {
    console.log(JSON.stringify({ success: true, method: apiResult.method }, null, 2));
    return;
  }

  throw new Error(
    "Could not run rollback. Set DATABASE_URL or SUPABASE_ACCESS_TOKEN + SUPABASE_URL."
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
