/**
 * Persist accepted Concert candidates as validation_pending (never public yet).
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildConcertDedupeKey, normalizeConcertDedupePart } from "./dedupe";
import type { ConcertClassificationResult } from "./classify";
import type { ConcertYouTubeVideoCandidate } from "../providers/youtubeClient";

export type ConcertPendingInsertInput = {
  sourceId: string;
  candidate: ConcertYouTubeVideoCandidate;
  classification: ConcertClassificationResult;
  countryCode?: string | null;
  languageCode?: string | null;
};

function visibilityFromClassification(
  classification: ConcertClassificationResult
): "validation_pending" {
  return "validation_pending";
}

export async function insertPendingConcertCandidate(
  input: ConcertPendingInsertInput
): Promise<{ inserted: boolean; concertItemId?: string; duplicate?: boolean }> {
  const { candidate, classification, sourceId } = input;
  const sourceItemId = candidate.providerContentId;
  const dedupeKey = buildConcertDedupeKey({
    title: candidate.title,
    primaryArtistName: candidate.channelTitle,
    providerContentId: candidate.providerContentId,
    durationSeconds: candidate.durationSeconds,
    performanceDate: candidate.publishedAt,
  });

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
    visibility_status: visibilityFromClassification(classification),
    rights_status: "pending_review",
    playback_status: "validation_pending",
    health_score: 0,
    country_code: input.countryCode || null,
    language_code: input.languageCode || null,
    dedupe_key: dedupeKey,
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
  const geo =
    candidate.regionRestriction.allowed || candidate.regionRestriction.blocked
      ? {
          allowed: candidate.regionRestriction.allowed || [],
          blocked: candidate.regionRestriction.blocked || [],
        }
      : {};

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
    geo_restrictions: geo,
    playback_status: "validation_pending",
    validation_status: "candidate",
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
