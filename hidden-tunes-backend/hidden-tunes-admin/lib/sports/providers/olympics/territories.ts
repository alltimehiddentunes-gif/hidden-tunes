import type { TerritoryRule } from "../types";

/**
 * Olympics / YouTube territory model for Phase 2A.
 * YouTube enforces geo at runtime — we do not invent country allowlists.
 */
export function getOlympicsTerritoryRules(): TerritoryRule[] {
  // Empty allowlist + PROVIDER_RUNTIME_CHECK semantics in importer/resolver.
  return [];
}

export type OlympicsTerritoryMode =
  | "WORLDWIDE"
  | "ALLOWLIST"
  | "DENYLIST"
  | "PROVIDER_RUNTIME_CHECK"
  | "UNKNOWN";

export function getOlympicsTerritoryMode(): OlympicsTerritoryMode {
  return "PROVIDER_RUNTIME_CHECK";
}

export function evaluateOlympicsTerritoryForBrowse(input: {
  country: string;
  mode?: OlympicsTerritoryMode;
}): {
  metadataVisible: boolean;
  playableEligible: boolean;
  reason: string;
} {
  const mode = input.mode || getOlympicsTerritoryMode();
  const country = String(input.country || "").toUpperCase();

  if (mode === "PROVIDER_RUNTIME_CHECK") {
    // Metadata may browse; playback eligibility deferred to YouTube embed runtime.
    // Unknown country: still allow metadata, do not claim guaranteed play.
    if (!/^[A-Z]{2}$/.test(country) || country === "ZZ") {
      return {
        metadataVisible: true,
        playableEligible: true,
        reason:
          "Provider runtime geo check — unknown/test country; embed may still fail at YouTube.",
      };
    }
    return {
      metadataVisible: true,
      playableEligible: true,
      reason: "Provider runtime geo check — YouTube enforces territory at playback.",
    };
  }

  if (mode === "WORLDWIDE") {
    return {
      metadataVisible: true,
      playableEligible: true,
      reason: "Worldwide",
    };
  }

  return {
    metadataVisible: false,
    playableEligible: false,
    reason: "Territory mode unknown — conservative hide.",
  };
}
