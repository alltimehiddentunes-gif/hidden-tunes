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

function readOption(name: string, fallback: string) {
  const equalsPrefix = `${name}=`;
  const equalsArg = process.argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsArg) return equalsArg.slice(equalsPrefix.length) || fallback;
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

async function main() {
  const limit = Math.max(1, Number.parseInt(readOption("--limit", "50"), 10));
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const { classifyMotivationContent } = await import("../lib/motivationContentClassifier");

  const { data: items, error } = await supabaseAdmin
    .from("motivation_items")
    .select(
      "id, title, description, speaker_name, creator_name, channel_name, source_type, source_id, source_key, source_url, rights, media_type, content_classification, content_classification_reason, content_classification_confidence, status, playback_status, media_probe_status, rights_status, last_health_error, created_at, updated_at"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = (items || []) as Array<Record<string, unknown>>;
  const itemIds = rows.map((row) => String(row.id));

  const { data: files } = await supabaseAdmin
    .from("motivation_files")
    .select("item_id, audio_url, video_url, mime_type, media_type, playback_status, is_primary")
    .in("item_id", itemIds.length > 0 ? itemIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("is_primary", true);

  const fileByItem = new Map<string, Record<string, unknown>>();
  for (const file of (files || []) as Array<Record<string, unknown>>) {
    fileByItem.set(String(file.item_id), file);
  }

  const audited = rows.map((row) => {
    const file = fileByItem.get(String(row.id));
    const mediaUrl = String(file?.video_url || file?.audio_url || "").trim() || null;
    const wouldClassify = classifyMotivationContent({
      title: String(row.title || ""),
      description: row.description ? String(row.description) : null,
      speaker: row.speaker_name ? String(row.speaker_name) : null,
      creator: row.creator_name ? String(row.creator_name) : row.channel_name ? String(row.channel_name) : null,
      language: null,
      category: "Motivation",
      sourceType: String(row.source_type || ""),
      tags: [],
    });

    let reviewGroup = "Requires manual review";
    const decision = String(row.content_classification || "hold");
    const classifyDecision = wouldClassify.decision;

    if (decision === "reject" || classifyDecision === "reject") reviewGroup = "Clearly unsuitable";
    else if (classifyDecision.startsWith("route_")) reviewGroup = "Clearly unsuitable";
    else if (decision === "accept" || classifyDecision === "accept") reviewGroup = "Safe to accept";
    else if (String(row.media_probe_status) === "failed" || String(row.playback_status) === "failed") {
      reviewGroup = "Broken media";
    } else if (
      String(row.content_classification_reason || "").includes("Awaiting post-import")
    ) {
      reviewGroup = "Requires metadata normalization";
    } else if (decision === "hold") reviewGroup = "Requires manual review";

    return {
      item_id: row.id,
      title: row.title,
      creator: row.creator_name || row.channel_name || row.speaker_name,
      source: row.source_key || `${row.source_type}:${row.source_id}`,
      source_item_id: row.source_id,
      canonical_url: row.source_url,
      media_url: mediaUrl,
      media_type: row.media_type || file?.media_type,
      license: row.rights,
      license_evidence: row.rights,
      content_classification: row.content_classification,
      classification_reason: row.content_classification_reason,
      classification_confidence: row.content_classification_confidence,
      classification_timestamp: row.updated_at,
      classifier_preview: {
        decision: classifyDecision,
        reason: wouldClassify.reason,
        confidence: wouldClassify.confidence,
      },
      promotion_status: row.status,
      media_probe_status: row.media_probe_status,
      rights_status: row.rights_status,
      playback_status: row.playback_status,
      last_health_error: row.last_health_error,
      review_group: reviewGroup,
    };
  });

  const groups = audited.reduce<Record<string, number>>((acc, row) => {
    acc[row.review_group] = (acc[row.review_group] || 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        success: true,
        pending_count: audited.length,
        groups,
        items: audited,
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
