import { applyRightsFilter } from "../lib/rights/catalogQuery";
import { isRightsBulkExecutionEnabled } from "../lib/rights/config";
import { runDryRun, type DryRunTarget } from "../lib/rights/dryRun";
import { hashRightsValue } from "../lib/rights/filterSchema";
import type { DryRunSummary, RightsBulkAction } from "../lib/rights/types";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";

const BATCH_SIZE = Math.min(Math.max(Number(process.env.RIGHTS_JOB_BATCH_SIZE) || 500, 100), 2000);
const executeRequested = process.argv.includes("--execute");
const allowExecution = executeRequested && isRightsBulkExecutionEnabled();

type Job = {
  id: string; actor_id: string; actor_email: string | null; snapshot_id: string;
  job_kind: "dry_run" | "execute" | "rollback" | "export" | "reconcile";
  action_payload: RightsBulkAction | { type: "rollback_changeset"; changesetId: string }; action_hash: string; expected_count: number; reason: string;
};

function emptySummary(): DryRunSummary {
  return { matching: 0, wouldChange: 0, unchanged: 0, conflicts: 0, contentOverrides: 0,
    inheritedProviderPolicies: 0, inheritedBatchPolicies: 0, expiredLicenses: 0,
    blockedByHigherPriorityPolicy: 0, currentlyEnabled: 0, currentlyDisabled: 0,
    proposedEnabled: 0, proposedDisabled: 0 };
}

function mergeSummary(target: DryRunSummary, source: DryRunSummary) {
  for (const key of Object.keys(target) as (keyof DryRunSummary)[]) target[key] += source[key];
}

async function ensureNotCancelled(jobId: string) {
  const result = await getSupabaseAdmin().from("rights_bulk_jobs").select("cancel_requested_at").eq("id", jobId).single();
  if (result.error) throw result.error;
  if (result.data.cancel_requested_at) throw new Error("job_cancelled");
}

async function audit(job: Job, action: string, result: string, affectedCount: number, metadata: Record<string, unknown> = {}) {
  const inserted = await getSupabaseAdmin().from("rights_audit_log").insert({
    actor_id: job.actor_id, actor_email: job.actor_email, action, reason: job.reason,
    action_hash: job.action_hash, job_id: job.id, affected_count: affectedCount, result, metadata,
  });
  if (inserted.error) throw inserted.error;
}

async function materializeTargets(job: Job) {
  const client = getSupabaseAdmin();
  const snapshotResult = await client.from("rights_filter_snapshots").select("*").eq("id", job.snapshot_id).single();
  if (snapshotResult.error) throw snapshotResult.error;
  const snapshot = snapshotResult.data;
  if (Date.parse(snapshot.expires_at) <= Date.now()) throw new Error("snapshot_expired");

  let lastCatalogId = 0;
  let ordinal = 0;
  while (true) {
    await ensureNotCancelled(job.id);
    const base = client.from("rights_catalog_items")
      .select("id,content_type,content_id").gt("id", lastCatalogId)
      .order("id", { ascending: true }).limit(BATCH_SIZE);
    const filtered = applyRightsFilter(base, snapshot.normalized_filter).query;
    const result = await filtered;
    if (result.error) throw result.error;
    const rows = result.data ?? [];
    if (rows.length === 0) break;
    const targets = rows.map((row: { id: number; content_type: string; content_id: string }) => ({
      job_id: job.id, ordinal: ++ordinal, catalog_item_id: row.id,
      content_type: row.content_type, content_id: row.content_id,
    }));
    const inserted = await client.from("rights_bulk_job_targets").upsert(targets, {
      onConflict: "job_id,catalog_item_id", ignoreDuplicates: true,
    });
    if (inserted.error) throw inserted.error;
    lastCatalogId = Number(rows[rows.length - 1].id);
    await client.from("rights_bulk_jobs").update({ target_count: ordinal, updated_at: new Date().toISOString() }).eq("id", job.id);
    if (rows.length < BATCH_SIZE) break;
  }
  if (ordinal !== Number(job.expected_count)) throw new Error(`snapshot_count_mismatch:${ordinal}:${job.expected_count}`);
  return { snapshot, targetCount: ordinal };
}

async function processDryRun(job: Job, snapshot: Record<string, unknown>) {
  if (job.action_payload.type === "rollback_changeset") throw new Error("invalid_dry_run_action");
  const client = getSupabaseAdmin();
  await client.from("rights_bulk_jobs").update({ status: "dry_running" }).eq("id", job.id);
  const summary = emptySummary();
  let afterOrdinal = 0;
  while (true) {
    await ensureNotCancelled(job.id);
    const targets = await client.from("rights_bulk_job_targets")
      .select("ordinal,catalog_item_id").eq("job_id", job.id).gt("ordinal", afterOrdinal)
      .order("ordinal").limit(BATCH_SIZE);
    if (targets.error) throw targets.error;
    const rows = targets.data ?? [];
    if (rows.length === 0) break;
    const ids = rows.map((row) => row.catalog_item_id);
    const items = await client.from("rights_catalog_items")
      .select("id,base_rights_status,ios_enabled,android_enabled,web_enabled,windows_enabled,macos_enabled,linux_enabled,license_expires_at,provider_id,import_batch")
      .in("id", ids);
    if (items.error) throw items.error;
    const platform = job.action_payload.type === "set_platform" ? job.action_payload.platform : "ios";
    const dryTargets: DryRunTarget[] = (items.data ?? []).map((item) => ({
      id: String(item.id), rightsStatus: item.base_rights_status,
      platformEnabled: Boolean(item[`${platform}_enabled`]),
      providerInherited: Boolean(item.provider_id), batchInherited: Boolean(item.import_batch),
      expiredLicense: Boolean(item.license_expires_at && Date.parse(item.license_expires_at) <= Date.now()),
    }));
    const part = runDryRun(dryTargets, job.action_payload);
    mergeSummary(summary, part.summary);
    afterOrdinal = Number(rows[rows.length - 1].ordinal);
    await client.from("rights_bulk_jobs").update({ processed_count: summary.matching, unchanged_count: summary.unchanged, conflict_count: summary.conflicts, updated_at: new Date().toISOString() }).eq("id", job.id);
  }
  const dryRunHash = hashRightsValue({ snapshotId: job.snapshot_id, actionHash: job.action_hash,
    catalogWatermark: snapshot.catalog_watermark, policyRevision: snapshot.policy_revision, summary });
  const completed = await client.from("rights_bulk_jobs").update({
    status: "completed", processed_count: summary.matching, succeeded_count: summary.wouldChange,
    unchanged_count: summary.unchanged, conflict_count: summary.conflicts, dry_run_hash: dryRunHash,
    confirmation_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", job.id);
  if (completed.error) throw completed.error;
  await audit(job, "dry_run_completed", "completed", summary.matching, { summary, writesEligibility: false });
}

async function processExecution(job: Job, snapshot: Record<string, unknown>) {
  if (!allowExecution) throw new Error("rights_bulk_execution_disabled");
  if (job.action_payload.type === "rollback_changeset") throw new Error("invalid_execute_action");
  const client = getSupabaseAdmin();
  const changeset = await client.from("rights_changesets").insert({
    job_id: job.id, actor_id: job.actor_id, actor_email: job.actor_email, reason: job.reason,
    filter_snapshot: snapshot, action_payload: job.action_payload,
  }).select("*").single();
  if (changeset.error) throw changeset.error;
  await client.from("rights_bulk_jobs").update({ status: "running", changeset_id: changeset.data.id }).eq("id", job.id);

  let processed = 0;
  let changed = 0;
  let failed = 0;
  while (true) {
    await ensureNotCancelled(job.id);
    const targets = await client.from("rights_bulk_job_targets").select("*")
      .eq("job_id", job.id).eq("status", "pending").order("ordinal").limit(BATCH_SIZE);
    if (targets.error) throw targets.error;
    if (!targets.data?.length) break;
    for (const target of targets.data) {
      try {
        const existing = await client.from("rights_item_overrides").select("*")
          .eq("content_type", target.content_type).eq("content_id", target.content_id).maybeSingle();
        if (existing.error) throw existing.error;
        const before = existing.data ?? null;
        const next: Record<string, unknown> = before ? { ...before } : {
          content_type: target.content_type, content_id: target.content_id, rights_status: null,
          platform_rules: {}, territories: [], worldwide: false, legal_block: false,
          reason: job.reason, version: 0, active: true, created_by: job.actor_id, notes: [],
        };
        const action = job.action_payload;
        if (action.type === "set_rights_status") next.rights_status = action.status;
        else if (action.type === "set_platform") next.platform_rules = { ...(next.platform_rules as object), [action.platform]: action.enabled };
        else if (action.type === "attach_license") next.license_id = action.licenseId;
        else if (action.type === "set_territories") { next.territories = action.territories; next.worldwide = action.worldwide; }
        else if (action.type === "set_expiry") next.expires_at = action.expiresAt;
        else if (action.type === "add_note") next.notes = [...((next.notes as string[]) ?? []), action.note];
        next.version = Number(next.version ?? 0) + 1;
        next.reason = job.reason;
        next.updated_at = new Date().toISOString();

        if (action.type === "set_provider" || action.type === "assign_review") {
          const field = action.type === "set_provider" ? { provider_id: action.providerId } : { review_assignee: action.assigneeId };
          const updated = await client.from("rights_catalog_items").update(field).eq("id", target.catalog_item_id);
          if (updated.error) throw updated.error;
        } else {
          const saved = before
            ? await client.from("rights_item_overrides").update(next).eq("id", before.id).eq("version", before.version).select("id").maybeSingle()
            : await client.from("rights_item_overrides").insert(next).select("id").maybeSingle();
          if (saved.error) throw saved.error;
          if (!saved.data) throw new Error("concurrent_override_conflict");
        }
        const entry = await client.from("rights_changeset_entries").insert({
          changeset_id: changeset.data.id, content_type: target.content_type, content_id: target.content_id,
          field_name: job.action_payload.type, before_value: before, after_value: next,
          expected_version: Number(next.version ?? 1),
        });
        if (entry.error) throw entry.error;
        await client.from("rights_bulk_job_targets").update({ status: "changed", before_state: before, after_state: next, processed_at: new Date().toISOString() })
          .eq("job_id", job.id).eq("catalog_item_id", target.catalog_item_id);
        changed++;
      } catch (error) {
        failed++;
        await client.from("rights_bulk_job_targets").update({ status: "failed", error_code: "apply_failed", error_message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500), processed_at: new Date().toISOString() })
          .eq("job_id", job.id).eq("catalog_item_id", target.catalog_item_id);
      }
      processed++;
    }
    await client.from("rights_bulk_jobs").update({ processed_count: processed, succeeded_count: changed, failed_count: failed, updated_at: new Date().toISOString() }).eq("id", job.id);
  }
  const status = failed === 0 ? "completed" : changed > 0 ? "partial" : "failed";
  await client.from("rights_changesets").update({ affected_count: changed, failure_count: failed, status: failed ? "partially_applied" : "applied" }).eq("id", changeset.data.id);
  await client.from("rights_bulk_jobs").update({ status, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
  await audit(job, "bulk_execution_completed", status, changed, { failed, changesetId: changeset.data.id });
}

async function processRollback(job: Job) {
  if (!allowExecution) throw new Error("rights_bulk_execution_disabled");
  if (job.action_payload.type !== "rollback_changeset") throw new Error("invalid_rollback_action");
  const client = getSupabaseAdmin();
  const changesetId = job.action_payload.changesetId;
  await client.from("rights_bulk_jobs").update({ status: "rolling_back" }).eq("id", job.id);
  let afterId = 0;
  let restored = 0;
  let conflictCount = 0;
  while (true) {
    await ensureNotCancelled(job.id);
    const entries = await client.from("rights_changeset_entries").select("*")
      .eq("changeset_id", changesetId).gt("id", afterId).order("id").limit(BATCH_SIZE);
    if (entries.error) throw entries.error;
    if (!entries.data?.length) break;
    for (const entry of entries.data) {
      const current = await client.from("rights_item_overrides").select("*")
        .eq("content_type", entry.content_type).eq("content_id", entry.content_id).maybeSingle();
      if (current.error) throw current.error;
      const afterState = entry.after_value as Record<string, unknown> | null;
      if (!afterState || !current.data || Number(current.data.version) !== Number(entry.expected_version)) {
        conflictCount++;
        await client.from("rights_changeset_entries").update({ rollback_conflict: "newer_or_non_override_change" }).eq("id", entry.id);
        continue;
      }
      if (entry.before_value === null) {
        const removed = await client.from("rights_item_overrides").delete().eq("id", current.data.id).eq("version", entry.expected_version);
        if (removed.error) throw removed.error;
      } else {
        const before = entry.before_value as Record<string, unknown>;
        const restoredState = { ...before, version: Number(current.data.version) + 1, updated_at: new Date().toISOString() };
        const updated = await client.from("rights_item_overrides").update(restoredState).eq("id", current.data.id).eq("version", entry.expected_version).select("id").maybeSingle();
        if (updated.error) throw updated.error;
        if (!updated.data) {
          conflictCount++;
          await client.from("rights_changeset_entries").update({ rollback_conflict: "concurrent_update" }).eq("id", entry.id);
          continue;
        }
      }
      await client.from("rights_changeset_entries").update({ rolled_back_at: new Date().toISOString(), rollback_conflict: null }).eq("id", entry.id);
      restored++;
    }
    afterId = Number(entries.data[entries.data.length - 1].id);
    await client.from("rights_bulk_jobs").update({ processed_count: restored + conflictCount, succeeded_count: restored, conflict_count: conflictCount }).eq("id", job.id);
  }
  const finalStatus = conflictCount ? "rollback_conflicted" : "rolled_back";
  await client.from("rights_changesets").update({ status: conflictCount ? "rollback_conflicted" : "rolled_back", rolled_back_at: new Date().toISOString(), rolled_back_by: job.actor_id }).eq("id", changesetId);
  await client.from("rights_bulk_jobs").update({ status: finalStatus, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
  await audit(job, "rollback_completed", finalStatus, restored, { changesetId, conflicts: conflictCount });
}

async function main() {
  if (executeRequested && !allowExecution) throw new Error("--execute requires RIGHTS_BULK_EXECUTION_ENABLED=true");
  const client = getSupabaseAdmin();
  const claimed = await client.rpc("rights_claim_next_job", { p_allow_execute: allowExecution }).maybeSingle();
  if (claimed.error) throw claimed.error;
  if (!claimed.data) { console.log("No eligible rights job queued."); return; }
  const job = claimed.data as Job;
  try {
    if (job.job_kind === "rollback") {
      await processRollback(job);
      console.log(`Rights rollback job ${job.id} completed.`);
    } else {
      const { snapshot, targetCount } = await materializeTargets(job);
      if (job.job_kind === "dry_run") await processDryRun(job, snapshot);
      else if (job.job_kind === "execute") await processExecution(job, snapshot);
      else throw new Error(`unsupported_worker_job:${job.job_kind}`);
      console.log(`Rights job ${job.id} completed with ${targetCount} immutable targets.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cancelled = message === "job_cancelled";
    await client.from("rights_bulk_jobs").update({ status: cancelled ? "cancelled" : "failed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
    await audit(job, cancelled ? "job_cancelled" : "job_failed", cancelled ? "cancelled" : "failed", 0, { error: message.slice(0, 500) });
    if (cancelled) { console.log(`Rights job ${job.id} cancelled cooperatively.`); return; }
    throw error;
  }
}

void main();
