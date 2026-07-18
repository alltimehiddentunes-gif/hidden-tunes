import { NextRequest } from "next/server";

import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import {
  decodeSportsCursor,
  encodeSportsCursor,
} from "@/lib/sports/home/assemble";
import {
  jsonSportsError,
  jsonSportsOk,
  parseSportsPageLimit,
} from "@/lib/sports/http";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Browse Sports taxonomy — reuses sports table; distinct from categories route. */
export async function GET(request: NextRequest) {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsOk({
        enabled: false,
        items: [],
        nextCursor: null,
      });
    }

    const url = new URL(request.url);
    const { limit } = parseSportsPageLimit(request);
    const cursor = String(url.searchParams.get("cursor") || "").trim() || null;
    const offset = decodeSportsCursor(cursor);

    const { data, error } = await supabaseAdmin
      .from("sports")
      .select("id, slug, name, description, artwork_url, sort_order, status")
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .range(offset, offset + limit);
    if (error) throw new Error(error.message);

    const rows = data || [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return jsonSportsOk({
      enabled: true,
      items: page.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        description: s.description,
        artworkUrl: s.artwork_url,
        sortOrder: s.sort_order,
      })),
      nextCursor: hasMore ? encodeSportsCursor(offset + limit) : null,
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to list sports.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
