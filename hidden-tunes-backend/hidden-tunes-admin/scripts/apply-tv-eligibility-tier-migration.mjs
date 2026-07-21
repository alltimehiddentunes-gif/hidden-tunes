/**
 * Apply only the TV catalog eligibility tier migration.
 * Loads env from TV_BASELINE_ENV_FILE or local .env.local.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");
const migrationFile = "20260721120000_tv_catalog_eligibility_tier.sql";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
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
  return true;
}

loadEnvFile(
  process.env.TV_BASELINE_ENV_FILE ||
    "C:\\Users\\Wills\\Desktop\\HiddenTunes\\hidden-tunes-backend\\hidden-tunes-admin\\.env.local"
);
loadEnvFile(path.join(adminRoot, ".env.local"));
loadEnvFile(path.join(adminRoot, ".env.production"));
loadEnvFile(path.join(adminRoot, ".env"));

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

  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 300) };
  }

  if (!response.ok) {
    return { ok: false, method: "management_api", status: response.status, error: body };
  }

  return { ok: true, method: "management_api", result: body };
}

async function main() {
  const sqlPath = path.join(adminRoot, "supabase/migrations", migrationFile);
  const sql = fs.readFileSync(sqlPath, "utf8");

  const pgResult = await applyWithPg(sql);
  if (pgResult.ok) {
    console.log(JSON.stringify({ success: true, method: pgResult.method, migration: migrationFile }, null, 2));
    return;
  }

  const apiResult = await applyWithManagementApi(sql);
  if (apiResult.ok) {
    console.log(JSON.stringify({ success: true, method: apiResult.method, migration: migrationFile }, null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        success: false,
        migration: migrationFile,
        message: "No DATABASE_URL / SUPABASE_ACCESS_TOKEN locally — apply via VPS.",
        pg: pgResult,
        managementApi: apiResult,
      },
      null,
      2
    )
  );
  process.exit(2);
}

void main();
