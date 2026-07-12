/**
 * Apply Lecture catalog migration to Supabase (lecture-only).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(
  adminRoot,
  "supabase/migrations/20260707130000_lecture_catalog.sql"
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

async function verifyTables() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, skipped: true, reason: "missing_supabase_env" };
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };

  const tables = ["lecture_categories", "lecture_items", "lecture_files"];
  const counts = {};
  for (const table of tables) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${table}?select=id&limit=1`,
      { headers }
    );
    counts[table] = { status: response.status, ok: response.ok };
  }

  return { ok: Object.values(counts).every((entry) => entry.ok), counts };
}

async function main() {
  if (!fs.existsSync(migrationPath)) {
    console.error("Migration file missing:", migrationPath);
    process.exit(1);
  }

  let sql = fs.readFileSync(migrationPath, "utf8").trim();
  if (!/notify\s+pgrst/i.test(sql)) {
    sql += "\n\nnotify pgrst, 'reload schema';\n";
  }

  const pgResult = await applyWithPg(sql);
  if (pgResult.ok) {
    const verify = await verifyTables();
    console.log(JSON.stringify({ success: true, method: pgResult.method, verify }, null, 2));
    return;
  }

  const apiResult = await applyWithManagementApi(sql);
  if (apiResult.ok) {
    const verify = await verifyTables();
    console.log(JSON.stringify({ success: true, method: apiResult.method, verify }, null, 2));
    return;
  }

  const verifyBefore = await verifyTables();
  console.log(
    JSON.stringify(
      {
        success: verifyBefore.ok,
        message: verifyBefore.ok
          ? "Tables already exist; migration may have been applied previously."
          : "Set DATABASE_URL or SUPABASE_ACCESS_TOKEN to apply the lecture migration.",
        verify: verifyBefore,
        pg: pgResult,
        managementApi: apiResult,
      },
      null,
      2
    )
  );
  process.exit(verifyBefore.ok ? 0 : 1);
}

void main();
