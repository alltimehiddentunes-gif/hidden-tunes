/**
 * Probe whether mature radio columns/tables exist (service role only).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const probes = {
    is_mature: await sb.from("radio_stations").select("id,is_mature").eq("is_mature", true).limit(3),
    mature_review_status: await sb
      .from("radio_stations")
      .select("id,is_mature,mature_review_status")
      .eq("is_mature", true)
      .limit(3),
    mature_public_fields: await sb
      .from("radio_stations")
      .select("id,mature_source_approved,rights_status,mature_review_status")
      .eq("is_mature", true)
      .limit(3),
    review_queue: await sb.from("radio_mature_review_queue").select("id").limit(1),
    source_registry: await sb.from("radio_mature_source_registry").select("source_key").limit(1),
    mature_count: await sb
      .from("radio_stations")
      .select("id", { count: "exact", head: true })
      .eq("is_mature", true),
  };

  const report = Object.fromEntries(
    Object.entries(probes).map(([name, result]) => [
      name,
      {
        ok: !result.error,
        error: result.error?.message || null,
        count: result.count ?? result.data?.length ?? null,
        sample: Array.isArray(result.data)
          ? result.data.slice(0, 3).map((row) => row.id || row.source_key || row)
          : null,
      },
    ])
  );

  console.log(JSON.stringify({ success: true, report }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
