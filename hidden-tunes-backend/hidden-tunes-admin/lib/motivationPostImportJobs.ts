import { classifyMotivationContent } from "@/lib/motivationContentClassifier";
import {
  normalizeMotivationMetadata,
  hashMotivationTitle,
} from "@/lib/motivationMetadataNormalize";
import { probeMotivationItem } from "@/lib/motivationHealth";
import { verifyArchiveItemRights } from "@/lib/motivationItemRights";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type PostImportJobResult = {
  job: string;
  examined: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export async function runMotivationPostImportClassification(limit = 200): Promise<PostImportJobResult> {
  const result: PostImportJobResult = {
    job: "classification",
    examined: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const { data, error } = await supabaseAdmin
    .from("motivation_items")
    .select("id, title, description, tags, speaker_name, creator_name, channel_name, language, category, source_type, content_classification")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    result.examined += 1;
    const normalized = normalizeMotivationMetadata({
      title: String(row.title || ""),
      description: row.description ? String(row.description) : null,
      tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
      speaker: row.speaker_name ? String(row.speaker_name) : null,
      creator: row.creator_name
        ? String(row.creator_name)
        : row.channel_name
          ? String(row.channel_name)
          : null,
      language: row.language ? String(row.language) : null,
    });
    const classification = classifyMotivationContent({
      title: normalized.title,
      description: normalized.description,
      tags: normalized.tags,
      speaker: normalized.speaker,
      creator: normalized.creator,
      language: normalized.language,
      category: String(row.category || ""),
      sourceType: String(row.source_type || ""),
    });

    const { error: updateError } = await supabaseAdmin
      .from("motivation_items")
      .update({
        content_classification: classification.decision,
        content_classification_reason: classification.reason,
        content_classification_confidence: Math.round(classification.confidence * 100),
        normalized_title_hash: hashMotivationTitle(normalized.title),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (updateError) {
      result.errors.push(updateError.message);
      continue;
    }
    result.updated += 1;
  }

  return result;
}

export async function runMotivationPostImportRightsRecheck(limit = 200): Promise<PostImportJobResult> {
  const result: PostImportJobResult = {
    job: "rights_revalidation",
    examined: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const { data, error } = await supabaseAdmin
    .from("motivation_items")
    .select("id, source_id, source_type, rights_status")
    .eq("status", "pending")
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    result.examined += 1;
    if (String(row.source_type) !== "archive_video") {
      result.skipped += 1;
      continue;
    }
    const rights = await verifyArchiveItemRights(String(row.source_id || ""));
    const { error: updateError } = await supabaseAdmin
      .from("motivation_items")
      .update({
        rights_status: rights.ok ? "passed" : "failed",
        rights: rights.rights_label,
        license_url: rights.license_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateError) {
      result.errors.push(updateError.message);
      continue;
    }
    result.updated += 1;
  }

  return result;
}

export async function runMotivationPostImportMediaHealthRecheck(limit = 200): Promise<PostImportJobResult> {
  const result: PostImportJobResult = {
    job: "media_health_recheck",
    examined: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const { data, error } = await supabaseAdmin
    .from("motivation_items")
    .select("id, source_type, source_id, source_url, embed_url, playback_status, media_probe_status")
    .eq("status", "pending")
    .order("probe_timestamp", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    result.examined += 1;
    const probe = await probeMotivationItem({
      source_type: String(row.source_type || ""),
      source_id: String(row.source_id || ""),
      source_url: String(row.source_url || ""),
      embed_url: row.embed_url ? String(row.embed_url) : null,
    });
    const { error: updateError } = await supabaseAdmin
      .from("motivation_items")
      .update({
        playback_status: probe.playback_status,
        media_probe_status: probe.playable ? "passed" : "failed",
        last_health_checked_at: new Date().toISOString(),
        last_health_error: probe.playable ? null : probe.reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateError) {
      result.errors.push(updateError.message);
      continue;
    }
    result.updated += 1;
  }

  return result;
}
