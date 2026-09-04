import { NextRequest, NextResponse } from "next/server";

import { positiveInt, rightsJsonError } from "@/lib/rights/api";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const permission = await requireRightsPermission(request, "read");
  if (permission.errorResponse) return permission.errorResponse;
  const limit = positiveInt(request.nextUrl.searchParams.get("limit"), 50, 100);
  let query = getSupabaseAdmin().from("rights_bulk_jobs").select("*")
    .order("created_at", { ascending: false }).limit(limit);
  const status = request.nextUrl.searchParams.get("status");
  if (status) query = query.eq("status", status);
  const result = await query;
  if (result.error) return rightsJsonError("Unable to list rights jobs.", 500, result.error.message);
  return NextResponse.json({ success: true, jobs: result.data ?? [] });
}

