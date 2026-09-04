import { NextRequest, NextResponse } from "next/server";

import { readJsonObject, rightsJsonError } from "@/lib/rights/api";
import { isRightsBulkExecutionEnabled } from "@/lib/rights/config";
import { hashRightsValue } from "@/lib/rights/filterSchema";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const permission = await requireRightsPermission(request, "rollback");
  if (permission.errorResponse) return permission.errorResponse;
  if (!isRightsBulkExecutionEnabled()) {
    return rightsJsonError("Rights rollback execution is disabled by server configuration.", 503);
  }
  try {
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (typeof body.confirmationHash !== "string" || typeof body.idempotencyKey !== "string" || body.idempotencyKey.length < 8) {
      throw new Error("Fresh rollback confirmation and idempotency key required.");
    }
    const client = getSupabaseAdmin();
    const changeset = await client.from("rights_changesets").select("*, rights_bulk_jobs(snapshot_id)").eq("id", id).maybeSingle();
    if (changeset.error) return rightsJsonError("Unable to read changeset.", 500, changeset.error.message);
    if (!changeset.data) return rightsJsonError("Changeset not found.", 404);
    const entries = await client.from("rights_changeset_entries").select("id,rollback_conflict").eq("changeset_id", id);
    if (entries.error) return rightsJsonError("Unable to inspect changeset entries.", 500, entries.error.message);
    const preview = { changesetId: id, matching: entries.data?.length ?? 0,
      conflicts: (entries.data ?? []).filter((entry) => Boolean(entry.rollback_conflict)).length,
      safeToRollback: (entries.data ?? []).filter((entry) => !entry.rollback_conflict).length, writes: false };
    if (hashRightsValue(preview) !== body.confirmationHash) return rightsJsonError("Rollback preview changed; run it again.", 409);
    const parent = changeset.data.rights_bulk_jobs as { snapshot_id?: string } | { snapshot_id?: string }[] | null;
    const snapshotId = Array.isArray(parent) ? parent[0]?.snapshot_id : parent?.snapshot_id;
    if (!snapshotId) return rightsJsonError("Original filter snapshot unavailable.", 409);
    const action = { type: "rollback_changeset", changesetId: id };
    const inserted = await client.from("rights_bulk_jobs").insert({
      actor_id: permission.user.id, actor_email: permission.profile.email, snapshot_id: snapshotId,
      job_kind: "rollback", status: "rollback_queued", action_payload: action,
      action_hash: hashRightsValue(action), idempotency_key: body.idempotencyKey,
      expected_count: preview.safeToRollback, reason: typeof body.reason === "string" ? body.reason.slice(0, 1000) : `Rollback ${id}`,
    }).select("*").single();
    if (inserted.error) return rightsJsonError("Unable to queue rollback.", 500, inserted.error.message);
    return NextResponse.json({ success: true, job: inserted.data }, { status: 202 });
  } catch (error) {
    return rightsJsonError("Invalid rollback request.", 400, error instanceof Error ? error.message : String(error));
  }
}
