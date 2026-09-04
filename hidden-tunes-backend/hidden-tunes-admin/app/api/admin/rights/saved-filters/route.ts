import { NextRequest, NextResponse } from "next/server";

import { readJsonObject, rightsJsonError } from "@/lib/rights/api";
import { hashRightsValue, normalizeRightsFilter } from "@/lib/rights/filterSchema";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  const permission = await requireRightsPermission(request, "read");
  if (permission.errorResponse) return permission.errorResponse;
  const result = await getSupabaseAdmin().from("rights_saved_filters").select("*")
    .or(`owner_id.eq.${permission.user.id},is_template.eq.true`).order("name").limit(250);
  if (result.error) return rightsJsonError("Unable to list saved filters.", 500, result.error.message);
  return NextResponse.json({ success: true, filters: result.data ?? [] });
}

export async function POST(request: NextRequest) {
  const permission = await requireRightsPermission(request, "review");
  if (permission.errorResponse) return permission.errorResponse;
  try {
    const body = await readJsonObject(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 160) throw new Error("Saved-filter name required.");
    const filter = normalizeRightsFilter(body.filter);
    const result = await getSupabaseAdmin().from("rights_saved_filters").insert({
      name,
      owner_id: permission.user.id,
      normalized_filter: filter,
      filter_hash: hashRightsValue(filter),
      is_template: false,
    }).select("*").single();
    if (result.error) return rightsJsonError("Unable to save filter.", 500, result.error.message);
    return NextResponse.json({ success: true, filter: result.data }, { status: 201 });
  } catch (error) {
    return rightsJsonError("Invalid saved filter.", 400, error instanceof Error ? error.message : String(error));
  }
}

