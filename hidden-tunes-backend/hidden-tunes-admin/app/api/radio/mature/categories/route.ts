import { NextRequest, NextResponse } from "next/server";

import { applyMatureRadioPublicFilters, parseMatureRadioAccess } from "@/lib/radioMature/platformPolicy";
import { cleanRadioText, jsonRadioError } from "@/lib/radioPublicCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!parseMatureRadioAccess(request)) {
    return jsonRadioError("Mature radio requires age confirmation.", 403);
  }

  const query = applyMatureRadioPublicFilters(
    supabaseAdmin.from("radio_stations").select("category_slug, categories, tags").range(0, 4999)
  );
  const { data, error } = await query;
  if (error) return jsonRadioError("Failed to load mature radio categories.", 500, error.message);

  const counts = new Map<string, number>();
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const values = [
      cleanRadioText(row.category_slug, 80).toLowerCase(),
      ...(Array.isArray(row.categories) ? row.categories : []),
      ...(Array.isArray(row.tags) ? row.tags : []),
    ];
    for (const value of values) {
      const id = cleanRadioText(value, 80).toLowerCase();
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }

  const categories = [...counts.entries()]
    .map(([id, count]) => ({ id, name: id.replace(/-/g, " "), count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, 200);

  return NextResponse.json({ success: true, categories });
}
