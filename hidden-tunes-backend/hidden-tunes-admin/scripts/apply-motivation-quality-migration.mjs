/**
 * Apply Motivation expansion quality migration to Supabase.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(
  adminRoot,
  "supabase/migrations/20260712180000_motivation_expansion_quality.sql"
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
    throw new Error(`Management API migration failed (${response.status}): ${body}`);
  }

  return { ok: true, method: "management_api" };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sql = fs.readFileSync(migrationPath, "utf8");
  console.log(
    JSON.stringify(
      {
        migration: path.basename(migrationPath),
        dry_run: dryRun,
        bytes: sql.length,
      },
      null,
      2
    )
  );

  if (dryRun) return;

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
    "Could not apply migration. Set DATABASE_URL or SUPABASE_ACCESS_TOKEN + SUPABASE_URL."
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
