/**
 * Apply mature radio catalog migration.
 * Prefers DATABASE_URL / SUPABASE_DB_URL; falls back to SUPABASE_ACCESS_TOKEN Management API.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const migrationPath = path.join(
  adminRoot,
  "supabase/migrations/20260715193000_radio_mature_catalog.sql"
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

async function main() {
  let sql = fs.readFileSync(migrationPath, "utf8");
  if (!/notify\s+pgrst/i.test(sql)) {
    sql += "\n\nnotify pgrst, 'reload schema';\n";
  }

  const pgResult = await applyWithPg(sql);
  if (pgResult.ok) {
    console.log(
      JSON.stringify(
        { success: true, method: pgResult.method, migration: path.basename(migrationPath) },
        null,
        2
      )
    );
    return;
  }

  const apiResult = await applyWithManagementApi(sql);
  if (apiResult.ok) {
    console.log(
      JSON.stringify(
        {
          success: true,
          method: apiResult.method,
          migration: path.basename(migrationPath),
        },
        null,
        2
      )
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        success: false,
        migration: path.basename(migrationPath),
        migrationPath,
        message:
          "Set DATABASE_URL / SUPABASE_DB_URL, or SUPABASE_ACCESS_TOKEN + SUPABASE_URL, then rerun npm run radio:mature:apply-migration. Or paste the SQL file into Supabase SQL Editor.",
        pg: pgResult,
        managementApi: apiResult,
      },
      null,
      2
    )
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
