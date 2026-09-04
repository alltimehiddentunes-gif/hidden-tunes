import { NextRequest, NextResponse } from "next/server";

import { positiveInt, rightsJsonError } from "@/lib/rights/api";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  const permission = await requireRightsPermission(request, "read");
  if (permission.errorResponse) return permission.errorResponse;
  const result = await getSupabaseAdmin().from("rights_changesets").select("*")
    .order("created_at", { ascending: false })
    .limit(positiveInt(request.nextUrl.searchParams.get("limit"), 50, 100));
  if (result.error) return rightsJsonError("Unable to list changesets.", 500, result.error.message);
  return NextResponse.json({ success: true, changesets: result.data ?? [] });
}

