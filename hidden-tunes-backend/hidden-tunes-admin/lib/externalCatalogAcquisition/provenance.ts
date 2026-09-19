import { createHash } from "node:crypto";
import type { ProviderId } from "./types";
export type SourceIdentity = { providerId: ProviderId; sourceItemId: string; sourceUrl: string };
export type EvidenceSnapshot = { evidenceUrl: string; capturedAt: string; content: string; evidenceHash: string };
export type AcquisitionProvenance = { source: SourceIdentity; evidence: EvidenceSnapshot[]; acquiredAt: string };
export function sha256Hex(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
export function createEvidenceSnapshot(input: { evidenceUrl: string; content: string; capturedAt?: string }): EvidenceSnapshot {
  const content = String(input.content); return { evidenceUrl: String(input.evidenceUrl).trim(), capturedAt: input.capturedAt || new Date().toISOString(), content, evidenceHash: sha256Hex(content) };
}
export function createProvenance(input: { source: SourceIdentity; evidence: EvidenceSnapshot[]; acquiredAt?: string }): AcquisitionProvenance {
  if (!input.source.providerId || !input.source.sourceItemId || !input.source.sourceUrl) throw new Error("Stable source identity is required for acquisition provenance.");
  if (input.evidence.length === 0) throw new Error("At least one rights evidence snapshot is required.");
  return { ...input, acquiredAt: input.acquiredAt || new Date().toISOString() };
}

