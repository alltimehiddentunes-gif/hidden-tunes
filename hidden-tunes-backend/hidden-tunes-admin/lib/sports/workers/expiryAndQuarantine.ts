/**
 * Stale-live expiry + unsafe-broadcast quarantine workers.
 * Bounded, dry-run by default when invoked via runSportsWorker unless apply flags set.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveSportsStatusAuthority } from "../status/statusAuthority";
import {
  classifySportsBroadcast,
} from "../broadcasts/classification";
import type { SportsWorkerContext, SportsWorkerReport } from "./index";

export async function runSportsExpiryCleanupWorker(
  ctx: SportsWorkerContext = {}
): Promise<SportsWorkerReport> {
  const startedAt = new Date().toISOString();
  const batchSize = Math.min(100, Math.max(1, ctx.batchSize ?? 25));
  const errors: string[] = [];
  const notes: string[] = [];
  let processed = 0;

  const { data: liveRows, error } = await supabaseAdmin
    .from("sports_fixtures")
    .select("id, status, starts_at, ends_at, metadata, sport_id")
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
  for (const row of liveRows || []) {
    const auth = resolveSportsStatusAuthority({
      fixtureStatus: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      metadata: (row.metadata || {}) as Record<string, unknown>,
      now,
    });
    if (!auth.staleLiveCandidate) continue;
    processed += 1;
    notes.push(`stale_live_candidate:${row.id}`);
    if (ctx.dryRun !== false) {
      // default dry-run
      continue;
    }
    const { error: upErr } = await supabaseAdmin
      .from("sports_fixtures")
      .update({
        status: "completed",
        availability_state: "finished",
        playable: false,
        metadata: {
          ...((row.metadata as object) || {}),
          phase1_stale_live_finalized_at: now.toISOString(),
          phase1_finalization_reason: auth.reason,
        },
        updated_at: now.toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "live");
    if (upErr) errors.push(upErr.message);
  }

  notes.push(ctx.dryRun === false ? "apply=true" : "dryRun=true");

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
