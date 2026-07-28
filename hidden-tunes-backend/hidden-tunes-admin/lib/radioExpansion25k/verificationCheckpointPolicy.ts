/**
 * Checkpoint skip policy for radio verification jobs.
 *
 * ROOT CAUSE (pre-fix):
 * `verified_station_ids` in the checkpoint means "this job already processed the id",
 * not "the DB row is currently verified/playable". A prior dry-run or interrupted execute
 * could record ids while leaving `playback_status = 'unchecked'`. The old skip rule was:
 *   if (completed.has(id) && !force) skip
 * which permanently skipped still-unchecked stations until --force.
 *
 * CORRECT RULE:
 * - --force never skips
 * - missing checkpoint entry never skips
 * - playback_status === 'unchecked' never skips (must recheck)
 * - quarantined/failed/playable/etc. may skip when already in checkpoint (unless force)
 */

export type VerificationSkipInput = {
  stationId: string;
  playbackStatus: string | null | undefined;
  quarantinedAt?: string | null;
  disabledAt?: string | null;
  completedIds: ReadonlySet<string>;
  force: boolean;
};

export function shouldSkipVerification(input: VerificationSkipInput): boolean {
  if (input.force) return false;
  if (!input.stationId) return false;
  if (!input.completedIds.has(input.stationId)) return false;

  const status = String(input.playbackStatus || "").trim().toLowerCase();

  // Stale checkpoint vs live DB: unchecked must always be rechecked.
  if (!status || status === "unchecked") return false;

  // Settled outcomes may be skipped on resume unless force.
  return true;
}

export function parseVerificationCheckpoint(raw: unknown): {
  ok: boolean;
  verified_station_ids: string[];
  results: Record<string, string>;
  reason?: string;
} {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, verified_station_ids: [], results: {}, reason: "malformed_checkpoint_not_object" };
  }
  const obj = raw as Record<string, unknown>;
  const idsRaw = obj.verified_station_ids;
  if (idsRaw != null && !Array.isArray(idsRaw)) {
    return { ok: false, verified_station_ids: [], results: {}, reason: "malformed_verified_station_ids" };
  }
  const verified_station_ids = Array.isArray(idsRaw)
    ? idsRaw.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const resultsRaw = obj.results;
  const results: Record<string, string> = {};
  if (resultsRaw && typeof resultsRaw === "object" && !Array.isArray(resultsRaw)) {
    for (const [key, value] of Object.entries(resultsRaw as Record<string, unknown>)) {
      results[String(key)] = String(value ?? "");
    }
  }
  return { ok: true, verified_station_ids, results };
}
