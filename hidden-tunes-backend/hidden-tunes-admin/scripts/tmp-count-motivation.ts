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

async function main() {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");

  const exact = await supabaseAdmin
    .from("motivation_items")
    .select("id", { count: "exact", head: true });

  const approved = await supabaseAdmin
    .from("motivation_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("is_verified", true)
    .eq("playback_status", "playable");

  const pending = await supabaseAdmin
    .from("motivation_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  const chapterish = await supabaseAdmin
    .from("motivation_items")
    .select("id", { count: "exact", head: true })
    .like("source_id", "%::%");

  const sample = await supabaseAdmin
    .from("motivation_items")
    .select("id,title,status,source_id,created_at")
    .like("source_id", "%::%")
    .order("created_at", { ascending: false })
    .limit(5);

  console.log(
    JSON.stringify(
      {
        exact_error: exact.error?.message || null,
        exact_count: exact.count,
        approved_count: approved.count,
        pending_count: pending.count,
        chapter_source_count: chapterish.count,
        sample: sample.data,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
