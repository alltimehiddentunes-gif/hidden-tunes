import { getMatureContentSettings } from "./matureContentSettings";

type DiagnosticDetails = Record<string, string | number | boolean | null | undefined>;

function shouldLogVisibleFeatureDiagnostics() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

export function logVisibleFeatureDiagnostic(event: string, details: DiagnosticDetails = {}) {
  if (!shouldLogVisibleFeatureDiagnostics()) return;
  console.log("[HTVisible]", event, {
    at: Date.now(),
    ...details,
  });
}

export function logVisibleFeatureChecklist(details: DiagnosticDetails = {}) {
  if (!shouldLogVisibleFeatureDiagnostics()) return;

  const mature = getMatureContentSettings();

  console.log("[HTVisible] checklist", {
    at: Date.now(),
    matureEnabled: mature.enabled,
    matureHasConsent: mature.hasConsent,
    includeMatureInApi: mature.enabled && mature.hasConsent,
    ...details,
  });
}
