import { NextResponse } from "next/server";

import {
  PODCAST_EPISODE_PLAY_SELECT,
  isPlayablePodcastAudioUrl,
} from "@/lib/podcastCatalog";
import { jsonPodcastError } from "@/lib/podcastPublicApi";
import { cleanText } from "@/lib/tvCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const episodeId = String(id || "").trim();

  if (!episodeId || !UUID_RE.test(episodeId)) {
    return jsonPodcastError("Invalid podcast episode id.", 400);
  }

  const { data, error } = await supabaseAdmin
    .from("podcast_episodes")
    .select(PODCAST_EPISODE_PLAY_SELECT)
    .eq("id", episodeId)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .maybeSingle();

  if (error) {
    return jsonPodcastError(
      "Failed to resolve podcast playback.",
      500,
      error.message
    );
  }

  if (!data) {
    return jsonPodcastError("Podcast episode not found or not playable.", 404);
  }

  const row = data as Record<string, unknown>;
  const audioUrl = isPlayablePodcastAudioUrl(row.audio_url);

  if (!audioUrl) {
    return jsonPodcastError("Podcast episode audio is unavailable.", 404);
  }

  const { data: showRow, error: showError } = await supabaseAdmin
    .from("podcast_shows")
    .select("id")
    .eq("id", String(row.show_id || ""))
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("feed_status", "active")
    .maybeSingle();

  if (showError) {
    return jsonPodcastError(
      "Failed to resolve podcast playback.",
      500,
      showError.message
    );
  }

  if (!showRow) {
    return jsonPodcastError("Podcast show is unavailable.", 404);
  }

  return NextResponse.json({
    success: true,
    episode_id: episodeId,
    show_id: String(row.show_id || ""),
    title: String(row.title || "Untitled"),
    audio_url: audioUrl,
    duration_seconds: Number.isFinite(Number(row.duration_seconds))
      ? Math.max(0, Number(row.duration_seconds))
      : null,
    published_at: cleanText(row.published_at, 40),
  });
}
