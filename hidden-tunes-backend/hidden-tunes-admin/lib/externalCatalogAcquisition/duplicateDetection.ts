import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { DuplicateResult, FingerprintResult } from "./qualificationTypes";
const execFileAsync = promisify(execFile);
export type DuplicateCandidate = { sourceItemId: string; artist?: string | null; title?: string | null; sha256?: string | null; fingerprint?: string | null };
export type ExistingDuplicateRecord = DuplicateCandidate & { origin: "staged" | "accepted_external" | "existing_catalog_readonly" };
export function normalizeDuplicateText(value: unknown): string { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
export function metadataKey(candidate: Pick<DuplicateCandidate, "artist" | "title">): string { return `${normalizeDuplicateText(candidate.artist)}::${normalizeDuplicateText(candidate.title)}`; }
export async function calculateAcousticFingerprint(filePath: string, fpcalcPath = process.env.CHROMAPRINT_FPCALC_PATH || ""): Promise<FingerprintResult> {
  if (!fpcalcPath) fpcalcPath = "D:\\HiddenTunes\\Tools\\Chromaprint\\extract\\chromaprint-fpcalc-1.6.1-windows-x86_64\\fpcalc.exe";
  if (!fpcalcPath) return { status: "UNAVAILABLE", fingerprint: null, durationSeconds: null, tool: null, error: "Chromaprint fpcalc path is not configured." };
  const resolved = path.resolve(fpcalcPath);
  if (!/^[dD]:[\\/]/.test(resolved)) return { status: "FAILED", fingerprint: null, durationSeconds: null, tool: resolved, error: "Acoustic fingerprint tool must be on D:." };
  try { await access(resolved); const result = await execFileAsync(resolved, ["-json", filePath], { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 }); const parsed = JSON.parse(result.stdout) as { fingerprint?: unknown; duration?: unknown }; if (typeof parsed.fingerprint !== "string" || !parsed.fingerprint.trim()) throw new Error("fpcalc returned no fingerprint."); return { status: "AVAILABLE", fingerprint: parsed.fingerprint, durationSeconds: typeof parsed.duration === "number" ? parsed.duration : null, tool: resolved, error: null }; } catch (error) { return { status: "FAILED", fingerprint: null, durationSeconds: null, tool: resolved, error: error instanceof Error ? error.message : String(error) }; }
}
export async function loadExistingFingerprintRecords(manifestPath?: string): Promise<ExistingDuplicateRecord[]> { if (!manifestPath) return []; if (!/^[dD]:[\\/]/.test(path.resolve(manifestPath))) throw new Error("Existing duplicate manifest must be on D:."); try { return JSON.parse(await readFile(manifestPath, "utf8")) as ExistingDuplicateRecord[]; } catch { return []; } }
export class DuplicateIndex {
  private readonly records: ExistingDuplicateRecord[];
  constructor(existing: ExistingDuplicateRecord[] = []) { this.records = [...existing]; }
  evaluate(candidate: DuplicateCandidate, fingerprint: FingerprintResult): DuplicateResult {
    const sourceIdentity = `dogmazic:${candidate.sourceItemId}`; const normalizedMetadata = metadataKey(candidate);
    const comparisons = this.records.filter((record) => record.sourceItemId === candidate.sourceItemId || Boolean(candidate.sha256 && record.sha256 === candidate.sha256) || Boolean(fingerprint.fingerprint && record.fingerprint === fingerprint.fingerprint) || metadataKey(record) === normalizedMetadata);
    const result = (verdict: DuplicateResult["verdict"], reasons: string[]): DuplicateResult => ({ verdict, reasons, sourceIdentity, normalizedMetadata, fileHash: candidate.sha256 || null, fingerprint, comparedWith: comparisons.map((item) => `${item.origin}:${item.sourceItemId}`) });
    if (comparisons.some((r) => r.sourceItemId === candidate.sourceItemId)) return result("EXACT_DUPLICATE", ["Source identity already exists."]);
    if (candidate.sha256 && comparisons.some((r) => r.sha256 === candidate.sha256)) return result("EXACT_DUPLICATE", ["SHA-256 file hash matches an existing record."]);
    if (fingerprint.status === "AVAILABLE" && fingerprint.fingerprint && comparisons.some((r) => r.fingerprint === fingerprint.fingerprint)) return result("LIKELY_AUDIO_DUPLICATE", ["Chromaprint acoustic fingerprint matches an existing record."]);
    if (comparisons.some((r) => metadataKey(r) === normalizedMetadata)) return result("METADATA_COLLISION", ["Normalized artist/title collides with an existing record."]);
    if (fingerprint.status !== "AVAILABLE") return result("REVIEW_REQUIRED", [fingerprint.error || "Acoustic fingerprint was not available."]);
    const unique = result("UNIQUE", []); this.records.push({ ...candidate, fingerprint: fingerprint.fingerprint, origin: "staged" }); return unique;
  }
}