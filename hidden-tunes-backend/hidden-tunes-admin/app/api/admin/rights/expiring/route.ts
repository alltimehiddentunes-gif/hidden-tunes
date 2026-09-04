import { NextRequest, NextResponse } from "next/server";

import { positiveInt, rightsJsonError } from "@/lib/rights/api";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  const permission = await requireRightsPermission(request, "read");
  if (permission.errorResponse) return permission.errorResponse;
  const days = positiveInt(request.nextUrl.searchParams.get("days"), 90, 365);
  const until = new Date(Date.now() + days * 86_400_000).toISOString();
  const result = await getSupabaseAdmin().from("rights_licenses").select("*")
    .eq("status", "active").not("expires_at", "is", null).lte("expires_at", until)
    .order("expires_at", { ascending: true }).limit(250);
  if (result.error) return rightsJsonError("Unable to list expiring licenses.", 500, result.error.message);
  return NextResponse.json({ success: true, days, licenses: result.data ?? [] });
}

