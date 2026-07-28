/**
 * Remove safe orphan pending shows: zero episodes, pending, unverified, non-public.
 */
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
loadEnvFile(path.join(adminRoot, ".env"));

async function main() {
  const execute = process.argv.includes("--execute");
  const batchWindow = process.argv.includes("--batch-window");
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");

  let query = supabaseAdmin
    .from("podcast_shows")
    .select("id, title, feed_url, created_at, status, is_verified, is_active, is_mature")
    .eq("status", "pending")
    .eq("is_verified", false);

  if (batchWindow) {
    const resultFiles = fs
      .readdirSync(path.join(adminRoot, "data"))
      .filter((name) => /^podcast-expansion-batch\d+-result\.json$/.test(name))
      .map((name) => path.join(adminRoot, "data", name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    const latest = resultFiles[0];
    if (latest) {
      const batch = JSON.parse(fs.readFileSync(latest, "utf8")) as {
        started_at?: string;
        finished_at?: string;
      };
      if (batch.started_at && batch.finished_at) {
        query = query.gte("created_at", batch.started_at).lte("created_at", batch.finished_at);
      }
    }
  }

  const { data: pendingShows, error } = await query;
  if (error) throw new Error(error.message);

  const orphans: Array<{
    id: string;
    title: string;
    feed_url: string | null;
    created_at: string;
  }> = [];

  for (const show of pendingShows || []) {
    const { count } = await supabaseAdmin
      .from("podcast_episodes")
      .select("id", { count: "exact", head: true })
      .eq("show_id", show.id);
    if ((count || 0) === 0) {
      orphans.push({
        id: show.id,
        title: show.title,
        feed_url: show.feed_url,
        created_at: show.created_at,
      });
    }
  }

  const report = {
    execute,
    batch_window: batchWindow,
    orphans_found: orphans.length,
    orphans,
    removed: [] as string[],
  };

  if (execute && orphans.length > 0) {
    for (const orphan of orphans) {
      const { count } = await supabaseAdmin
        .from("podcast_episodes")
        .select("id", { count: "exact", head: true })
        .eq("show_id", orphan.id);
      if ((count || 0) > 0) continue;
      const { error: deleteError } = await supabaseAdmin
        .from("podcast_shows")
        .delete()
        .eq("id", orphan.id);
      if (deleteError) throw new Error(`${orphan.title}: ${deleteError.message}`);
      report.removed.push(orphan.id);
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (!execute && orphans.length > 0) {
    console.error("Dry run. Re-run with --execute to remove safe orphans.");
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
