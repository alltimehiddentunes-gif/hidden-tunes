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
  const limitIndex = process.argv.indexOf("--limit");
  const limit =
    limitIndex >= 0 ? Math.max(1, Number(process.argv[limitIndex + 1] || 20)) : 20;

  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { detectMotivationDuplicates, duplicateClassificationBlocksPromotion } = await import(
    "@/lib/motivationDuplicates"
  );

  const { data, error } = await supabaseAdmin
    .from("motivation_items")
    .select(
      "id, title, source_type, source_id, source_url, source_key, speaker_name, channel_name, duration_seconds"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const summaries = [];
  let blocking = 0;

  for (const row of data || []) {
    const { data: file } = await supabaseAdmin
      .from("motivation_files")
      .select("audio_url, video_url, media_type")
      .eq("item_id", row.id)
      .eq("is_primary", true)
      .maybeSingle();

    const mediaUrl =
      file?.media_type === "audio"
        ? String(file.audio_url || "")
        : String(file?.video_url || "");

    const match = await detectMotivationDuplicates({
      item_id: row.id,
      source_type: row.source_type,
      source_id: row.source_id,
      source_key: row.source_key,
      source_url: row.source_url,
      media_url: mediaUrl,
      title: row.title,
      speaker_name: row.speaker_name,
      channel_name: row.channel_name,
      duration_seconds: row.duration_seconds,
    });

    if (duplicateClassificationBlocksPromotion(match.classification)) blocking += 1;

    summaries.push({
      item_id: row.id,
      title: row.title,
      classification: match.classification,
      blocks_promotion: match.blocks_promotion,
      reason: match.reason,
      signal_count: match.signals.length,
    });
  }

  console.log(
    JSON.stringify(
      {
        dry_run: true,
        scanned: summaries.length,
        blocking,
        summaries,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
