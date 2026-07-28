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
  const resumePage = Number(process.argv[2] || 50);
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const { data, error } = await supabaseAdmin
    .from("lecture_playable_import_checkpoints")
    .select("id,page,completed,discovered_count,inserted_count")
    .eq("source_key", "internet_archive_public_domain")
    .eq("query_family", "broad educational sweep")
    .maybeSingle();
  if (error) throw error;
  console.log("before", data);
  const upd = await supabaseAdmin
    .from("lecture_playable_import_checkpoints")
    .update({
      page: resumePage,
      cursor: String(resumePage),
      completed: false,
      updated_at: new Date().toISOString(),
      checkpoint_payload: {
        repaired_at: new Date().toISOString(),
        previous_page: data?.page,
        previous_completed: data?.completed,
        reason: "repair_page_jump",
      },
    })
    .eq("id", data!.id);
  if (upd.error) throw upd.error;
  console.log("repaired_to_page", resumePage);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
