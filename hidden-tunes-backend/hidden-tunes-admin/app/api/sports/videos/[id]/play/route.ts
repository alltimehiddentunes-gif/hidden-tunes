import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import { jsonSportsError, jsonSportsOk, parseSportsCountry, parseSportsPlatform } from "@/lib/sports/http";
import {
  buildOlympicsEmbedUrl,
  buildOlympicsWatchUrl,
} from "@/lib/sports/providers/olympics/client";
import { evaluateOlympicsTerritoryForBrowse } from "@/lib/sports/providers/olympics/territories";
import { formatOlympicsDisplayTitle } from "@/lib/sports/providers/olympics/mapper";
import { OLYMPICS_PROVIDER_SLUG } from "@/lib/sports/providers/olympics/types";
import { verifyTechnicalSafety } from "@/lib/sports/verification/engine";
import { OLYMPICS_ALLOWED_HOSTS } from "@/lib/sports/providers/olympics/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 2A: resolve Olympics official embed / external watch only.
 * Never returns scraped progressive/HLS media URLs.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const videoId = String(id || "").trim();
    if (!videoId) {
      return jsonSportsError("Video id is required.", 400, null, "INVALID_REQUEST");
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const platform = parseSportsPlatform(request, body.platform);
    const country = parseSportsCountry(request, body.country);

    const [sportsEnabled, embeddedEnabled, externalEnabled] = await Promise.all([
      isSportsFeatureEnabled("sports_enabled"),
      isSportsFeatureEnabled("sports_embedded_playback_enabled"),
      isSportsFeatureEnabled("sports_external_watch_enabled"),
    ]);

    if (!sportsEnabled) {
      return jsonSportsError(
        "Sports is disabled by feature flag.",
        503,
        null,
        "FEATURE_DISABLED"
      );
    }

    const { data: video, error } = await supabaseAdmin
      .from("sports_videos")
      .select(
        "id, title, status, published_at, unpublished_at, quarantined_at, provider_external_id, metadata, provider_id"
      )
      .eq("id", videoId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!video) {
      return jsonSportsError("Video not found.", 404, null, "NO_AUTHORIZED_SOURCE");
    }
    if (!video.published_at || video.unpublished_at) {
      return jsonSportsError(
        "Video is not published.",
        404,
        null,
        "NOT_PUBLISHED"
      );
    }
    if (video.quarantined_at || video.status === "quarantined") {
      return jsonSportsError(
        "Video is quarantined.",
        404,
        null,
        "STREAM_QUARANTINED"
      );
    }

    const meta = (video.metadata || {}) as Record<string, unknown>;
    if (meta.isPhase2aFixture === true) {
      return jsonSportsError(
        "PHASE2A_TEST fixtures are not publicly playable.",
        404,
        null,
        "NO_AUTHORIZED_SOURCE"
      );
    }

    const { data: provider } = video.provider_id
      ? await supabaseAdmin
          .from("sports_providers")
          .select("slug, is_enabled, kill_switch, config, health_status")
          .eq("id", video.provider_id)
          .maybeSingle()
      : { data: null };

    if (provider) {
      if (!provider.is_enabled || provider.kill_switch) {
        return jsonSportsError(
          "Provider is disabled.",
          503,
          null,
          "PROVIDER_UNAVAILABLE"
        );
      }
      const cfg = (provider.config || {}) as Record<string, unknown>;
      if (cfg.playback_enabled === false) {
        return jsonSportsError(
          "Provider playback is not enabled.",
          503,
          null,
          "PROVIDER_UNAVAILABLE"
        );
      }
    }

    const territory = evaluateOlympicsTerritoryForBrowse({ country });
    if (!territory.playableEligible) {
      return jsonSportsError(
        territory.reason,
        403,
        null,
        "GEO_BLOCKED"
      );
    }

    const { data: sources, error: sourceError } = await supabaseAdmin
      .from("sports_video_sources")
      .select(
        "id, source_type, resolver_reference, embed_url, external_deep_link, web_fallback_url, is_embed_allowed, is_external_only, is_direct_play_allowed, status"
      )
      .eq("video_id", videoId)
      .order("created_at", { ascending: true })
      .limit(5);

    if (sourceError) throw new Error(sourceError.message);
    const source = (sources || [])[0];
    if (!source) {
      return jsonSportsError(
        "No authorized source.",
        404,
        null,
        "NO_AUTHORIZED_SOURCE"
      );
    }

    if (source.status === "quarantined") {
      return jsonSportsError(
        "Source is quarantined.",
        404,
        null,
        "STREAM_QUARANTINED"
      );
    }

    // Never allow native/direct for Olympics pilot.
    if (source.is_direct_play_allowed) {
      return jsonSportsError(
        "Direct playback is not authorized for this provider.",
        403,
        null,
        "EXTERNAL_ONLY"
      );
    }

    const nativeId =
      String(video.provider_external_id || "").trim() ||
      String(source.resolver_reference || "")
        .split(":")
        .pop() ||
      "";

    const title = formatOlympicsDisplayTitle(String(video.title || "Olympics"));
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    if (
      source.is_embed_allowed &&
      embeddedEnabled &&
      !source.is_external_only
    ) {
      const embedUrl =
        String(source.embed_url || "").trim() ||
        (nativeId ? buildOlympicsEmbedUrl(nativeId) : "");

      if (!embedUrl) {
        return jsonSportsError(
          "Embed URL missing.",
          404,
          null,
          "NO_AUTHORIZED_SOURCE"
        );
      }

      const safety = verifyTechnicalSafety({
        url: embedUrl,
        allowedDomains: [...OLYMPICS_ALLOWED_HOSTS],
        httpsRequired: true,
      });
      if (!safety.pass) {
        return jsonSportsError(
          "Embed host failed safety checks.",
          404,
          { reasons: safety.reasons },
          "NO_AUTHORIZED_SOURCE"
        );
      }

      return jsonSportsOk({
        playback: {
          mode: "embedded",
          provider: provider?.slug || OLYMPICS_PROVIDER_SLUG,
          embedUrl,
          expiresAt,
        },
        broadcastId: video.id,
        playbackMode: "official_embed",
        title,
        isLive: false,
        platform,
        country,
      });
    }

    if (!externalEnabled) {
      return jsonSportsError(
        "External watch is disabled.",
        503,
        null,
        "FEATURE_DISABLED"
      );
    }

    const fallback =
      String(source.web_fallback_url || source.external_deep_link || "").trim() ||
      (nativeId ? buildOlympicsWatchUrl(nativeId) : "");

    if (!fallback) {
      return jsonSportsError(
        "No external watch URL.",
        404,
        null,
        "NO_AUTHORIZED_SOURCE"
      );
    }

    return jsonSportsOk({
      playback: {
        mode: "external",
        provider: provider?.slug || OLYMPICS_PROVIDER_SLUG,
        deepLink: source.external_deep_link || fallback,
        fallbackUrl: fallback,
        accessType: "free",
      },
      broadcastId: video.id,
      playbackMode: "external_only",
      title,
      isLive: false,
      platform,
      country,
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to resolve Sports video playback.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const url = new URL(request.url);
  const fake = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      platform: url.searchParams.get("platform") || undefined,
      country: url.searchParams.get("country") || undefined,
    }),
  });
  return POST(fake as NextRequest, context);
}
