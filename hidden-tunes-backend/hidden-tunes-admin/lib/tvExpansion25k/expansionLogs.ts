import fs from "node:fs";
import path from "node:path";

import { TV_EXPANSION_CHECKPOINT_DIR } from "@/lib/tvExpansion25k/constants";
import { candidateFingerprint } from "@/lib/tvExpansion25k/sources/shared/fingerprintCache";

export type RejectionReason =
  | "duplicate"
  | "dead"
  | "unsupported_protocol"
  | "unsupported_drm"
  | "private_network"
  | "invalid_manifest"
  | "expired_event"
  | "illegal_or_unverifiable_source"
  | "authentication_required"
  | "placeholder"
  | "permanent_geoblock"
  | "pre_probe_rejected"
  | "fingerprint_cached"
  | "catalog_duplicate"
  | "probe_failed"
  | "database_conflict"
  | "temporary_failure";

export function appendRejectedCandidateLog(
  entry: {
    at?: string;
    source: string;
    reason: RejectionReason;
    candidate: {
      source_key?: string | null;
      source_type?: string | null;
      source_id?: string | null;
      source_url?: string | null;
      title?: string | null;
      country?: string | null;
      region?: string | null;
    };
  },
  adminRoot = process.cwd()
) {
  const logPath = path.join(adminRoot, TV_EXPANSION_CHECKPOINT_DIR, "rejected-candidates.jsonl");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(
    logPath,
    `${JSON.stringify({
      at: entry.at || new Date().toISOString(),
      source: entry.source,
      reason: entry.reason,
      fingerprint: candidateFingerprint(entry.candidate),
      title: entry.candidate.title || null,
      source_key: entry.candidate.source_key || null,
      source_url: entry.candidate.source_url || null,
    })}\n`,
    "utf8"
  );
}

export type SourceYieldSummary = {
  source: string;
  candidates: number;
  probePasses: number;
  imports: number;
  rejects: number;
  batches: number;
  lastError: string | null;
  exhausted: boolean;
};

export function loadSourceSummary(adminRoot = process.cwd()) {
  const filePath = path.join(adminRoot, TV_EXPANSION_CHECKPOINT_DIR, "source-summary.json");
  if (!fs.existsSync(filePath)) return {} as Record<string, SourceYieldSummary>;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, SourceYieldSummary>;
  } catch {
    return {};
  }
}

export function updateSourceSummary(
  updates: Record<
    string,
    {
      candidates?: number;
      probePasses?: number;
      imports?: number;
      rejects?: number;
      lastError?: string | null;
      exhausted?: boolean;
    }
  >,
  adminRoot = process.cwd()
) {
  const filePath = path.join(adminRoot, TV_EXPANSION_CHECKPOINT_DIR, "source-summary.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const current = loadSourceSummary(adminRoot);

  for (const [source, patch] of Object.entries(updates)) {
    const row = current[source] || {
      source,
      candidates: 0,
      probePasses: 0,
      imports: 0,
      rejects: 0,
      batches: 0,
      lastError: null,
      exhausted: false,
    };

    row.candidates += patch.candidates || 0;
    row.probePasses += patch.probePasses || 0;
    row.imports += patch.imports || 0;
    row.rejects += patch.rejects || 0;
    row.batches += 1;
    if (patch.lastError !== undefined) row.lastError = patch.lastError;
    if (patch.exhausted !== undefined) row.exhausted = patch.exhausted;
    current[source] = row;
  }

  fs.writeFileSync(filePath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
}
