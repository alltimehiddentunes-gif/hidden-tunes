/**
 * Stale-live expiry + unsafe-broadcast quarantine workers.
 * Bounded, dry-run by default when invoked via runSportsWorker unless apply flags set.
 */

import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveSportsStatusAuthority } from "../status/statusAuthority";
import {
  classifySportsBroadcast,
} from "../broadcasts/classification";
import type { SportsWorkerContext, SportsWorkerReport } from "./index";
import { sportsCacheInvalidate } from "../cache";

export async function runSportsExpiryCleanupWorker(
  ctx: SportsWorkerContext = {}
): Promise<SportsWorkerReport> {
  const startedAt = new Date().toISOString();
  const batchSize = Math.min(100, Math.max(1, ctx.batchSize ?? 25));
  const errors: string[] = [];
  const notes: string[] = [];
  let processed = 0;
  let recoveryBatchId: string | null = null;

  const { data: liveRows, error } = await supabaseAdmin
    .from("sports_fixtures")
    .select("id, status, starts_at, ends_at, metadata, sport_id, provider_status_fresh_at")
    .eq("status", "live")
    .limit(batchSize);

  if (error) {
    return {
      workerKey: "sports-expiry-cleanup",
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "failed",
      processed: 0,
      errors: [error.message],
      notes,
    };
  }

  const now = new Date();
  const sportIds = [...new Set((liveRows || []).map((row) => row.sport_id).filter(Boolean))];
  const sportSlugById = new Map<string, string>();
  if (sportIds.length) {
    const { data: sports, error: sportsError } = await supabaseAdmin
      .from("sports")
      .select("id, slug")
      .in("id", sportIds);
    if (sportsError) errors.push(sportsError.message);
    for (const sport of sports || []) sportSlugById.set(sport.id, sport.slug);
  }
  for (const row of liveRows || []) {
    const auth = resolveSportsStatusAuthority({
      fixtureStatus: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      metadata: (row.metadata || {}) as Record<string, unknown>,
      sportSlug: sportSlugById.get(row.sport_id) || null,
      providerStatusFreshAt: row.provider_status_fresh_at,
      now,
    });
    if (!auth.staleLiveCandidate) continue;
    processed += 1;
    notes.push(`stale_live_candidate:${row.id}`);
    if (ctx.dryRun !== false) {
      // default dry-run
      continue;
    }
    if (!recoveryBatchId) {
      const { data: batchId, error: batchError } = await supabaseAdmin.rpc(
        "sports_fixture_recovery_begin",
        {
          p_batch_key: `sports-expiry-cleanup-${now.toISOString()}-${randomUUID()}`,
          p_operation: "scheduled_stale_live_expiry",
          p_metadata: { worker: "sports-expiry-cleanup" },
        }
      );
      if (batchError || !batchId) {
        errors.push(batchError?.message || "recovery batch was not created");
        break;
      }
      recoveryBatchId = String(batchId);
    }
    const { error: captureError } = await supabaseAdmin.rpc(
      "sports_fixture_recovery_capture_fixture",
      { p_batch_id: recoveryBatchId, p_fixture_id: row.id }
    );
    if (captureError) {
      errors.push(captureError.message);
      break;
    }
    const { error: upErr } = await supabaseAdmin
      .from("sports_fixtures")
      .update({
        status: "expired",
        availability_state: "live_unavailable",
        playable: false,
        metadata: {
          ...((row.metadata as object) || {}),
          phase1_stale_live_finalized_at: now.toISOString(),
          phase1_finalization_reason: auth.reason,
        },
        updated_at: now.toISOString(),
        status_updated_at: now.toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "live");
    if (upErr) errors.push(upErr.message);
  }

  if (ctx.dryRun === false && recoveryBatchId) {
    if (errors.length) {
      const { error: rollbackError } = await supabaseAdmin.rpc(
        "sports_fixture_recovery_rollback",
        { p_batch_id: recoveryBatchId }
      );
      if (rollbackError) errors.push(`rollback_failed:${rollbackError.message}`);
    } else {
      const { error: appliedError } = await supabaseAdmin.rpc(
        "sports_fixture_recovery_mark_applied",
        { p_batch_id: recoveryBatchId }
      );
      if (appliedError) {
        errors.push(appliedError.message);
      } else {
        const { error: versionError } = await supabaseAdmin.rpc(
          "sports_bump_fixture_data_version"
        );
        if (versionError) errors.push(versionError.message);
      }
      if (errors.length) {
        const { error: rollbackError } = await supabaseAdmin.rpc(
          "sports_fixture_recovery_rollback",
          { p_batch_id: recoveryBatchId }
        );
        if (rollbackError) errors.push(`rollback_failed:${rollbackError.message}`);
      }
    }
  }

  notes.push(ctx.dryRun === false ? "apply=true" : "dryRun=true");
  if (ctx.dryRun === false && processed > 0 && errors.length === 0) {
    sportsCacheInvalidate("sports-home");
  }

  return {
    workerKey: "sports-expiry-cleanup",
    startedAt,
    finishedAt: new Date().toISOString(),
    status: errors.length ? "failed" : "completed",
    processed,
    errors,
    notes,
  };
}

export async function runSportsUnsafeBroadcastQuarantineWorker(
  ctx: SportsWorkerContext = {}
): Promise<SportsWorkerReport> {
  const startedAt = new Date().toISOString();
  const batchSize = Math.min(100, Math.max(1, ctx.batchSize ?? 50));
  const errors: string[] = [];
  const notes: string[] = [];
  let processed = 0;

  const { data: rows, error } = await supabaseAdmin
    .from("sports_broadcasts")
    .select(
      "id, publisher_name, publisher_domain, broadcast_type, playback_kind, is_official, verification_status, validation_status, validation_expires_at, metadata, quarantined_at"
    )
    .is("quarantined_at", null)
    .limit(batchSize);

  if (error) {
    return {
      workerKey: "sports-quarantine-recovery",
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "failed",
      processed: 0,
      errors: [error.message],
      notes: ["unsafe_broadcast_scan_failed"],
    };
  }

  const now = new Date();
  for (const b of rows || []) {
    const c = classifySportsBroadcast({
      publisherName: b.publisher_name,
      publisherDomain: b.publisher_domain,
      broadcastType: b.broadcast_type,
      playbackKind: b.playback_kind,
      isOfficial: b.is_official,
      verificationStatus: b.verification_status,
      validationStatus: b.validation_status,
      validationExpiresAt: b.validation_expires_at,
      metadata: (b.metadata || {}) as Record<string, unknown>,
      quarantinedAt: b.quarantined_at,
      now,
    });
    if (
      c.classification !== "rejected" &&
      c.classification !== "generic_sports_channel" &&
      c.classification !== "unverified_channel_mapping"
    ) {
      continue;
    }
    processed += 1;
    notes.push(`${b.id}:${c.classification}`);
    if (ctx.dryRun !== false) continue;
    const { error: upErr } = await supabaseAdmin
      .from("sports_broadcasts")
      .update({
        quarantined_at: now.toISOString(),
        is_official: false,
        verification_status: "failed",
        validation_status: "blocked",
        availability_status: "quarantined",
        metadata: {
          ...((b.metadata as object) || {}),
          phase1_quarantine_at: now.toISOString(),
          phase1_quarantine_class: c.classification,
          phase1_quarantine_reasons: c.reasons,
        },
        updated_at: now.toISOString(),
      })
      .eq("id", b.id)
      .is("quarantined_at", null);
    if (upErr) errors.push(upErr.message);
  }

  return {
    workerKey: "sports-quarantine-recovery",
    startedAt,
    finishedAt: new Date().toISOString(),
    status: errors.length ? "failed" : "completed",
    processed,
    errors,
    notes: [
      ...notes.slice(0, 20),
      ctx.dryRun === false ? "apply=true" : "dryRun=true",
    ],
  };
}
