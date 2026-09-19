import { classifyLicenseName } from "./rightsPolicy";
import type { RightsLayerInput } from "./types";
export type RecordingRightsQualification = { eligible: boolean; reason: string };
export function qualifyRecordingRights(input: RightsLayerInput): RecordingRightsQualification {
  if (!input.evidencePresent) return { eligible: false, reason: "Recording rights evidence is missing." };
  if (input.commercialUseAllowed !== true || input.redistributionAllowed !== true) return { eligible: false, reason: "Recording licence does not explicitly permit commercial redistribution." };
  const classification = classifyLicenseName(input.licenseName);
  if (!["PUBLIC_DOMAIN", "CC0", "CC_BY"].includes(classification)) return { eligible: false, reason: `Recording licence is unsupported or unresolved: ${classification}.` };
  return { eligible: true, reason: "Recording licence is eligible; composition rights remain a separate gate." };
}