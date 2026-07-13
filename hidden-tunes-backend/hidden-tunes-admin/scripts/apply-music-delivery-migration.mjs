import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnv(path.join(root, ".env.local"));
loadEnv(path.join(root, ".env.production"));

const sql = fs.readFileSync(
  path.join(root, "supabase/migrations/20260713190000_music_delivery_rights.sql"),
  "utf8"
);
const databaseUrl = String(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();
const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();

if (databaseUrl) {
  const pg = await import("pg");
  const client = new pg.default.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
  console.log(JSON.stringify({ success: true, method: "pg" }));
} else if (accessToken && supabaseUrl) {
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`Supabase migration failed (${response.status}): ${await response.text()}`);
  console.log(JSON.stringify({ success: true, method: "management_api" }));
} else {
  throw new Error(
    "Could not apply Phase 1 migration: set DATABASE_URL/SUPABASE_DB_URL or SUPABASE_ACCESS_TOKEN with SUPABASE_URL."
  );
}
