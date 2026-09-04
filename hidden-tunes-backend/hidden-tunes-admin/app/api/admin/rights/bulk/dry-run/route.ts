import { NextRequest, NextResponse } from "next/server";

import { readJsonObject, rightsJsonError } from "@/lib/rights/api";
import { buildQueuedJob, normalizeIdempotencyKey, parseBulkAction } from "@/lib/rights/jobs";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const permission = await requireRightsPermission(request, "execute");
  if (permission.errorResponse) return permission.errorResponse;
  try {
    const body = await readJsonObject(request);
    if (typeof body.snapshotId !== "string") throw new Error("Snapshot id required.");
    if (typeof body.reason !== "string" || body.reason.trim().length < 3) throw new Error("Reason required.");
    const action = parseBulkAction(body.action);
    const client = getSupabaseAdmin();
    const snapshot = await client.from("rights_filter_snapshots").select("*")
      .eq("id", body.snapshotId).eq("actor_id", permission.user.id).maybeSingle();
    if (snapshot.error) return rightsJsonError("Unable to read filter snapshot.", 500, snapshot.error.message);
    if (!snapshot.data) return rightsJsonError("Filter snapshot not found.", 404);
    if (Date.parse(snapshot.data.expires_at) <= Date.now()) return rightsJsonError("Filter snapshot expired.", 409);

    const job = buildQueuedJob({
      actorId: permission.user.id,
      actorEmail: permission.profile.email,
      snapshotId: snapshot.data.id,
      kind: "dry_run",
      action,
      idempotencyKey: normalizeIdempotencyKey(body.idempotencyKey),
      expectedCount: snapshot.data.exact_count,
      reason: body.reason,
    });
    const inserted = await client.from("rights_bulk_jobs").insert(job).select("*").single();
    if (inserted.error?.code === "23505") {
      const existing = await client.from("rights_bulk_jobs").select("*")
        .eq("actor_id", permission.user.id).eq("idempotency_key", job.idempotency_key).single();
      if (existing.error) return rightsJsonError("Unable to resolve idempotent dry run.", 500, existing.error.message);
      if (existing.data.action_hash !== job.action_hash) return rightsJsonError("Idempotency key was reused for a different action.", 409);
      return NextResponse.json({ success: true, job: existing.data, idempotent: true });
    }
    if (inserted.error) return rightsJsonError("Unable to queue dry run.", 500, inserted.error.message);
    return NextResponse.json({ success: true, job: inserted.data, writesEligibility: false }, { status: 202 });
  } catch (error) {
    return rightsJsonError("Invalid dry-run request.", 400, error instanceof Error ? error.message : String(error));
  }
}
