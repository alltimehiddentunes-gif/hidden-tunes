import { compositionRightsIsGreen } from "./compositionRightsResolver";
import type { AudioQualityResult, CompositionRightsResult, DuplicateResult, FinalQualificationVerdict, TaxonomyResult } from "./qualificationTypes";
import type { RightsEvaluation, RightsLayerInput } from "./types";
export function decideQualification(input: { recordingRights: { eligible: boolean }; rightsEvaluation: RightsEvaluation; compositionRights: CompositionRightsResult; downloadStatus: "DOWNLOAD_PASS" | "DOWNLOAD_FAIL"; quality: AudioQualityResult; duplicate: DuplicateResult; taxonomy: TaxonomyResult }): { verdict: FinalQualificationVerdict; reasons: string[] } {
  const recording = input.rightsEvaluation.recording as RightsLayerInput;
  if (!input.recordingRights.eligible) return { verdict: "RED / RIGHTS_REJECTED", reasons: ["Recording rights gate failed."] };
  if (input.rightsEvaluation.bucket === "RED") return { verdict: "RED / UNSUPPORTED_LICENSE", reasons: ["Recording licence is explicitly unsupported or prohibited."] };
  if (["REJECTED", "CONFLICT"].includes(input.compositionRights.status)) return { verdict: "RED / RIGHTS_REJECTED", reasons: [input.compositionRights.reason] };
  if (input.downloadStatus === "DOWNLOAD_FAIL") return { verdict: "RED / MEDIA_INVALID", reasons: ["Download or actual audio-container validation failed."] };
  if (input.quality.verdict === "AUDIO_FAIL") return { verdict: "AMBER / QUALITY_REVIEW", reasons: input.quality.reasons };
  if (["EXACT_DUPLICATE", "LIKELY_AUDIO_DUPLICATE"].includes(input.duplicate.verdict)) return { verdict: "RED / DUPLICATE", reasons: input.duplicate.reasons };
  if (["METADATA_COLLISION", "REVIEW_REQUIRED"].includes(input.duplicate.verdict)) return { verdict: "AMBER / DUPLICATE_REVIEW", reasons: input.duplicate.reasons };
  if (!compositionRightsIsGreen(input.compositionRights)) return { verdict: "AMBER / RIGHTS_REVIEW", reasons: ["Composition rights are not independently resolved."] };
  if (input.taxonomy.status !== "TAXONOMY_PASS") return { verdict: "AMBER / METADATA_REVIEW", reasons: input.taxonomy.reasons };
  if (input.quality.verdict === "AUDIO_WARN") return { verdict: "AMBER / QUALITY_REVIEW", reasons: input.quality.reasons };
  return { verdict: "GREEN / INGEST_ELIGIBLE", reasons: recording.attributionRequired ? ["Recording attribution must be retained."] : [] };
}