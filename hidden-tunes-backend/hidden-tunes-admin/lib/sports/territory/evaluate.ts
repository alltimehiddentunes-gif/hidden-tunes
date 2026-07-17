import { REGION_UNAVAILABLE_MESSAGE } from "../constants";
import type {
  SportsTerritoryAvailability,
  SportsTerritoryRule,
} from "../types";

export type TerritoryEvaluationResult = {
  ok: boolean;
  code?:
    | "GEO_BLOCKED"
    | "UNAVAILABLE"
    | "EXTERNAL_ONLY"
    | "SUBSCRIPTION_REQUIRED"
    | "REGISTRATION_REQUIRED"
    | "METADATA_ONLY";
  availability: SportsTerritoryAvailability | "unavailable";
  accessType: string;
  message: string;
  allowNative: boolean;
  allowEmbedded: boolean;
  allowExternal: boolean;
};

/**
 * Country resolution priority is handled by parseSportsCountry.
 * This evaluates territory rules for a resolved country.
 */
export function evaluateSportsTerritory(input: {
  country: string;
  rules: SportsTerritoryRule[];
  territoryMode?: "allowlist" | "blocklist" | "worldwide_unproven";
}): TerritoryEvaluationResult {
  const country = String(input.country || "").toUpperCase();
  const mode = input.territoryMode || "allowlist";
  const rule = input.rules.find(
    (r) => String(r.country_code).toUpperCase() === country
  );

  if (mode === "worldwide_unproven") {
    // Never claim global availability without proof.
    return {
      ok: false,
      code: "UNAVAILABLE",
      availability: "unavailable",
      accessType: "none",
      message: REGION_UNAVAILABLE_MESSAGE,
      allowNative: false,
      allowEmbedded: false,
      allowExternal: false,
    };
  }

  if (mode === "blocklist") {
    if (rule && rule.availability === "geo_blocked") {
      return blocked("GEO_BLOCKED", "geo_blocked", rule.access_type);
    }
    if (!rule) {
      return {
        ok: true,
        availability: "available",
        accessType: "free",
        message: "Territory permitted (blocklist miss).",
        allowNative: true,
        allowEmbedded: true,
        allowExternal: true,
      };
    }
  }

  if (!rule) {
    return {
      ok: false,
      code: "UNAVAILABLE",
      availability: "unavailable",
      accessType: "none",
      message: REGION_UNAVAILABLE_MESSAGE,
      allowNative: false,
      allowEmbedded: false,
      allowExternal: false,
    };
  }

  switch (rule.availability) {
    case "available":
      return {
        ok: true,
        availability: "available",
        accessType: rule.access_type,
        message: "Available in your region.",
        allowNative: true,
        allowEmbedded: true,
        allowExternal: true,
      };
    case "external_only":
      return {
        ok: true,
        code: "EXTERNAL_ONLY",
        availability: "external_only",
        accessType: rule.access_type || "external",
        message: "Watch via the official external broadcaster in your region.",
        allowNative: false,
        allowEmbedded: false,
        allowExternal: true,
      };
    case "subscription_only":
      return {
        ok: false,
        code: "SUBSCRIPTION_REQUIRED",
        availability: "subscription_only",
        accessType: "subscription",
        message: "A subscription is required in your region.",
        allowNative: false,
        allowEmbedded: false,
        allowExternal: true,
      };
    case "registration_required":
      return {
        ok: false,
        code: "REGISTRATION_REQUIRED",
        availability: "registration_required",
        accessType: "registration",
        message: "Registration is required in your region.",
        allowNative: false,
        allowEmbedded: false,
        allowExternal: true,
      };
    case "metadata_only":
      return {
        ok: false,
        code: "METADATA_ONLY",
        availability: "metadata_only",
        accessType: "none",
        message: REGION_UNAVAILABLE_MESSAGE,
        allowNative: false,
        allowEmbedded: false,
        allowExternal: false,
      };
    case "geo_blocked":
      return blocked("GEO_BLOCKED", "geo_blocked", rule.access_type);
    case "unavailable":
    default:
      return blocked("UNAVAILABLE", "unavailable", rule.access_type);
  }
}

function blocked(
  code: TerritoryEvaluationResult["code"],
  availability: SportsTerritoryAvailability,
  accessType: string
): TerritoryEvaluationResult {
  return {
    ok: false,
    code,
    availability,
    accessType: accessType || "none",
    message: REGION_UNAVAILABLE_MESSAGE,
    allowNative: false,
    allowEmbedded: false,
    allowExternal: false,
  };
}
