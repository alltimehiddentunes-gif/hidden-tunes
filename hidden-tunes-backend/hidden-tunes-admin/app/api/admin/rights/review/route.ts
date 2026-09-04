import { NextRequest, NextResponse } from "next/server";

import { rightsJsonError } from "@/lib/rights/api";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  const permission = await requireRightsPermission(request, "review");
  if (permission.errorResponse) return permission.errorResponse;
  const result = await getSupabaseAdmin().from("rights_catalog_items")
    .select("id,content_type,content_id,title,creator_name,provider_id,base_rights_status,evidence_status,review_assignee,sort_at")
    .or("base_rights_status.eq.unknown,evidence_status.eq.needs_review")
    .order("sort_at", { ascending: false }).limit(250);
  if (result.error) return rightsJsonError("Unable to list rights review queue.", 500, result.error.message);
  return NextResponse.json({ success: true, items: result.data ?? [] });
}

