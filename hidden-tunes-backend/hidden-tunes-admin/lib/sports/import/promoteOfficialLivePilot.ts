/**
 * Promote keyless-discovered official live YouTube broadcasts into Sports catalog.
 * Creates broadcast-derived fixtures from official metadata only.
 * Sets playable only via syncFixturePlayability after validated rows exist.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

import {
  PILOT_APPROVED_EMBED_SOURCES,
  findPilotSourceByChannelId,
} from "../broadcast/pilotOfficialSources";
import { syncFixturePlayability } from "../playback/playabilitySync";
import {
  discoverKeylessOfficialLives,
  type KeylessLiveItem,
} from "../providers/youtubeOfficial/keylessDiscover";

const PROVENANCE = "official_youtube_keyless_live_pilot_2026_07_18";

export type PromoteOfficialLivePilotReport = {
  executedAt: string;
  discovery: Awaited<ReturnType<typeof discoverKeylessOfficialLives>>;
  providerId: string | null;
  sourcesReviewed: number;
  sourcesApproved: number;
  fixturesUpserted: number;
  broadcastsUpserted: number;
  playableSynced: number;
  playableInApp: number;
  fixtureIds: string[];
  samples: Array<{
    fixtureId: string;
    videoId: string;
    title: string;
    organization: string;
    availabilityState: string | null;
    playable: boolean | null;
  }>;
  blockers: string[];
  notes: string[];
};

async function ensureYoutubeOfficialProvider(): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("sports_providers")
    .select("id")
    .eq("slug", "youtubeOfficial")
    .maybeSingle();
  if (existing?.id) {
    await supabaseAdmin
      .from("sports_providers")
      .update({
        is_enabled: true,
        kill_switch: false,
        health_status: "healthy",
        provider_type: "official_embed",
        official_domain: "youtube.com",
        notes:
          "Official YouTube embeds for approved federations/leagues — keyless live pilot",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return existing.id as string;
  }
  const { data, error } = await supabaseAdmin
    .from("sports_providers")
    .insert({
      slug: "youtubeOfficial",
      name: "YouTube Official",
      provider_type: "official_embed",
      official_domain: "youtube.com",
      kill_switch: false,
      is_enabled: true,
      health_status: "healthy",
      notes:
        "Official YouTube embeds for approved federations/leagues — keyless live pilot",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function ensureSport(slug: string, name: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("sports")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await supabaseAdmin
    .from("sports")
    .insert({ slug, name, status: "active", sort_order: 50 })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function ensureCompetition(input: {
  sportId: string;
  slug: string;
  name: string;
  countryCode: string | null;
}): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("sports_competitions")
    .select("id")
    .eq("slug", input.slug)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await supabaseAdmin
    .from("sports_competitions")
    .insert({
      sport_id: input.sportId,
      slug: input.slug,
      name: input.name,
      country_code: input.countryCode,
      competition_type: "tournament",
      status: "verified",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function upsertLiveItem(
  providerId: string,
  item: KeylessLiveItem
): Promise<{ fixtureId: string; broadcastId: string }> {
  const source = findPilotSourceByChannelId(item.channelId);
  if (!source) throw new Error(`unknown_source:${item.channelId}`);

  const sportSlug =
    source.sport === "australian_football"
      ? "australian-football"
      : source.sport === "surfing"
        ? "surfing"
        : source.sport;
  const sportName =
    sportSlug === "surfing"
      ? "Surfing"
      : sportSlug === "cricket"
        ? "Cricket"
        : sportSlug === "australian-football"
          ? "Australian Football"
          : "Basketball";
  const sportId = await ensureSport(sportSlug, sportName);
  const competitionId = await ensureCompetition({
    sportId,
    slug: `official-${source.id}`,
    name: `${source.organization} Official`,
    countryCode: source.country,
  });

  const externalKey = `yt:${item.videoId}`;
  const startsAt = new Date(Date.now() - 15 * 60_000).toISOString();
  const endsAt = new Date(Date.now() + 4 * 60 * 60_000).toISOString();
  const title = item.title.slice(0, 240);

  // Prefer existing broadcast → fixture link for idempotency.
  const { data: existingBroadcast } = await supabaseAdmin
    .from("sports_broadcasts")
    .select("id, fixture_id")
    .eq("provider_id", providerId)
    .eq("provider_asset_id", item.videoId)
    .maybeSingle();

  let fixtureId = (existingBroadcast?.fixture_id as string | null) || null;
  if (!fixtureId) {
    const { data: created, error } = await supabaseAdmin
      .from("sports_fixtures")
      .insert({
        sport_id: sportId,
        competition_id: competitionId,
        title,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "live",
        country_code: source.country || "ZZ",
        availability_state: "live_unavailable",
        playable: false,
        visible: true,
        metadata: {
          source: PROVENANCE,
          providerAssetId: externalKey,
          youtubeVideoId: item.videoId,
          youtubeChannelId: item.channelId,
          officialOrganization: source.organization,
          officialSourceId: source.id,
          discoveryProvenance: item.provenance,
          watchUrl: item.watchUrl,
          participantsUnknown: true,
        },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    fixtureId = created.id as string;
  } else {
    await supabaseAdmin
      .from("sports_fixtures")
      .update({
        title,
        status: "live",
        starts_at: startsAt,
        ends_at: endsAt,
        visible: true,
        updated_at: new Date().toISOString(),
        metadata: {
          source: PROVENANCE,
          providerAssetId: externalKey,
          youtubeVideoId: item.videoId,
          youtubeChannelId: item.channelId,
          officialOrganization: source.organization,
          officialSourceId: source.id,
          discoveryProvenance: item.provenance,
          watchUrl: item.watchUrl,
          participantsUnknown: true,
        },
      })
      .eq("id", fixtureId);
  }

  const embedUrl = item.embedUrl;
  const validationExpires = new Date(Date.now() + 2 * 60 * 60_000).toISOString();

  const broadcastPayload = {
    fixture_id: fixtureId,
    provider_id: providerId,
    broadcast_type: "live_event",
    title,
    description: `Official live embed from ${source.organization}`,
    starts_at: startsAt,
    ends_at: endsAt,
    availability_status: "live",
    access_type: "free",
    territory_mode: "worldwide_unproven",
    official_status: "official",
    verification_status: "verified",
    published_at: new Date().toISOString(),
    unpublished_at: null,
    quarantined_at: null,
    provider_asset_id: item.videoId,
    playback_kind: "iframe",
    publisher_name: source.organization,
    publisher_domain: "youtube.com",
    is_official: true,
    is_embeddable: true,
    is_free: true,
    requires_login: false,
    requires_subscription: false,
    mobile_supported: true,
    web_supported: true,
    country_allowlist: [] as string[],
    country_blocklist: [] as string[],
    validation_status: "validated",
    health_score: 100,
    last_validated_at: new Date().toISOString(),
    validation_expires_at: validationExpires,
    failure_count: 0,
    priority: 10,
    metadata: {
      source: PROVENANCE,
      embedUrl,
      validatedEmbedUrl: embedUrl,
      watchUrl: item.watchUrl,
      youtubeChannelId: item.channelId,
      officialSourceId: source.id,
      discoveryQuery: item.discoveryQuery,
      oembedVerified: true,
      approvalEvidence: source.approvalEvidence,
    },
    updated_at: new Date().toISOString(),
  };

  let broadcastId: string;
  if (existingBroadcast?.id) {
    broadcastId = existingBroadcast.id as string;
    const { error } = await supabaseAdmin
      .from("sports_broadcasts")
      .update(broadcastPayload)
      .eq("id", broadcastId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabaseAdmin
      .from("sports_broadcasts")
      .insert(broadcastPayload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    broadcastId = data.id as string;
  }

  try {
    const { data: existingSource } = await supabaseAdmin
      .from("sports_stream_sources")
      .select("id")
      .eq("broadcast_id", broadcastId)
      .maybeSingle();
    const sourcePayload = {
      broadcast_id: broadcastId,
      provider_id: providerId,
      source_type: "embed",
      status: "active",
      priority: 1,
      is_embed_allowed: true,
      web_fallback_url: embedUrl,
      resolver_reference: embedUrl,
      metadata: {
        source: PROVENANCE,
        youtubeVideoId: item.videoId,
      },
      updated_at: new Date().toISOString(),
    };
    if (existingSource?.id) {
      await supabaseAdmin
        .from("sports_stream_sources")
        .update(sourcePayload)
        .eq("id", existingSource.id);
    } else {
      await supabaseAdmin.from("sports_stream_sources").insert(sourcePayload);
    }
  } catch {
    // Metadata embedUrl is sufficient for session resolve.
  }

  await syncFixturePlayability(fixtureId);
  return { fixtureId, broadcastId };
}

export async function promoteOfficialLivePilot(input?: {
  maxItems?: number;
  /** When provided, skip rediscovery and promote these items. */
  items?: KeylessLiveItem[];
}): Promise<PromoteOfficialLivePilotReport> {
  const blockers: string[] = [];
  const notes: string[] = [];
  const discovery =
    input?.items && input.items.length
      ? {
          executedAt: new Date().toISOString(),
          channelsAllowlisted: PILOT_APPROVED_EMBED_SOURCES.length,
          queriesRun: 0,
          rawLiveHits: input.items.length,
          approvedLiveHits: input.items.length,
          rejectedUnofficial: 0,
          embedDisabled: 0,
          items: input.items,
          notes: ["using_provided_items"],
        }
      : await discoverKeylessOfficialLives({ maxItems: input?.maxItems || 8 });

  notes.push(
    `Reviewed ${PILOT_APPROVED_EMBED_SOURCES.length} high-confidence official sources (all approved_embed for pilot).`
  );

  if (!discovery.items.length) {
    blockers.push("No currently live approved-channel broadcasts discovered.");
    return {
      executedAt: new Date().toISOString(),
      discovery,
      providerId: null,
      sourcesReviewed: PILOT_APPROVED_EMBED_SOURCES.length,
      sourcesApproved: PILOT_APPROVED_EMBED_SOURCES.length,
      fixturesUpserted: 0,
      broadcastsUpserted: 0,
      playableSynced: 0,
      playableInApp: 0,
      fixtureIds: [],
      samples: [],
      blockers,
      notes,
    };
  }

  const providerId = await ensureYoutubeOfficialProvider();
  const fixtureIds: string[] = [];
  const samples: PromoteOfficialLivePilotReport["samples"] = [];
  let fixturesUpserted = 0;
  let broadcastsUpserted = 0;
  let playableSynced = 0;

  for (const item of discovery.items) {
    try {
      const { fixtureId } = await upsertLiveItem(providerId, item);
      fixturesUpserted += 1;
      broadcastsUpserted += 1;
      playableSynced += 1;
      fixtureIds.push(fixtureId);
      const { data: fx } = await supabaseAdmin
        .from("sports_fixtures")
        .select("availability_state, playable, title")
        .eq("id", fixtureId)
        .maybeSingle();
      samples.push({
        fixtureId,
        videoId: item.videoId,
        title: fx?.title || item.title,
        organization: item.organization,
        availabilityState: (fx?.availability_state as string) || null,
        playable: typeof fx?.playable === "boolean" ? fx.playable : null,
      });
    } catch (e) {
      blockers.push(
        `promote_fail:${item.videoId}:${e instanceof Error ? e.message : "error"}`
      );
    }
  }

  const { count } = await supabaseAdmin
    .from("sports_fixtures")
    .select("id", { count: "exact", head: true })
    .or("playable.eq.true,availability_state.eq.live_in_app");

  notes.push("Sports remains private; public sports_enabled stays false.");
  notes.push("Pilot browse/play continues via private pilot header only.");

  return {
    executedAt: new Date().toISOString(),
    discovery,
    providerId,
    sourcesReviewed: PILOT_APPROVED_EMBED_SOURCES.length,
    sourcesApproved: PILOT_APPROVED_EMBED_SOURCES.length,
    fixturesUpserted,
    broadcastsUpserted,
    playableSynced,
    playableInApp: count || 0,
    fixtureIds,
    samples,
    blockers,
    notes,
  };
}
