/**
 * Apply Verified Live Concerts Phase 2 migrations (foundation → user_data → playback).
 *
 * Usage:
 *   node scripts/apply-concerts-migration.mjs --dry-run
 *   node scripts/apply-concerts-migration.mjs
 *
 * Does not run unless DATABASE_URL / SUPABASE_DB_URL or
 * SUPABASE_ACCESS_TOKEN + SUPABASE_URL are configured.
 * Prefer --dry-run for local validation. Do not apply to production from CI casually.
 */
import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");

const MIGRATIONS = [
  "supabase/migrations/20260718190000_concerts_foundation.sql",
  "supabase/migrations/20260718190100_concerts_user_data.sql",
  "supabase/migrations/20260718190200_concerts_playback_validation.sql",
  "supabase/migrations/20260718192000_concerts_source_registry_columns.sql",
  "supabase/migrations/20260718193000_concerts_scale_hardening.sql",
  "supabase/migrations/20260718194000_concerts_multiprovider_expansion.sql",
  "supabase/migrations/20260718194100_concerts_service_role_grants.sql",
];

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

function readMigrations() {
  return MIGRATIONS.map((relativePath) => {
    const absolutePath = path.join(adminRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Missing migration file: ${relativePath}`);
    }
    const sql = fs.readFileSync(absolutePath, "utf8");
    return {
      relativePath,
      basename: path.basename(relativePath),
      absolutePath,
      sql,
      bytes: sql.length,
    };
  });
}

function validateLocally(files) {
  const issues = [];
  const names = files.map((f) => f.basename);
  const sorted = [...names].sort();
  if (JSON.stringify(names) !== JSON.stringify(sorted)) {
    issues.push("Migration filenames are not in chronological order");
  }

  for (const file of files) {
    if (!file.sql.includes("create table if not exists") && !file.sql.includes("alter table")) {
      issues.push(`${file.basename}: expected CREATE TABLE or ALTER TABLE`);
    }
    if (/prisma/i.test(file.sql)) {
      issues.push(`${file.basename}: must not reference Prisma`);
    }
    if (/drop table\s+(if\s+exists\s+)?public\.(tv_|sports_|motivation_|lecture_)/i.test(file.sql)) {
      issues.push(`${file.basename}: must not drop unrelated domain tables`);
    }
    if (/insert into\s+public\.concert_items/i.test(file.sql)) {
      issues.push(`${file.basename}: must not seed concert_items`);
    }
    if (/insert into\s+public\.concert_streams/i.test(file.sql)) {
      issues.push(`${file.basename}: must not seed concert_streams`);
    }
  }

  const foundation = files[0]?.sql || "";
  for (const table of [
    "concert_sources",
    "concert_items",
    "concert_streams",
    "concert_artists",
    "concert_item_artists",
    "concert_categories",
    "concert_item_categories",
    "concert_validation_runs",
  ]) {
    if (!foundation.includes(`public.${table}`)) {
      issues.push(`foundation missing table reference: ${table}`);
    }
  }

  const userData = files[1]?.sql || "";
  for (const table of [
    "saved_concerts",
    "concert_reminders",
    "recently_watched_concerts",
    "followed_concert_artists",
  ]) {
    if (!userData.includes(`public.${table}`)) {
      issues.push(`user_data missing table reference: ${table}`);
    }
  }

  const playback = files[2]?.sql || "";
  if (!playback.includes("concert_playback_sessions")) {
    issues.push("playback_validation missing concert_playback_sessions");
  }

  if (files[3] && !files[3].sql.includes("stable_key")) {
    issues.push("source_registry_columns missing stable_key");
  }

  if (files[4] && !files[4].sql.includes("concert_import_rejections")) {
    issues.push("scale_hardening missing concert_import_rejections");
  }

  if (files[5] && !files[5].sql.includes("concert_discovery_seeds")) {
    issues.push("multiprovider_expansion missing concert_discovery_seeds");
  }

  return issues;
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
  const files = readMigrations();
  const issues = validateLocally(files);

  console.log(
    JSON.stringify(
      {
        phase: "concerts-phase-2",
        dry_run: dryRun,
        migrations: files.map((f) => ({
          file: f.basename,
          bytes: f.bytes,
        })),
        local_validation_issues: issues,
      },
      null,
      2
    )
  );

  if (issues.length > 0) {
    throw new Error(`Local validation failed:\n- ${issues.join("\n- ")}`);
  }

  if (dryRun) {
    console.log(JSON.stringify({ success: true, dry_run: true }, null, 2));
    return;
  }

  for (const file of files) {
    const pgResult = await applyWithPg(file.sql);
    if (pgResult.ok) {
      console.log(
        JSON.stringify(
          { success: true, method: pgResult.method, migration: file.basename },
          null,
          2
        )
      );
      continue;
    }

    const apiResult = await applyWithManagementApi(file.sql);
    if (apiResult.ok) {
      console.log(
        JSON.stringify(
          {
            success: true,
            method: apiResult.method,
            migration: file.basename,
          },
          null,
          2
        )
      );
      continue;
    }

    throw new Error(
      `Could not apply ${file.basename}. Set DATABASE_URL or SUPABASE_ACCESS_TOKEN + SUPABASE_URL.`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
