import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { createOlympicsAdapter } from "../providers/olympics/adapter";
import { discoverOlympicsVideos } from "../providers/olympics/client";
import { mapOlympicsVideos, type CanonicalOlympicsVideo } from "../providers/olympics/mapper";
import { OLYMPICS_PROVIDER_SLUG, OLYMPICS_YOUTUBE_CHANNEL_ID } from "../providers/olympics/types";
import { sportsCacheInvalidate } from "../cache";

export type SportsImportReport = {
  provider: string;
  dryRun: boolean;
  limit: number;
  discovered: number;
  accepted: number;
  rejected: number;
  inserted: number;
  updated: number;
  skipped: number;
  rightsApproved: number;
  territoryRestricted: number;
  verified: number;
  failed: number;
  quarantined: number;
  errors: string[];
  notes: string[];
  rejectedSamples: Array<{ videoId: string; reason: string }>;
};

function slugify(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function ensureOlympicsProviderRow(): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("sports_providers")
    .select("id")
    .eq("slug", OLYMPICS_PROVIDER_SLUG)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data, error } = await supabaseAdmin
    .from("sports_providers")
    .insert({
      slug: OLYMPICS_PROVIDER_SLUG,
      name: "Olympics (Official YouTube)",
      provider_type: "olympics",
      official_domain: "olympics.com",
      is_enabled: false,
      kill_switch: true,
      health_status: "unknown",
      config: {
        auditDoc: "docs/sports/providers/olympics-audit.md",
        classification: "OFFICIAL_EMBED_ALLOWED",
        youtubeChannelId: OLYMPICS_YOUTUBE_CHANNEL_ID,
        public_ingestion: false,
        playback_enabled: false,
      },
      notes:
        "Phase 2A pilot — official embed only. Defaults disabled. See olympics-audit.md.",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

async function ensureRightsHolder(): Promise<string> {
  const slug = "ioc";
  const { data: existing } = await supabaseAdmin
    .from("sports_rights_holders")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabaseAdmin
    .from("sports_rights_holders")
    .insert({
      name: "International Olympic Committee",
      slug,
      official_url: "https://www.olympics.com/",
      status: "active",
      contact_notes: "Phase 2A — YouTube official embed pathway only.",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function ensureRightsGrant(input: {
  rightsHolderId: string;
  providerId: string;
}): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("sports_rights_grants")
    .select("id")
    .eq("provider_id", input.providerId)
    .eq("content_scope", "video")
    .eq("evidence_status", "approved")
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabaseAdmin
    .from("sports_rights_grants")
    .insert({
      rights_holder_id: input.rightsHolderId,
      provider_id: input.providerId,
      content_scope: "video",
      evidence_status: "approved",
      commercial_use_allowed: false,
      aggregation_allowed: true,
      embedding_allowed: true,
      native_playback_allowed: false,
      external_linking_allowed: true,
      mobile_allowed: true,
      desktop_allowed: true,
      web_allowed: true,
      smart_tv_allowed: true,
      notes:
        "Phase 2A: OFFICIAL_EMBED_ALLOWED via YouTube IFrame for embeddable Olympics videos. No direct HLS.",
      reviewed_at: new Date().toISOString(),
      reviewed_by: "phase2a_audit",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function upsertVideo(
  providerId: string,
  rightsGrantId: string,
  item: CanonicalOlympicsVideo,
  dryRun: boolean
): Promise<"inserted" | "updated" | "skipped"> {
  const slug = slugify(`${OLYMPICS_PROVIDER_SLUG}-${item.providerNativeId}`);

  const { data: existing } = await supabaseAdmin
    .from("sports_videos")
    .select("id, metadata")
    .eq("slug", slug)
    .maybeSingle();

  const status =
    item.rights.playablePublic && item.rights.publishable
      ? "verified"
      : item.rights.publishable
        ? "external_only"
        : "discovered";

  const publishedAt =
    item.rights.publishable && !item.isFixture
      ? item.publishedAt
      : null;

  const row = {
    provider_id: providerId,
    provider_external_id: item.providerNativeId,
    title: item.title,
    slug,
    description: item.description.slice(0, 4000),
    video_type: item.videoType,
    artwork_url: item.artworkUrl,
    rights_grant_id: rightsGrantId,
    status,
    verification_status: item.rights.playablePublic ? "verified" : "pending",
    published_at: publishedAt,
    unpublished_at: null,
    quarantined_at: null,
    metadata: {
      canonicalKey: item.canonicalKey,
      sourcePayloadHash: item.sourcePayloadHash,
      sourceUpdatedAt: item.sourceUpdatedAt,
      rightsBasis: item.rights.rightsBasis,
      rightsClassification: item.rights.classification,
      rightsEvidenceUrl: item.rights.evidenceUrl,
      territoryMode: "PROVIDER_RUNTIME_CHECK",
      playbackMode: item.rights.playbackMode,
      providerSlug: OLYMPICS_PROVIDER_SLUG,
      isPhase2aFixture: item.isFixture,
      displayTitleHint: item.title,
    },
  };

  if (dryRun) {
    return existing?.id ? "updated" : "inserted";
  }

  let videoId = existing?.id as string | undefined;
  if (videoId) {
    const prevHash = (existing?.metadata as { sourcePayloadHash?: string } | null)
      ?.sourcePayloadHash;
    if (prevHash && prevHash === item.sourcePayloadHash) {
      return "skipped";
    }
    const { error } = await supabaseAdmin
      .from("sports_videos")
      .update(row)
      .eq("id", videoId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabaseAdmin
      .from("sports_videos")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    videoId = data.id as string;
  }

  // Source row — never store scraped progressive URLs; embed/deep-link only.
  const { data: sourceExisting } = await supabaseAdmin
    .from("sports_video_sources")
    .select("id")
    .eq("video_id", videoId)
    .eq("source_type", "youtube_official")
    .maybeSingle();

  const sourceRow = {
    video_id: videoId,
    provider_id: providerId,
    source_type: "youtube_official",
    source_url_encrypted: null,
    resolver_reference: `olympics:youtube:${item.providerNativeId}`,
    external_deep_link: item.watchUrl,
    web_fallback_url: item.watchUrl,
    embed_url: item.embedUrl,
    is_direct_play_allowed: false,
    is_embed_allowed: item.rights.playbackMode === "official_embed",
    is_external_only: item.rights.playbackMode !== "official_embed",
    status:
      item.rights.playbackMode === "official_embed" ? "verified" : "external_only",
  };

  if (sourceExisting?.id) {
    const { error } = await supabaseAdmin
      .from("sports_video_sources")
      .update(sourceRow)
      .eq("id", sourceExisting.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin
      .from("sports_video_sources")
      .insert(sourceRow);
    if (error) throw new Error(error.message);
  }

  return existing?.id ? "updated" : "inserted";
}

export async function importOlympicsProvider(input: {
  dryRun?: boolean;
  limit?: number;
  useFixtures?: boolean;
}): Promise<SportsImportReport> {
  const dryRun = input.dryRun !== false; // default true
  const limit = Math.min(100, Math.max(1, input.limit ?? 20));
  const useFixtures =
    input.useFixtures === true ||
    process.env.SPORTS_OLYMPICS_USE_FIXTURES === "1";

  const report: SportsImportReport = {
    provider: OLYMPICS_PROVIDER_SLUG,
    dryRun,
    limit,
    discovered: 0,
    accepted: 0,
    rejected: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    rightsApproved: 0,
    territoryRestricted: 0,
    verified: 0,
    failed: 0,
    quarantined: 0,
    errors: [],
    notes: [
      "Classification: OFFICIAL_EMBED_ALLOWED",
      "No HLS extraction",
      "Provider kill switch remains on unless admin enables",
      dryRun ? "dryRun=true (no writes)" : "dryRun=false",
      useFixtures ? "using fixtures" : "live YouTube discovery",
    ],
    rejectedSamples: [],
  };

  const adapter = createOlympicsAdapter();
  void adapter;

  try {
    const discovered = await discoverOlympicsVideos({
      useFixtures,
      maxResults: limit,
    });

    if (!discovered.supported) {
      report.errors.push(discovered.reason);
      report.failed += 1;
      return report;
    }

    report.discovered = discovered.items.length;
    const { accepted, rejected } = mapOlympicsVideos(discovered.items);
    report.accepted = accepted.length;
    report.rejected = rejected.length;
    report.rejectedSamples = rejected.slice(0, 10);

    for (const item of accepted) {
      if (item.rights.classification === "official_embed_only") {
        report.rightsApproved += 1;
      }
      if (item.rights.playablePublic) report.verified += 1;
      // Territory is runtime — count as restricted awareness, not hard block.
      report.territoryRestricted += 0;
    }

    if (dryRun) {
      report.inserted = accepted.filter((a) => !a.isFixture || useFixtures).length;
      report.notes.push(
        "Dry-run complete — no database writes. Use --dry-run=false to persist."
      );
      return report;
    }

    const providerId = await ensureOlympicsProviderRow();
    const rightsHolderId = await ensureRightsHolder();
    const rightsGrantId = await ensureRightsGrant({
      rightsHolderId,
      providerId,
    });

    for (const item of accepted) {
      try {
        const result = await upsertVideo(
          providerId,
          rightsGrantId,
          item,
          false
        );
        if (result === "inserted") report.inserted += 1;
        else if (result === "updated") report.updated += 1;
        else report.skipped += 1;
      } catch (err) {
        report.failed += 1;
        report.errors.push(
          `${item.providerNativeId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    sportsCacheInvalidate("sports-");
  } catch (err) {
    report.failed += 1;
    report.errors.push(err instanceof Error ? err.message : String(err));
  }

  return report;
}
