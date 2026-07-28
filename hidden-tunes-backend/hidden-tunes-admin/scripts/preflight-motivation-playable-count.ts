import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

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
  const { countPlayableLegalPendingMotivationItems } = await import("../lib/motivationPlayableCount");

  const columnProbe = await supabaseAdmin.from("motivation_items").select("query_family").limit(1);
  const rightsProbe = await supabaseAdmin.from("motivation_items").select("rights_status").limit(1);
  const count = await countPlayableLegalPendingMotivationItems();

  console.log(
    JSON.stringify(
      {
        ok: !columnProbe.error && !rightsProbe.error,
        query_family_column: columnProbe.error?.message || "ok",
        rights_status_column: rightsProbe.error?.message || "ok",
        total_playable_legal_pending: count.total_playable_legal_pending,
        gap_to_target: count.gap_to_target,
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
