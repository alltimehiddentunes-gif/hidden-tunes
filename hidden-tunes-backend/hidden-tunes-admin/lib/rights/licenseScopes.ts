import type { RightsCatalogItem, RightsLicenseScope, RightsPlatform } from "@/lib/rights/types";

function includesOrUnscoped(values: readonly string[], value: string | null | undefined) {
  return values.length === 0 || Boolean(value && values.includes(value));
}

export function licenseCoversItem(input: {
  scope: RightsLicenseScope;
  item: RightsCatalogItem & { sourceKey?: string | null };
  platform: RightsPlatform;
  territory: string;
  at?: Date;
  capability?: "streaming" | "download" | "commercial";
}) {
  const { scope, item } = input;
  const at = input.at ?? new Date();
  if (scope.status !== "active") return { covered: false, reason: scope.status } as const;
  if (scope.effectiveAt && Date.parse(scope.effectiveAt) > at.getTime()) return { covered: false, reason: "not_effective" } as const;
  if (scope.expiresAt && Date.parse(scope.expiresAt) <= at.getTime()) return { covered: false, reason: "expired" } as const;
  if (!includesOrUnscoped(scope.contentTypes, item.contentType)) return { covered: false, reason: "content_type" } as const;
  if (!includesOrUnscoped(scope.providerIds, item.providerId)) return { covered: false, reason: "provider" } as const;
  if (!includesOrUnscoped(scope.uploaderIds, item.uploaderId)) return { covered: false, reason: "uploader" } as const;
  if (!includesOrUnscoped(scope.sourceKeys, item.sourceKey)) return { covered: false, reason: "source" } as const;
  if (!includesOrUnscoped(scope.importBatches, item.importBatch)) return { covered: false, reason: "batch" } as const;
  if (scope.platforms.length > 0 && !scope.platforms.includes(input.platform)) return { covered: false, reason: "platform" } as const;
  if (!scope.worldwide && !scope.territories.map((value) => value.toUpperCase()).includes(input.territory.toUpperCase())) {
    return { covered: false, reason: "territory" } as const;
  }
  if (input.capability === "download" && !scope.permitsDownload) return { covered: false, reason: "download" } as const;
  if (input.capability === "commercial" && !scope.permitsCommercialUse) return { covered: false, reason: "commercial" } as const;
  if ((input.capability ?? "streaming") === "streaming" && !scope.permitsStreaming) return { covered: false, reason: "streaming" } as const;
  return { covered: true, reason: "covered" } as const;
}

export function expiryWindow(expiresAt: string | null | undefined, now = new Date()) {
  if (!expiresAt) return "no_expiry" as const;
  const days = Math.ceil((Date.parse(expiresAt) - now.getTime()) / 86_400_000);
  if (days <= 0) return "expired" as const;
  if (days <= 7) return "7_days" as const;
  if (days <= 30) return "30_days" as const;
  if (days <= 90) return "90_days" as const;
  return "later" as const;
}

