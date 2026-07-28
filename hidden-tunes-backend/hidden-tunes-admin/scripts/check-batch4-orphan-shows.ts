import fs from "node:fs";
import path from "node:path";

const adminRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

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

const ORPHAN_SHOW_IDS = [
  "c85016e5-d4a7-477b-8068-345abdab9b0e",
  "071355c5-7afa-49aa-8225-fbb64ca82294",
  "0f56a5bf-492d-45c0-bc81-55e0a99cc667",
  "ee3b54c4-5ae3-4259-b3de-38036f2e3388",
  "aa50ae80-1ab2-495f-b079-d46a5aa7343d",
];

async function main() {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const results = [];

  for (const id of ORPHAN_SHOW_IDS) {
    const { data, error } = await supabaseAdmin
      .from("podcast_shows")
      .select("id, title, status, is_active")
      .eq("id", id)
      .maybeSingle();

    results.push({
      id,
      still_exists: Boolean(data?.id),
      title: data?.title ?? null,
      status: data?.status ?? null,
      is_active: data?.is_active ?? null,
      error: error?.message ?? null,
    });
  }

  console.log(
    JSON.stringify(
      {
        checked_at: new Date().toISOString(),
        still_exist_count: results.filter((row) => row.still_exists).length,
        results,
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
