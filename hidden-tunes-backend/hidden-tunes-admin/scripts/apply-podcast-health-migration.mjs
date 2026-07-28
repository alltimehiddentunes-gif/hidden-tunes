/**
 * Apply podcast health queue enhancement migration.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const migrationPath = path.join(
  adminRoot,
  "supabase/migrations/20260710200000_podcast_health_queue_enhance.sql"
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

async function applyWithPg(sql) {
  const databaseUrl = String(
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || ""
  ).trim();
  if (!databaseUrl) return { ok: false, skipped: true };
  const pg = await import("pg");
  const client = new pg.default.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    return { ok: true };
  } finally {
    await client.end();
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sql = fs.readFileSync(migrationPath, "utf8");
  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dry_run: true, bytes: sql.length }));
    return;
  }
  const result = await applyWithPg(sql);
  console.log(JSON.stringify({ ok: result.ok, applied: result.ok, result }));
  if (!result.ok) process.exit(2);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
