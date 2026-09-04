import { NextRequest, NextResponse } from "next/server";

import { PROPOSED_COHORTS } from "@/lib/rights/cohorts";
import { isRightsBulkExecutionEnabled, isRightsEnforcementEnabled } from "@/lib/rights/config";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function count(client: ReturnType<typeof getSupabaseAdmin>, column?: string, value?: string) {
  let query = client.from("rights_catalog_items").select("id", { count: "exact", head: true });
  if (column && value) query = query.eq(column, value);
  const result = await query;
  if (result.error) throw result.error;
  return result.count ?? 0;
}

export async function GET(request: NextRequest) {
  const permission = await requireRightsPermission(request, "read");
  if (permission.errorResponse) return permission.errorResponse;
  try {
    const client = getSupabaseAdmin();
    const [total, green, amber, red, unknown, jobs] = await Promise.all([
      count(client), count(client, "base_rights_status", "green"),
      count(client, "base_rights_status", "amber"), count(client, "base_rights_status", "red"),
      count(client, "base_rights_status", "unknown"),
      client.from("rights_bulk_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "preparing_targets", "dry_running", "running"]),
    ]);
    if (jobs.error) throw jobs.error;
    return NextResponse.json({
      success: true,
      counts: { total, green, amber, red, unknown, activeJobs: jobs.count ?? 0 },
      gates: {
        enforcementEnabled: isRightsEnforcementEnabled(),
        bulkExecutionEnabled: isRightsBulkExecutionEnabled(),
      },
      proposedCohorts: PROPOSED_COHORTS,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "Rights schema is unavailable or not yet migrated.",
      details: error instanceof Error ? error.message : String(error),
      gates: { enforcementEnabled: false, bulkExecutionEnabled: false },
      proposedCohorts: PROPOSED_COHORTS,
    }, { status: 503 });
  }
}

