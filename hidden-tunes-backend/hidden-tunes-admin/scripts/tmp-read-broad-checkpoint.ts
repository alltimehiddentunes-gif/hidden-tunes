import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(adminRoot, ".env.local"));

async function main() {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const { data, error } = await supabaseAdmin
    .from("lecture_playable_import_checkpoints")
    .select("id,page,completed,discovered_count,inserted_count,duplicate_count,updated_at,checkpoint_payload")
    .eq("source_key", "internet_archive_public_domain")
    .eq("query_family", "broad educational sweep")
    .maybeSingle();
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
