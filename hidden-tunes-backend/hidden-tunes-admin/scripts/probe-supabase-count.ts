import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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
loadEnvFile(path.join(adminRoot, ".env"));

async function main() {
  const client = getSupabaseAdmin();
  const started = Date.now();
  const { count, error } = await client
    .from("podcast_shows")
    .select("id", { count: "exact", head: true })
    .eq("is_mature", true)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("feed_status", "active");

  console.log(
    JSON.stringify(
      {
        ms: Date.now() - started,
        count,
        error,
        errorKeys: error ? Object.keys(error) : [],
        errorJson: error ? JSON.stringify(error) : null,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
