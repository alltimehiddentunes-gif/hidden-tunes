/**
 * Apply Artist Profile infrastructure migration.
 * Prefers DATABASE_URL / SUPABASE_DB_URL; falls back to SUPABASE_ACCESS_TOKEN Management API.
 *
 * Usage:
 *   node scripts/apply-artist-profile-migration.mjs
 *   node scripts/apply-artist-profile-migration.mjs --dry-run
 *   node scripts/apply-artist-profile-migration.mjs --verify-only
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const migrationPath = path.join(
  adminRoot,
  "supabase/migrations/20260713150000_artist_profile_infrastructure.sql"
);
const verificationSqlPath = path.join(
  adminRoot,
  "deployment/manual/artist-profile/02_artist_verification.sql"
);
const backfillSqlPath = path.join(
  adminRoot,
  "deployment/manual/artist-profile/03_artist_statistics_backfill.sql"
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
    body = { raw: text.slice(0, 400) };
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

async function verifySchema() {
  const supabaseUrl = String(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  ).trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, skipped: true, reason: "missing supabase credentials" };
  }

  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const checks = [];
  const artistCols =
    "id,name,slug,image_url,bio,status,is_verified,is_featured,is_suspended,merged_into_artist_id,updated_at";
  const artistProbe = await sb.from("artists").select(artistCols).limit(1);
  checks.push({
    name: "artists_extended_columns",
    ok: !artistProbe.error,
    error: artistProbe.error?.message || null,
  });

  for (const table of [
    "artist_statistics",
    "artist_followers",
    "artist_similar_scores",
    "artist_song_rankings",
    "artist_genres",
  ]) {
    const probe = await sb.from(table).select("*").limit(1);
    checks.push({
      name: `table_${table}`,
      ok: !probe.error,
      error: probe.error?.message || null,
    });
  }

  return {
    ok: checks.every((item) => item.ok),
    checks,
  };
}

async function applySqlFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, skipped: true, label, reason: "file missing" };
  }
  let sql = fs.readFileSync(filePath, "utf8");
  if (!/notify\s+pgrst/i.test(sql)) {
    sql += "\n\nnotify pgrst, 'reload schema';\n";
  }

  const pgResult = await applyWithPg(sql);
  if (pgResult.ok) return { ...pgResult, label, file: path.basename(filePath) };

  const apiResult = await applyWithManagementApi(sql);
  if (apiResult.ok) return { ...apiResult, label, file: path.basename(filePath) };

  return {
    ok: false,
    label,
    file: path.basename(filePath),
    pg: pgResult,
    managementApi: apiResult,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const verifyOnly = process.argv.includes("--verify-only");
  const withBackfill = process.argv.includes("--with-backfill");
  const withVerificationSql = process.argv.includes("--with-verification-sql");

  if (dryRun) {
    const sql = fs.readFileSync(migrationPath, "utf8");
    console.log(
      JSON.stringify(
        {
          ok: true,
          dry_run: true,
          migration: path.basename(migrationPath),
          bytes: sql.length,
        },
        null,
        2
      )
    );
    return;
  }

  if (verifyOnly) {
    const verification = await verifySchema();
    console.log(JSON.stringify({ success: verification.ok, verification }, null, 2));
    if (!verification.ok) process.exit(2);
    return;
  }

  const applied = [];
  const primary = await applySqlFile(migrationPath, "infrastructure");
  applied.push(primary);
  if (!primary.ok) {
    console.log(
      JSON.stringify(
        {
          success: false,
          message:
            "Set DATABASE_URL / SUPABASE_DB_URL, or SUPABASE_ACCESS_TOKEN + SUPABASE_URL, then rerun. Or paste deployment/manual/artist-profile/01_artist_profile_infrastructure.sql into the Supabase SQL Editor.",
          applied,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  if (withVerificationSql) {
    applied.push(await applySqlFile(verificationSqlPath, "verification"));
  }
  if (withBackfill) {
    applied.push(await applySqlFile(backfillSqlPath, "statistics_backfill"));
  }

  // Allow PostgREST cache a moment, then verify via REST.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const verification = await verifySchema();

  console.log(
    JSON.stringify(
      {
        success: verification.ok,
        applied,
        verification,
      },
      null,
      2
    )
  );
  if (!verification.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
