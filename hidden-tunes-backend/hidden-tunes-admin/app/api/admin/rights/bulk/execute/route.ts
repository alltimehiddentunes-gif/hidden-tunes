import { NextRequest, NextResponse } from "next/server";

import { readJsonObject, rightsJsonError } from "@/lib/rights/api";
import { isRightsBulkExecutionEnabled } from "@/lib/rights/config";
import { buildQueuedJob, normalizeIdempotencyKey, parseBulkAction } from "@/lib/rights/jobs";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const permission = await requireRightsPermission(request, "execute");
  if (permission.errorResponse) return permission.errorResponse;
  if (!isRightsBulkExecutionEnabled()) {
    return rightsJsonError("Rights bulk execution is disabled by server configuration.", 503);
  }
  try {
    const body = await readJsonObject(request);
    if (typeof body.dryRunJobId !== "string") throw new Error("Completed dry-run job id required.");
    if (typeof body.reason !== "string" || body.reason.trim().length < 3) throw new Error("Reason required.");
    const action = parseBulkAction(body.action);
    const client = getSupabaseAdmin();
    const dryRun = await client.from("rights_bulk_jobs").select("*, rights_filter_snapshots(*)")
      .eq("id", body.dryRunJobId).eq("actor_id", permission.user.id).eq("job_kind", "dry_run").maybeSingle();
    if (dryRun.error) return rightsJsonError("Unable to verify dry run.", 500, dryRun.error.message);
    if (!dryRun.data || dryRun.data.status !== "completed" || !dryRun.data.dry_run_hash) {
      return rightsJsonError("A completed dry run is required.", 409);
    }
    if (!dryRun.data.confirmation_expires_at || Date.parse(dryRun.data.confirmation_expires_at) <= Date.now()) {
      return rightsJsonError("Dry-run confirmation expired; run a new preview.", 409);
    }
    const snapshotRelation = dryRun.data.rights_filter_snapshots as Record<string, unknown> | Record<string, unknown>[] | null;
    const snapshot = Array.isArray(snapshotRelation) ? snapshotRelation[0] : snapshotRelation;
    if (!snapshot) return rightsJsonError("Dry-run snapshot unavailable.", 409);
    const [watermark, revision] = await Promise.all([
      client.from("rights_catalog_items").select("indexed_at").order("indexed_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("rights_policies").select("version").order("version", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (watermark.error || revision.error) return rightsJsonError("Unable to validate dry-run drift.", 500, watermark.error?.message ?? revision.error?.message);
    if ((watermark.data?.indexed_at ?? new Date(0).toISOString()) !== snapshot.catalog_watermark ||
        (revision.data?.version ?? 0) !== snapshot.policy_revision) {
      return rightsJsonError("Catalog or policy state changed after dry run; run it again.", 409);
    }
    const job = buildQueuedJob({
      actorId: permission.user.id,
      actorEmail: permission.profile.email,
      snapshotId: dryRun.data.snapshot_id,
      kind: "execute",
      action,
      idempotencyKey: normalizeIdempotencyKey(body.idempotencyKey),
      expectedCount: dryRun.data.expected_count,
      reason: body.reason,
      dryRunHash: dryRun.data.dry_run_hash,
    });
    if (job.action_hash !== dryRun.data.action_hash) return rightsJsonError("Action changed after dry run.", 409);
    const inserted = await client.from("rights_bulk_jobs").insert(job).select("*").single();
    if (inserted.error?.code === "23505") {
      const existing = await client.from("rights_bulk_jobs").select("*")
        .eq("actor_id", permission.user.id).eq("idempotency_key", job.idempotency_key).single();
      if (existing.error) return rightsJsonError("Unable to resolve idempotent execution.", 500, existing.error.message);
      if (existing.data.action_hash !== job.action_hash) return rightsJsonError("Idempotency key conflict.", 409);
      return NextResponse.json({ success: true, job: existing.data, idempotent: true });
    }
    if (inserted.error) return rightsJsonError("Unable to queue rights job.", 500, inserted.error.message);
    return NextResponse.json({ success: true, job: inserted.data }, { status: 202 });
  } catch (error) {
    return rightsJsonError("Invalid execution request.", 400, error instanceof Error ? error.message : String(error));
  }
}
