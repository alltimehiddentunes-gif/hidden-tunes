import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SPORTS_PUBLIC_CATALOG_STATUSES } from "@/lib/sports/constants";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import { jsonSportsError, jsonSportsOk } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_SELECT =
  "id, title, slug, description, sport_id, competition_id, fixture_id, video_type, artwork_url, duration_seconds, status, verification_status, published_at, quarantined_at, created_at, updated_at";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsOk({
        enabled: false,
        video: null,
        message: "Sports is disabled by feature flag.",
      });
    }

    const { id } = await context.params;
    const videoId = String(id || "").trim();
    if (!videoId) {
      return jsonSportsError("Video id is required.", 400, null, "INVALID_REQUEST");
    }

    const { data, error } = await supabaseAdmin
      .from("sports_videos")
      .select(VIDEO_SELECT)
      .eq("id", videoId)
      .in("status", [...SPORTS_PUBLIC_CATALOG_STATUSES])
      .not("published_at", "is", null)
      .is("unpublished_at", null)
      .is("quarantined_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return jsonSportsError("Video not found.", 404, null, "INVALID_REQUEST");
    }

    return jsonSportsOk({
      enabled: true,
      video: {
        id: data.id,
        title: data.title,
        slug: data.slug,
        description: data.description,
        sportId: data.sport_id,
        competitionId: data.competition_id,
        fixtureId: data.fixture_id,
        videoType: data.video_type,
        artworkUrl: data.artwork_url,
        durationSeconds: data.duration_seconds,
        status: data.status,
        verificationStatus: data.verification_status,
        published: Boolean(data.published_at),
        quarantined: Boolean(data.quarantined_at),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to load video.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
