import { randomUUID } from "node:crypto";

import { hashRightsValue } from "@/lib/rights/filterSchema";
import type { RightsBulkAction } from "@/lib/rights/types";

const ACTION_TYPES = new Set([
  "set_rights_status", "set_platform", "set_provider", "attach_license",
  "set_territories", "set_expiry", "assign_review", "add_note",
]);

export function parseBulkAction(value: unknown): RightsBulkAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Bulk action must be an object.");
  const action = value as Record<string, unknown>;
  if (typeof action.type !== "string" || !ACTION_TYPES.has(action.type)) throw new Error("Unsupported rights action.");
  switch (action.type) {
    case "set_rights_status":
      if (!["green", "amber", "red", "unknown"].includes(String(action.status))) throw new Error("Invalid rights status.");
      return { type: action.type, status: action.status as RightsBulkAction & never } as RightsBulkAction;
    case "set_platform":
      if (!["ios", "android", "web", "windows", "macos", "linux"].includes(String(action.platform)) || typeof action.enabled !== "boolean") {
        throw new Error("Invalid platform action.");
      }
      return { type: action.type, platform: action.platform, enabled: action.enabled } as RightsBulkAction;
    case "set_provider":
      if (typeof action.providerId !== "string" || !action.providerId) throw new Error("Provider id required.");
      return { type: action.type, providerId: action.providerId };
    case "attach_license":
      if (typeof action.licenseId !== "string" || !action.licenseId) throw new Error("License id required.");
      return { type: action.type, licenseId: action.licenseId };
    case "set_territories":
      if (!Array.isArray(action.territories) || typeof action.worldwide !== "boolean") throw new Error("Invalid territories action.");
      return { type: action.type, territories: action.territories.map(String), worldwide: action.worldwide };
    case "set_expiry":
      if (action.expiresAt !== null && (typeof action.expiresAt !== "string" || Number.isNaN(Date.parse(action.expiresAt)))) throw new Error("Invalid expiry.");
      return { type: action.type, expiresAt: action.expiresAt as string | null };
    case "assign_review":
      if (action.assigneeId !== null && typeof action.assigneeId !== "string") throw new Error("Invalid assignee.");
      return { type: action.type, assigneeId: action.assigneeId as string | null };
    case "add_note":
      if (typeof action.note !== "string" || action.note.trim().length < 1 || action.note.length > 2000) throw new Error("Invalid note.");
      return { type: action.type, note: action.note.trim() };
    default:
      throw new Error("Unsupported rights action.");
  }
}

export function normalizeIdempotencyKey(value: unknown) {
  if (typeof value !== "string" || value.trim().length < 8 || value.length > 200) {
    throw new Error("Idempotency key must be 8-200 characters.");
  }
  return value.trim();
}

export function buildQueuedJob(input: {
  actorId: string;
  actorEmail?: string | null;
  snapshotId: string;
  kind: "dry_run" | "execute" | "rollback" | "export" | "reconcile";
  action: RightsBulkAction;
  idempotencyKey: string;
  expectedCount: number;
  reason: string;
  dryRunHash?: string;
}) {
  const actionHash = hashRightsValue(input.action);
  return {
    id: randomUUID(),
    actor_id: input.actorId,
    actor_email: input.actorEmail ?? null,
    snapshot_id: input.snapshotId,
    job_kind: input.kind,
    status: input.kind === "rollback" ? "rollback_queued" : "queued",
    action_payload: input.action,
    action_hash: actionHash,
    idempotency_key: normalizeIdempotencyKey(input.idempotencyKey),
    dry_run_hash: input.dryRunHash ?? null,
    expected_count: input.expectedCount,
    reason: input.reason.trim(),
  };
}

export function createConfirmationHash(input: {
  actorId: string;
  snapshotId: string;
  filterHash: string;
  actionHash: string;
  catalogWatermark: string;
  policyRevision: number;
}) {
  return hashRightsValue(input);
}

