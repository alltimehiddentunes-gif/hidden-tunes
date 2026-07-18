/**
 * Persist accepted Concert candidates as validation_pending (never public yet).
 * Conflict-safe upserts; stores fingerprint, region, lifecycle prep fields.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildConcertDedupeKey,
  buildConcertMetadataHash,
  buildConcertPerformanceFingerprint,
  normalizeConcertDedupePart,
} from "./dedupe";
import {
  inferLifecycleHint,
  lifecycleStatusFromHint,
} from "./lifecycle";
import { buildConcertRegionMeta } from "./region";
import type { ConcertClassificationResult } from "./classify";
import type { ConcertYouTubeVideoCandidate } from "../providers/youtubeClient";

export type ConcertPendingInsertInput = {
  sourceId: string;
  candidate: ConcertYouTubeVideoCandidate;
  classification: ConcertClassificationResult;
  countryCode?: string | null;
  languageCode?: string | null;
  existingFingerprintIndex?: Map<string, string>;
};

export async function insertPendingConcertCandidate(
  input: ConcertPendingInsertInput
): Promise<{
  inserted: boolean;
  concertItemId?: string;
  duplicate?: boolean;
  probableDuplicate?: boolean;
}> {
  const { candidate, classification, sourceId } = input;
  const sourceItemId = candidate.providerContentId;
  const lifecycleHint = inferLifecycleHint({
    liveBroadcastContent: candidate.liveBroadcastContent,
    isLive: classification.isLive,
    isUpcoming: classification.isUpcoming,
    isReplay: classification.isReplay,
  });

  const fingerprint = buildConcertPerformanceFingerprint({
    title: candidate.title,
    primaryArtistName: candidate.channelTitle,
    performanceDate: candidate.publishedAt,
    durationSeconds: candidate.durationSeconds,
    providerChannelId: candidate.channelId,
    lifecycleHint,
  });

  const dedupeKey = buildConcertDedupeKey({
    title: candidate.title,
    primaryArtistName: candidate.channelTitle,
    providerContentId: candidate.providerContentId,
    durationSeconds: candidate.durationSeconds,
    performanceDate: candidate.publishedAt,
  });

  const metadataHash = buildConcertMetadataHash({
    title: candidate.title,
    description: candidate.description,
    duration: candidate.durationSeconds,
    embeddable: candidate.embeddable,
    live: candidate.liveBroadcastContent,
  });

  const region = buildConcertRegionMeta({
    allowed: candidate.regionRestriction.allowed,
    blocked: candidate.regionRestriction.blocked,
    providerReported: Boolean(
      candidate.regionRestriction.allowed || candidate.regionRestriction.blocked
    ),
  });

  if (input.existingFingerprintIndex?.has(fingerprint)) {
    return {
      inserted: false,
      duplicate: true,
      probableDuplicate: true,
      concertItemId: input.existingFingerprintIndex.get(fingerprint),
    };
  }

  const itemPayload = {
    source_id: sourceId,
    source_item_id: sourceItemId,
    title: candidate.title,
    normalized_title: normalizeConcertDedupePart(candidate.title),
    description: candidate.description || null,
    primary_artist_name: candidate.channelTitle || null,
    normalized_primary_artist: normalizeConcertDedupePart(candidate.channelTitle),
    concert_type: classification.concertType,
    artwork_url: candidate.thumbnailUrl,
    official_page_url: candidate.officialWatchUrl,
    duration_seconds: candidate.durationSeconds,
    start_at:
      classification.isUpcoming || classification.isLive
        ? candidate.publishedAt
        : null,
    published_at: null,
    is_live: classification.isLive,
    is_upcoming: classification.isUpcoming,
    is_replay: classification.isReplay,
    is_free: true,
    is_public: false,
    is_mature: false,
    visibility_status: "validation_pending",
    rights_status: "pending_review",
    playback_status: "validation_pending",
    health_score: 0,
    country_code: input.countryCode || null,
    language_code: input.languageCode || null,
    dedupe_key: dedupeKey,
    performance_fingerprint: fingerprint,
    lifecycle_status: lifecycleStatusFromHint(lifecycleHint, false),
    original_scheduled_content_id:
      lifecycleHint === "scheduled" ? candidate.providerContentId : null,
    replay_content_id: lifecycleHint === "replay" ? candidate.providerContentId : null,
    region_availability: region.availability,
    region_allowed_countries: region.allowedCountries,
    region_blocked_countries: region.blockedCountries,
    region_evidence: region.evidence,
    last_region_check_at: region.lastCheckedAt,
    duplicate_status: "unique",
    metadata_hash: metadataHash,
    last_provider_metadata_at: new Date().toISOString(),
    validation_prep_status: "ready_for_validation",
  };

  const { data: item, error: itemError } = await supabaseAdmin
    .from("concert_items")
    .upsert(itemPayload, { onConflict: "source_id,source_item_id" })
    .select("id")
    .single();

  if (itemError) {
    if (/duplicate|unique/i.test(itemError.message)) {
      return { inserted: false, duplicate: true };
    }
    throw new Error(itemError.message);
  }

  const concertItemId = String(item.id);
  input.existingFingerprintIndex?.set(fingerprint, concertItemId);

  const streamRole =
    lifecycleHint === "scheduled"
      ? "scheduled"
      : lifecycleHint === "live"
        ? "live"
        : lifecycleHint === "replay"
          ? "replay"
          : "primary";

  const streamPayload = {
    concert_item_id: concertItemId,
    provider: "youtube",
    provider_content_id: candidate.providerContentId,
    embed_url: candidate.embedUrl,
    official_watch_url: candidate.officialWatchUrl,
    stream_type: "embed",
    mime_type: "text/html",
    embeddable: candidate.embeddable !== false,
    requires_external_app: false,
    geo_restrictions: {
      allowed: region.allowedCountries,
      blocked: region.blockedCountries,
      availability: region.availability,
    },
    playback_status: "validation_pending",
    validation_status: "candidate",
    stream_role: streamRole,
    is_canonical_stream: true,
    last_http_status: null,
    failure_count: 0,
    consecutive_failure_count: 0,
  };

  const { error: streamError } = await supabaseAdmin
    .from("concert_streams")
    .upsert(streamPayload, { onConflict: "provider,provider_content_id" });

  if (streamError) {
    throw new Error(streamError.message);
  }

  return { inserted: true, concertItemId };
}
