import fs from "node:fs";
import path from "node:path";

import { TV_EXPANSION_CHECKPOINT_DIR } from "@/lib/tvExpansion25k/constants";

const FINGERPRINT_FILE = "rejected-fingerprints.json";
const MAX_FINGERPRINTS = 250_000;

function fingerprintPath(adminRoot = process.cwd()) {
  return path.join(adminRoot, TV_EXPANSION_CHECKPOINT_DIR, FINGERPRINT_FILE);
}

function normalizeFingerprint(value: string) {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

export function candidateFingerprint(input: {
  source_key?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  source_url?: string | null;
  title?: string | null;
  country?: string | null;
  region?: string | null;
}) {
  const sourceKey =
    input.source_key ||
    `${input.source_type || ""}:${input.source_id || ""}`.trim();
  const url = normalizeFingerprint(String(input.source_url || ""));
  const titleCountry = `${String(input.title || "")
    .trim()
    .toLowerCase()}::${String(input.country || input.region || "")
    .trim()
    .toLowerCase()}`;
  return `${sourceKey}::${url}::${titleCountry}`;
}

export function loadRejectedFingerprints(adminRoot = process.cwd()) {
  const filePath = fingerprintPath(adminRoot);
  if (!fs.existsSync(filePath)) return new Set<string>();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as string[];
    return new Set(parsed);
  } catch {
    return new Set<string>();
  }
}

export function saveRejectedFingerprints(fingerprints: Set<string>, adminRoot = process.cwd()) {
  const filePath = fingerprintPath(adminRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const values = [...fingerprints];
  const trimmed =
    values.length > MAX_FINGERPRINTS ? values.slice(values.length - MAX_FINGERPRINTS) : values;
  fs.writeFileSync(filePath, `${JSON.stringify(trimmed, null, 2)}\n`, "utf8");
}

export function filterFingerprintRejected<T extends {
  source_key?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  source_url?: string | null;
  title?: string | null;
  country?: string | null;
  region?: string | null;
}>(candidates: T[], adminRoot = process.cwd()) {
  const fingerprints = loadRejectedFingerprints(adminRoot);
  const accepted: T[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    const fp = candidateFingerprint(candidate);
    if (fingerprints.has(fp)) {
      skipped += 1;
      continue;
    }
    accepted.push(candidate);
  }

  return { accepted, skipped, fingerprints };
}

export function recordRejectedFingerprints(
  candidates: Array<{
    source_key?: string | null;
    source_type?: string | null;
    source_id?: string | null;
    source_url?: string | null;
    title?: string | null;
    country?: string | null;
    region?: string | null;
  }>,
  adminRoot = process.cwd()
) {
  const fingerprints = loadRejectedFingerprints(adminRoot);
  for (const candidate of candidates) {
    fingerprints.add(candidateFingerprint(candidate));
  }
  saveRejectedFingerprints(fingerprints, adminRoot);
}
