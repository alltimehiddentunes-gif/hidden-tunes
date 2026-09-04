import { NextRequest, NextResponse } from "next/server";

import { positiveInt, rightsJsonError } from "@/lib/rights/api";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  const permission = await requireRightsPermission(request, "read");
  if (permission.errorResponse) return permission.errorResponse;
  const limit = positiveInt(request.nextUrl.searchParams.get("limit"), 100, 250);
  let query = getSupabaseAdmin().from("rights_audit_log").select("*")
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  const beforeId = request.nextUrl.searchParams.get("beforeId");
  if (beforeId && /^\d+$/.test(beforeId)) query = query.lt("id", beforeId);
  const result = await query;
  if (result.error) return rightsJsonError("Unable to list rights audit events.", 500, result.error.message);
  return NextResponse.json({ success: true, events: result.data ?? [] });
}

