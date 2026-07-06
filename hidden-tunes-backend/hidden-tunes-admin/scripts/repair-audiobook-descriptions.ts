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

function parseArgs(argv: string[]) {
  const options = {
    dryRun: false,
    batchSize: 500,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--batch-size" && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.batchSize = Math.min(1000, Math.floor(parsed));
      }
      index += 1;
    }
  }

  return options;
}

loadEnvFile(path.join(adminRoot, ".env.production"));
loadEnvFile(path.join(adminRoot, ".env.local"));
loadEnvFile(path.join(adminRoot, ".env"));

async function updateThenInsertExternalLink(
  supabaseAdmin: Awaited<typeof import("../lib/supabaseAdmin")>["supabaseAdmin"],
  payload: {
    audiobook_id: string;
    label: string;
    url: string;
    source_type: string;
    source_key: string;
  }
) {
  const { data: existing, error: selectError } = await supabaseAdmin
    .from("audiobook_external_links")
    .select("id")
    .eq("source_key", payload.source_key)
    .limit(1);

  if (selectError) throw selectError;

  if (existing && existing.length > 0) {
    const { error: updateError } = await supabaseAdmin
      .from("audiobook_external_links")
      .update(payload)
      .eq("source_key", payload.source_key);

    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from("audiobook_external_links")
    .insert(payload);

  if (insertError) throw insertError;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const { sanitizeAudiobookDescription } = await import(
    "../lib/audiobookDescriptionSanitizer"
  );

  const report = {
    dry_run: options.dryRun,
    batch_size: options.batchSize,
    audiobook_rows_scanned: 0,
    audiobook_rows_updated: 0,
    chapter_rows_scanned: 0,
    chapter_rows_updated: 0,
    external_links_upserted: 0,
    errors: [] as string[],
  };

  for (let from = 0; ; from += options.batchSize) {
    const to = from + options.batchSize - 1;
    const { data, error } = await supabaseAdmin
      .from("audiobooks")
      .select("id, description")
      .range(from, to);

    if (error) throw error;
    const rows = (data || []) as Array<{ id: string; description: string | null }>;
    if (rows.length === 0) break;

    for (const row of rows) {
      report.audiobook_rows_scanned += 1;
      const cleaned = sanitizeAudiobookDescription(row.description);
      if (cleaned.text !== row.description) {
        report.audiobook_rows_updated += 1;
        if (!options.dryRun) {
          const { error: updateError } = await supabaseAdmin
            .from("audiobooks")
            .update({ description: cleaned.text })
            .eq("id", row.id);
          if (updateError) report.errors.push(updateError.message);
        }
      }

      if (cleaned.links.length > 0 && !options.dryRun) {
        try {
          for (const link of cleaned.links) {
            await updateThenInsertExternalLink(supabaseAdmin, {
              audiobook_id: row.id,
              label: link.label,
              url: link.url,
              source_type: "description",
              source_key: `description:${row.id}:${link.url}`,
            });
          }
          report.external_links_upserted += cleaned.links.length;
        } catch (error) {
          report.errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }

    if (rows.length < options.batchSize) break;
  }

  for (let from = 0; ; from += options.batchSize) {
    const to = from + options.batchSize - 1;
    const { data, error } = await supabaseAdmin
      .from("audiobook_chapters")
      .select("id, description")
      .range(from, to);

    if (error) throw error;
    const rows = (data || []) as Array<{ id: string; description: string | null }>;
    if (rows.length === 0) break;

    for (const row of rows) {
      report.chapter_rows_scanned += 1;
      const cleaned = sanitizeAudiobookDescription(row.description).text || "";
      if (cleaned !== (row.description || "")) {
        report.chapter_rows_updated += 1;
        if (!options.dryRun) {
          const { error: updateError } = await supabaseAdmin
            .from("audiobook_chapters")
            .update({ description: cleaned })
            .eq("id", row.id);
          if (updateError) report.errors.push(updateError.message);
        }
      }
    }

    if (rows.length < options.batchSize) break;
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
