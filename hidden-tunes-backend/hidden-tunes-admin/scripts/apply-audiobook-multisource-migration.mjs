/**
 * Apply audiobook multi-source + mature expansion migration.
 * Prefers DATABASE_URL / SUPABASE_DB_URL; falls back to SUPABASE_ACCESS_TOKEN Management API.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const migrationPaths = [
  "supabase/migrations/20260715140000_audiobook_150k_expansion.sql",
  "supabase/migrations/20260722120000_audiobook_multisource_mature_expansion.sql",
].map((migration) => path.join(adminRoot, migration));

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

async function main() {
  const sql = migrationPaths
    .map((migrationPath) => fs.readFileSync(migrationPath, "utf8").trim())
    .join("\n\n");

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

  const generated = path.join(
    adminRoot,
    "supabase/generated/audiobook-multisource-mature-migrations.sql"
  );
  fs.mkdirSync(path.dirname(generated), { recursive: true });
  fs.writeFileSync(generated, `${sql.trim()}\n`);

  console.log(
    JSON.stringify(
      {
        ok: false,
        applied: false,
        pgResult,
        apiResult,
        generated_sql: path.relative(adminRoot, generated).replace(/\\/g, "/"),
        hint: "Set DATABASE_URL / SUPABASE_DB_URL or SUPABASE_ACCESS_TOKEN + SUPABASE_URL, then rerun. Or paste the generated SQL into Supabase SQL Editor. Importers already work against the live schema with FS source registry fallback.",
      },
      null,
      2
    )
  );
  process.exitCode = 2;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
