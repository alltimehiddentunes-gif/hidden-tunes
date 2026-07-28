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
        `id, title, primary_artist_name, artwork_url, concert_type, country_code, language_code, visibility_status, is_live, is_upcoming, is_replay, start_at, duration_seconds, region_availability, published_at, updated_at,
        concert_streams!inner(provider, provider_content_id, is_canonical_stream, playback_status)`
      )
      .eq("is_public", true)
      .eq("playback_status", "playable")
      .eq("concert_streams.playback_status", "playable")
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

    type StreamRow = {
      provider?: string | null;
      provider_content_id?: string | null;
      is_canonical_stream?: boolean | null;
      playback_status?: string | null;
    };
    type ItemRow = Record<string, unknown> & {
      concert_streams: StreamRow[];
      published_at?: string | null;
      id?: string;
    };

    let rows: ItemRow[] = ((data || []) as unknown as Array<Record<string, unknown>>).map(
      (row) => {
        const rawStreams = row.concert_streams;
        const streams: StreamRow[] = Array.isArray(rawStreams)
          ? (rawStreams as StreamRow[])
          : rawStreams
            ? [rawStreams as StreamRow]
            : [];
        streams.sort(
          (a, b) =>
            Number(Boolean(b.is_canonical_stream)) -
            Number(Boolean(a.is_canonical_stream))
        );
        return {
          ...row,
          concert_streams: streams.slice(0, 1),
        } as ItemRow;
      }
    );

    if (provider) {
      const wanted = provider.toLowerCase();
      rows = rows.filter((row) =>
        row.concert_streams.some(
          (s) => String(s.provider || "").toLowerCase() === wanted
        )
      );
    }

    const pageRows = rows.slice(0, pageSize);
    const items = pageRows.map((row) =>
      mapConcertRowToBrowseItem(row as Record<string, unknown>)
    );
    const last = pageRows[pageRows.length - 1];
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
