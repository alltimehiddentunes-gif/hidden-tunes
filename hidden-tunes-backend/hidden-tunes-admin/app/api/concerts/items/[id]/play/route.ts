import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveConcertProviderAdapter } from "@/lib/concerts/providers/adapters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/concerts/items/[id]/play
 * Lazy playback resolution after tap — no browse preload.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const id = String(params.id || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
    }

    const { data: item, error: itemError } = await supabaseAdmin
      .from("concert_items")
      .select(
        "id, title, is_public, playback_status, visibility_status, region_availability, region_allowed_countries, region_blocked_countries"
      )
      .eq("id", id)
      .maybeSingle();

    if (itemError) {
      return NextResponse.json({ ok: false, error: itemError.message }, { status: 500 });
    }
    if (!item) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (!item.is_public || item.playback_status !== "playable") {
      return NextResponse.json(
        { ok: false, error: "not_playable", visibility: item.visibility_status },
        { status: 403 }
      );
    }

    const { data: stream, error: streamError } = await supabaseAdmin
      .from("concert_streams")
      .select(
        "id, provider, provider_content_id, official_watch_url, embed_url, playback_method, app_embed_url, app_stream_url, is_canonical_stream"
      )
      .eq("concert_item_id", id)
      .order("is_canonical_stream", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (streamError) {
      return NextResponse.json({ ok: false, error: streamError.message }, { status: 500 });
    }
    if (!stream) {
      return NextResponse.json({ ok: false, error: "stream_missing" }, { status: 404 });
    }

    const adapter = resolveConcertProviderAdapter(
      stream.app_embed_url ||
        stream.embed_url ||
        stream.app_stream_url ||
        stream.official_watch_url ||
        stream.provider_content_id,
      stream.provider as any
    );
    const resolved = adapter?.resolvePlayback({
      contentId: stream.provider_content_id,
      watchUrl: stream.official_watch_url,
      embedUrl: stream.app_embed_url || stream.embed_url,
      streamUrl: stream.app_stream_url,
    });

    if (!resolved?.appCompatible) {
      return NextResponse.json(
        { ok: false, error: "unsupported_player", reason: resolved?.reason || "no_adapter" },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      concertItemId: item.id,
      streamId: stream.id,
      provider: stream.provider,
      method: resolved.method,
      embedUrl: resolved.embedUrl,
      streamUrl: resolved.streamUrl,
      watchUrl: resolved.watchUrl,
      region: {
        availability: item.region_availability,
        allowed: item.region_allowed_countries || [],
        blocked: item.region_blocked_countries || [],
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "play_failed" },
      { status: 500 }
    );
  }
}
