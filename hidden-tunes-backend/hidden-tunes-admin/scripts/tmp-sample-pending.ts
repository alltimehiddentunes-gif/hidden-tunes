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
  const { data, error } = await supabaseAdmin
    .from("motivation_items")
    .select("id,title,tags,content_classification,content_classification_reason,status,category")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);
  console.log(JSON.stringify({ error, count: data?.length || 0, data }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
