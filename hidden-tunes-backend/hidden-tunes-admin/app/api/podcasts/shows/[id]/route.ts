import { NextResponse } from "next/server";

import {
  PODCAST_PUBLIC_SHOW_SELECT,
  toPodcastPublicShow,
} from "@/lib/podcastCatalog";
import { jsonPodcastError } from "@/lib/podcastPublicApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function loadPublicShow(idParam: string) {
  const cleaned = String(idParam || "").trim();
  if (!cleaned) return null;

  let query = supabaseAdmin
    .from("podcast_shows")
    .select(PODCAST_PUBLIC_SHOW_SELECT)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("feed_status", "active");

  if (UUID_RE.test(cleaned)) {
    query = query.eq("id", cleaned);
  } else {
    query = query.eq("slug", cleaned);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown> | null;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const row = await loadPublicShow(id);

    if (!row) {
      return jsonPodcastError("Podcast show not found.", 404);
    }

    return NextResponse.json({
      success: true,
      show: toPodcastPublicShow(row),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error.";

    return jsonPodcastError("Failed to load podcast show.", 500, message);
  }
}
