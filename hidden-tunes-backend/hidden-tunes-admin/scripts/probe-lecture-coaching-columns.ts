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

async function main() {
  loadEnvFile(path.join(adminRoot, ".env.local"));
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const withCoach = await supabaseAdmin.from("lecture_items").select("id,coach_name").limit(1);
  const withProvenance = await supabaseAdmin.from("lecture_items").select("id,provenance").limit(1);
  console.log(
    JSON.stringify(
      {
        coach_name: withCoach.error ? withCoach.error.message : "ok",
        provenance: withProvenance.error ? withProvenance.error.message : "ok",
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
