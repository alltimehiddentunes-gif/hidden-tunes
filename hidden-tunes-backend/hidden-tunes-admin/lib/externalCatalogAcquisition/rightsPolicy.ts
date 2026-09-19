const normalize = (value?: string | null): string => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const RED_TOKENS = ["cc by-nc", "non-commercial", "non commercial", "personal use", "educational use only", "all rights reserved", "no redistribution", "no-redistribution"];
const AMBER_TOKENS = ["cc by-sa", "cc by-nd", "free art license", "gnu art", "gpl", "jurisdiction", "unusual open"];

export function classifyLicenseName(licenseName?: string | null): "PUBLIC_DOMAIN" | "CC0" | "CC_BY" | "AMBER" | "RED" | "UNKNOWN" {
  const value = normalize(licenseName); if (!value) return "UNKNOWN";
  if (RED_TOKENS.some((token) => value.includes(token))) return "RED";
  if (AMBER_TOKENS.some((token) => value.includes(token))) return "AMBER";
  if (value.includes("cc0") || value.includes("creative commons zero") || value.includes("creative commons 0")) return "CC0";
  if (value === "public domain" || value === "domaine public" || value.includes("public-domain")) return "PUBLIC_DOMAIN";
  if (value === "cc by" || value.startsWith("cc by ") || value.includes("cc-by") || value.includes("creative commons attribution") || value.startsWith("creative commons - by ")) return "CC_BY";
  return "UNKNOWN";
}
export function isClearlyRedistributable(layer: { licenseName?: string | null; commercialUseAllowed?: boolean | null; redistributionAllowed?: boolean | null; evidencePresent: boolean; jurisdiction?: string | null }): boolean {
  const classification = classifyLicenseName(layer.licenseName);
  if (!layer.evidencePresent || layer.commercialUseAllowed !== true || layer.redistributionAllowed !== true) return false;
  if (classification === "PUBLIC_DOMAIN" && !layer.jurisdiction) return false;
  return classification === "PUBLIC_DOMAIN" || classification === "CC0" || classification === "CC_BY";
}
export function hasExplicitRedRights(layer: { licenseName?: string | null; commercialUseAllowed?: boolean | null; redistributionAllowed?: boolean | null }): boolean {
  const classification = classifyLicenseName(layer.licenseName);
  return classification === "RED" || layer.commercialUseAllowed === false || layer.redistributionAllowed === false;
}
