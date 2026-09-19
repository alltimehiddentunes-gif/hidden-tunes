import { classifyLicenseName, hasExplicitRedRights, isClearlyRedistributable } from "./rightsPolicy";
import type { RightsEvaluation, RightsEvaluationInput, RightsLayerInput } from "./types";
const layerReason = (layer: RightsLayerInput): string => `${layer.layer} rights classified as ${classifyLicenseName(layer.licenseName)}`;

export function evaluateRights(input: RightsEvaluationInput): RightsEvaluation {
  const layers = [input.recording, input.composition];
  const attributionRequired = layers.some((layer) => layer.attributionRequired === true);
  const attributionText = layers.map((layer) => layer.attributionText).filter(Boolean).join("\n") || null;
  const base = { attributionRequired, attributionText, recording: input.recording, composition: input.composition };
  if (input.conflictingEvidence) return { ...base, bucket: "AMBER", decision: "REVIEW", nextState: "RIGHTS_REVIEW", reason: "Conflicting rights evidence requires manual review." };
  if (layers.some((layer) => hasExplicitRedRights(layer))) return { ...base, bucket: "RED", decision: "BLOCKED", nextState: "RIGHTS_BLOCKED", reason: "Commercial redistribution or rights clearance is explicitly unavailable." };
  if (layers.every(isClearlyRedistributable)) return { ...base, bucket: "GREEN", decision: "APPROVED", nextState: "RIGHTS_APPROVED", reason: layers.map(layerReason).join("; ") };
  const unknownWithoutEvidence = layers.some((layer) => classifyLicenseName(layer.licenseName) === "UNKNOWN" && !layer.evidencePresent);
  return { ...base, bucket: unknownWithoutEvidence ? "RED" : "AMBER", decision: unknownWithoutEvidence ? "BLOCKED" : "REVIEW", nextState: unknownWithoutEvidence ? "RIGHTS_BLOCKED" : "RIGHTS_REVIEW", reason: unknownWithoutEvidence ? "Unknown license without reliable evidence is blocked fail-closed." : "Rights are not clearly compatible with automatic commercial redistribution." };
}

