import { NextResponse } from "next/server";

import { applyPublicRadioFilters, cleanRadioText, jsonRadioError } from "@/lib/radioPublicCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const query = applyPublicRadioFilters(
    supabaseAdmin
      .from("radio_stations")
      .select("category_slug, categories, tags")
      .range(0, 4999),
    {}
  );
  const { data, error } = await query;

  if (error) {
    return jsonRadioError("Failed to load radio categories.", 500, error.message);
  }

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

  return NextResponse.json({
    success: true,
    categories,
  });
}
