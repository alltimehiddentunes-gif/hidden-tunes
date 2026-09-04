import { NextRequest, NextResponse } from "next/server";

import { readJsonObject, rightsJsonError } from "@/lib/rights/api";
import { hashRightsValue, normalizeRightsFilter } from "@/lib/rights/filterSchema";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const permission = await requireRightsPermission(request, "review");
  if (permission.errorResponse) return permission.errorResponse;
  try {
    const { id } = await context.params;
    const body = await readJsonObject(request);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 160) throw new Error("Invalid name.");
      patch.name = body.name.trim();
    }
    if (body.filter !== undefined) {
      const filter = normalizeRightsFilter(body.filter);
      patch.normalized_filter = filter;
      patch.filter_hash = hashRightsValue(filter);
    }
    const result = await getSupabaseAdmin().from("rights_saved_filters").update(patch)
      .eq("id", id).eq("owner_id", permission.user.id).eq("is_template", false).select("*").maybeSingle();
    if (result.error) return rightsJsonError("Unable to update saved filter.", 500, result.error.message);
    if (!result.data) return rightsJsonError("Saved filter not found or immutable.", 404);
    return NextResponse.json({ success: true, filter: result.data });
  } catch (error) {
    return rightsJsonError("Invalid saved-filter update.", 400, error instanceof Error ? error.message : String(error));
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const permission = await requireRightsPermission(request, "review");
  if (permission.errorResponse) return permission.errorResponse;
  const { id } = await context.params;
  const result = await getSupabaseAdmin().from("rights_saved_filters").delete()
    .eq("id", id).eq("owner_id", permission.user.id).eq("is_template", false).select("id").maybeSingle();
  if (result.error) return rightsJsonError("Unable to delete saved filter.", 500, result.error.message);
  if (!result.data) return rightsJsonError("Saved filter not found or immutable.", 404);
  return NextResponse.json({ success: true, deletedId: result.data.id });
}

