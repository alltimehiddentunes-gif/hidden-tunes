/**
 * Apply mature radio service_role grants migration.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const migrationPath = path.join(
  adminRoot,
  "supabase/migrations/20260721230000_radio_mature_service_role_grants.sql"
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
  const supabaseUrl = String(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  ).trim();
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
  if (!response.ok) {
    return { ok: false, method: "management_api", error: text.slice(0, 500) };
  }
  return { ok: true, method: "management_api" };
}

async function main() {
  const sql = fs.readFileSync(migrationPath, "utf8");
  let result = await applyWithPg(sql);
  if (result.skipped) result = await applyWithManagementApi(sql);
  if (!result.ok) {
    console.error(JSON.stringify({ success: false, result }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ success: true, result, migration: path.basename(migrationPath) }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
