import { NextRequest, NextResponse } from "next/server";

import { rightsJsonError } from "@/lib/rights/api";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const permission = await requireRightsPermission(request, "read");
  if (permission.errorResponse) return permission.errorResponse;
  const { id } = await context.params;
  const client = getSupabaseAdmin();
  const [job, samples] = await Promise.all([
    client.from("rights_bulk_jobs").select("*").eq("id", id).maybeSingle(),
    client.from("rights_bulk_job_targets").select("content_type,content_id,status,error_code,error_message")
      .eq("job_id", id).in("status", ["conflict", "failed"]).limit(100),
  ]);
  if (job.error || samples.error) return rightsJsonError("Unable to read rights job.", 500, job.error?.message ?? samples.error?.message);
  if (!job.data) return rightsJsonError("Rights job not found.", 404);
  return NextResponse.json({ success: true, job: job.data, samples: samples.data ?? [] });
}

