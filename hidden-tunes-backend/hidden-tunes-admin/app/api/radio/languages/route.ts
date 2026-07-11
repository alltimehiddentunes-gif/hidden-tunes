import { NextResponse } from "next/server";

import { applyPublicRadioFilters, cleanRadioText, jsonRadioError } from "@/lib/radioPublicCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const query = applyPublicRadioFilters(
    supabaseAdmin
      .from("radio_stations")
      .select("language")
      .range(0, 4999),
    {}
  );
  const { data, error } = await query;

  if (error) {
    return jsonRadioError("Failed to load radio languages.", 500, error.message);
  }

  const counts = new Map<string, number>();
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    for (const part of cleanRadioText(row.language, 160).split(",")) {
      const name = cleanRadioText(part, 80).toLowerCase();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }

  const languages = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 200);

  return NextResponse.json({
    success: true,
    languages,
  });
}
