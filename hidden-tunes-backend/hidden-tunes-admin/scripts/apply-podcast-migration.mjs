/**
 * Apply podcast catalog migration to Supabase.
 *
 * Requires one of:
 * - DATABASE_URL or SUPABASE_DB_URL (direct Postgres)
 * - SUPABASE_ACCESS_TOKEN + SUPABASE_URL (Management API)
 *
 * Never prints secret values.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(
  adminRoot,
  "supabase/migrations/20260627120000_podcast_catalog.sql"
);

function loadEnvFile(filePath) {
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

function projectRefFromUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host.split(".")[0] || "";
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
    return {
      ok: false,
      method: "management_api",
      status: response.status,
      error: body,
    };
  }

  return { ok: true, method: "management_api", result: body };
}

async function verifyTables() {
  const { createClient } = await import("@supabase/supabase-js");
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, error: "Missing Supabase env for verification" };
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tables = ["podcast_categories", "podcast_shows", "podcast_episodes"];
  const results = {};

  for (const table of tables) {
    const { error, count } = await client
      .from(table)
      .select("*", { count: "exact", head: true });
    results[table] = {
      exists: !error,
      error: error?.message || null,
      count: typeof count === "number" ? count : null,
    };
  }

  return { ok: true, tables: results };
}

async function main() {
  if (!fs.existsSync(migrationPath)) {
    console.log(JSON.stringify({ ok: false, error: "Migration file missing" }));
    process.exit(1);
  }

  let sql = fs.readFileSync(migrationPath, "utf8").trim();
  if (!/notify\s+pgrst/i.test(sql)) {
    sql += "\n\nnotify pgrst, 'reload schema';\n";
  }

  const pgResult = await applyWithPg(sql);
  if (pgResult.ok) {
    const verified = await verifyTables();
    console.log(JSON.stringify({ ok: true, applied: true, pgResult, verified }));
    return;
  }

  const apiResult = await applyWithManagementApi(sql);
  if (apiResult.ok) {
    const verified = await verifyTables();
    console.log(
      JSON.stringify({ ok: true, applied: true, apiResult, verified })
    );
    return;
  }

  console.log(
    JSON.stringify({
      ok: false,
      applied: false,
      pgResult,
      apiResult,
      manual:
        "Paste supabase/migrations/20260627120000_podcast_catalog.sql into Supabase SQL editor, append notify pgrst, 'reload schema';, then run.",
    })
  );
  process.exit(2);
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exit(1);
});
