import { NextRequest, NextResponse } from "next/server";

import { rightsJsonError } from "@/lib/rights/api";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const permission = await requireRightsPermission(request, "execute");
  if (permission.errorResponse) return permission.errorResponse;
  const { id } = await context.params;
  const result = await getSupabaseAdmin().from("rights_bulk_jobs")
    .update({ cancel_requested_at: new Date().toISOString() })
    .eq("id", id).in("status", ["queued", "preparing_targets", "dry_running", "running"])
    .select("*").maybeSingle();
  if (result.error) return rightsJsonError("Unable to request cancellation.", 500, result.error.message);
  if (!result.data) return rightsJsonError("Job is not cancellable.", 409);
  return NextResponse.json({ success: true, job: result.data, cooperative: true });
}

