import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  clampConcertBrowsePageSize,
  decodeConcertBrowseCursor,
  encodeConcertBrowseCursor,
  mapConcertRowToBrowseItem,
} from "@/lib/concerts/catalog/browse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/concerts/browse
 * Metadata-only public catalogue page. No stream/player preload.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pageSize = clampConcertBrowsePageSize(searchParams.get("limit"));
    const cursor = decodeConcertBrowseCursor(searchParams.get("cursor"));
    const country = searchParams.get("country");
    const language = searchParams.get("language");
    const provider = searchParams.get("provider");
    const live = searchParams.get("live");

    let query = supabaseAdmin
      .from("concert_items")
      .select(
        "id, title, primary_artist_name, artwork_url, concert_type, country_code, language_code, visibility_status, is_live, is_upcoming, is_replay, start_at, duration_seconds, region_availability, published_at, updated_at"
      )
      .eq("is_public", true)
      .eq("playback_status", "playable")
      .in("visibility_status", ["verified_upcoming", "live", "replay_available"])
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(pageSize + 1);

    if (country) query = query.eq("country_code", country.toUpperCase());
    if (language) query = query.eq("language_code", language.toLowerCase());
    if (live === "1" || live === "true") query = query.eq("is_live", true);
    if (cursor) {
      query = query.or(
        `published_at.lt.${cursor.publishedAt},and(published_at.eq.${cursor.publishedAt},id.lt.${cursor.id})`
      );
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, items: [], nextCursor: null },
        { status: 500 }
      );
    }

    let rows = data || [];
    // Optional provider filter via stream join would be heavier; skip until indexed view.
    if (provider) {
      rows = rows; // placeholder — provider filter via concert_streams in later index
    }

    const pageRows = rows.slice(0, pageSize);
    const items = pageRows.map((row) => mapConcertRowToBrowseItem(row as Record<string, unknown>));
    const last = pageRows[pageRows.length - 1] as
      | { published_at?: string; id?: string }
      | undefined;
    const nextCursor =
      rows.length > pageSize && last?.published_at && last?.id
        ? encodeConcertBrowseCursor({
            publishedAt: String(last.published_at),
            id: String(last.id),
          })
        : null;

    return NextResponse.json({
      ok: true,
      items,
      nextCursor,
      pageSize,
      preload: { streams: false, players: false },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "browse_failed",
        items: [],
        nextCursor: null,
      },
      { status: 500 }
    );
  }
}
