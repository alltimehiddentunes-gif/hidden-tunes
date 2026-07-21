import type { SupabaseClient } from "@supabase/supabase-js";

import { buildRadioSourceUpdatePayload } from "@/lib/radioCatalogWorker";
import type { NormalizedRadioStation } from "@/lib/radioNormalization";
import {
  findExistingRadioStationId,
  type InsertOnlyOutcome,
  type InsertOnlyResult,
} from "@/lib/radioExpansion25k/insertOnlyImport";

export type MatureInsertOptions = {
  dryRun: boolean;
  matureReviewStatus: "confirmed" | "borderline" | "pending";
  matureReviewReason: string;
  matureEvidenceUrl?: string | null;
  matureEvidenceType?: string | null;
  rightsStatus: "approved" | "pending" | "permission_required" | "partnership_required" | "blocked" | "rejected";
  rightsNotes?: string | null;
  sourceAuthorizationStatus?: string;
  contentRating?: string | null;
};

function buildMatureClassificationPayload(options: MatureInsertOptions) {
  return {
    is_mature: true,
    content_rating: options.contentRating || "adult",
    mature_review_status: options.matureReviewStatus,
    mature_review_reason: options.matureReviewReason,
    mature_evidence_url: options.matureEvidenceUrl || null,
    mature_evidence_type: options.matureEvidenceType || null,
    rights_status: options.rightsStatus,
    rights_notes: options.rightsNotes || null,
    source_authorization_status:
      options.sourceAuthorizationStatus ||
      (options.rightsStatus === "approved" ? "approved" : "pending"),
    mature_source_approved: false,
    is_free: true,
    requires_account: false,
    requires_payment: false,
    requires_drm: false,
  };
}

function buildMatureInsertPayload(
  station: NormalizedRadioStation,
  options: MatureInsertOptions
) {
  return {
    ...buildRadioSourceUpdatePayload(station, null),
    name: station.name,
    status: "approved",
    playback_status: "unchecked",
    is_active: true,
    is_verified: false,
    is_featured: false,
    ...buildMatureClassificationPayload({
      ...options,
      matureEvidenceUrl: options.matureEvidenceUrl || station.homepage_url,
    }),
    reliability_score: 0,
    consecutive_failures: 0,
    health_status: "unchecked",
    imported_at: station.source_last_seen_at,
  };
}

async function upsertSourceMapping(
  supabase: SupabaseClient,
  stationId: string,
  station: NormalizedRadioStation
) {
  const payload = {
    station_id: stationId,
    source_name: station.source_name,
    source_station_id: station.source_station_id,
    source_uuid: station.source_uuid,
    source_server: station.source_server,
    source_payload_hash: station.source_payload_hash,
    source_last_seen_at: station.source_last_seen_at,
  };
  const { error } = await supabase
    .from("radio_station_sources")
    .upsert(payload, { onConflict: "source_name,source_station_id" });
  if (error) throw error;
}

/**
 * Insert a confirmed mature station, or convert an existing general-catalog
 * duplicate in place. Abandoning duplicates left mature stations invisible:
 * general import excludes them, and mature import previously skipped matches.
 */
export async function insertMatureRadioStationOnly(
  supabase: SupabaseClient,
  station: NormalizedRadioStation,
  options: MatureInsertOptions
): Promise<InsertOnlyResult> {
  try {
    const existing = await findExistingRadioStationId(supabase, station);
    if (existing) {
      if (options.dryRun) {
        return {
          outcome: "dry_run_would_insert",
          reason: `convert_existing:${existing.reason}`,
          stationId: existing.id,
        };
      }

      const { data: current, error: currentError } = await supabase
        .from("radio_stations")
        .select("id,is_mature,mature_source_approved,playback_status,is_verified")
        .eq("id", existing.id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current?.id) {
        return { outcome: "duplicate", reason: existing.reason, stationId: existing.id };
      }

      if (current.is_mature === true) {
        await upsertSourceMapping(supabase, existing.id, station);
        return { outcome: "duplicate", reason: `already_mature:${existing.reason}`, stationId: existing.id };
      }

      const { error: updateError } = await supabase
        .from("radio_stations")
        .update({
          ...buildMatureClassificationPayload({
            ...options,
            matureEvidenceUrl: options.matureEvidenceUrl || station.homepage_url,
          }),
          // Keep existing playback/verification; promotion still requires playable+verified.
        })
        .eq("id", existing.id)
        .eq("is_mature", false);
      if (updateError) throw updateError;

      await upsertSourceMapping(supabase, existing.id, station);
      return {
        outcome: "inserted",
        reason: `converted_existing:${existing.reason}`,
        stationId: existing.id,
      };
    }

    if (options.dryRun) {
      return { outcome: "dry_run_would_insert" };
    }

    const { data, error: insertError } = await supabase
      .from("radio_stations")
      .insert(buildMatureInsertPayload(station, options))
      .select("id")
      .single();
    if (insertError) throw insertError;

    await upsertSourceMapping(supabase, String(data.id), station);
    return { outcome: "inserted", stationId: String(data.id) };
  } catch (error) {
    return {
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function queueMatureRadioReviewItem(
  supabase: SupabaseClient,
  input: {
    source_key: string;
    source_name: string;
    station_name: string;
    country_code?: string | null;
    language?: string | null;
    tags?: string[];
    description?: string | null;
    homepage_url?: string | null;
    stream_url?: string | null;
    classification: string;
    classification_reason: string;
    mature_evidence?: string | null;
    rights_evidence?: string | null;
    duplicate_match?: string | null;
    source_station_uuid?: string | null;
    station_fingerprint?: string | null;
    raw_payload?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("radio_mature_review_queue").insert({
    source_key: input.source_key,
    source_name: input.source_name,
    station_name: input.station_name,
    country_code: input.country_code || null,
    language: input.language || null,
    tags: input.tags || [],
    description: input.description || null,
    homepage_url: input.homepage_url || null,
    stream_url_redacted: input.stream_url ? "[protected]" : null,
    classification: input.classification,
    classification_reason: input.classification_reason,
    mature_evidence: input.mature_evidence || null,
    rights_evidence: input.rights_evidence || null,
    duplicate_match: input.duplicate_match || null,
    source_station_uuid: input.source_station_uuid || null,
    station_fingerprint: input.station_fingerprint || null,
    raw_payload: input.raw_payload || null,
    review_status: "pending",
  });
  if (error) {
    // Missing table grants must not abort confirmed-mature inserts on the same page.
    const message = error.message || String(error);
    if (/permission denied|schema cache/i.test(message)) {
      console.warn(
        JSON.stringify({
          scope: "radio_mature_review_queue",
          event: "queue_insert_skipped",
          reason: message,
          station_name: input.station_name,
        })
      );
      return { skipped: true as const, reason: message };
    }
    throw error;
  }
  return { skipped: false as const };
}

export type { InsertOnlyOutcome };
