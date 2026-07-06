/**
 * Apply audiobook catalog production schema repair migration.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const migrationPaths = [
  "supabase/migrations/20260706123000_audiobook_catalog_production_schema_repair.sql",
  "supabase/migrations/20260706130000_audiobook_catalog_upgrade.sql",
  "supabase/migrations/20260706150000_audiobook_scale_import_and_description_repair.sql",
].map((migration) => path.join(adminRoot, migration));
const generatedSqlPath = path.join(
  adminRoot,
  "supabase/generated/audiobook-production-migrations.sql"
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

loadEnvFile(path.join(adminRoot, ".env.production"));
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

  if (!databaseUrl) return { ok: false, skipped: true, method: "pg" };

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
    return { ok: false, skipped: true, method: "management_api" };
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
  return {
    ok: response.ok,
    method: "management_api",
    status: response.status,
    body: text.slice(0, 500),
  };
}

async function checkServiceRolePostgrest() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      skipped: true,
      method: "service_role_postgrest",
      reason: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.",
    };
  }

  return {
    ok: false,
    skipped: true,
    method: "service_role_postgrest",
    reason:
      "Supabase service-role keys authenticate PostgREST table/RPC requests, but PostgREST does not expose arbitrary PostgreSQL DDL execution. This migration contains CREATE/ALTER/INDEX/TRIGGER statements, so it cannot be executed with only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY unless the database already has a trusted SQL-exec RPC, which this project does not assume for safety.",
  };
}

function writeSqlBundle(sql) {
  fs.mkdirSync(path.dirname(generatedSqlPath), { recursive: true });
  fs.writeFileSync(generatedSqlPath, `${sql.trim()}\n`, "utf8");
  return path.relative(adminRoot, generatedSqlPath).replace(/\\/g, "/");
}

async function main() {
  let sql = migrationPaths
    .map((migrationPath) => fs.readFileSync(migrationPath, "utf8").trim())
    .join("\n\n");
  if (!/notify\s+pgrst/i.test(sql)) {
    sql += "\n\nnotify pgrst, 'reload schema';\n";
  }

  const pgResult = await applyWithPg(sql);
  if (pgResult.ok) {
    console.log(JSON.stringify({ ok: true, applied: true, pgResult }));
    return;
  }

  const apiResult = await applyWithManagementApi(sql);
  if (apiResult.ok) {
    console.log(JSON.stringify({ ok: true, applied: true, apiResult }));
    return;
  }

  const serviceRoleResult = await checkServiceRolePostgrest();
  const generated_sql = writeSqlBundle(sql);

  console.log(
    JSON.stringify({
      ok: false,
      applied: false,
      pgResult,
      apiResult,
      serviceRoleResult,
      generated_sql,
      env: {
        DATABASE_URL: Boolean(process.env.DATABASE_URL),
        SUPABASE_DB_URL: Boolean(process.env.SUPABASE_DB_URL),
        SUPABASE_ACCESS_TOKEN: Boolean(process.env.SUPABASE_ACCESS_TOKEN),
        SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
      manual:
        "Automatic DDL execution is unavailable with only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Apply the generated SQL bundle in Supabase SQL Editor, or add DATABASE_URL/SUPABASE_DB_URL/SUPABASE_ACCESS_TOKEN and rerun this command.",
    })
  );
  process.exit(2);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
