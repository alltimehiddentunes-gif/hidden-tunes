type ArchiveRightsMetadata = {
  licenseurl?: string;
  rights?: string;
  "possible-copyright-status"?: string;
  collections?: string | string[];
};

const ALLOWED_LICENSE_PATTERNS = [
  /publicdomain\/mark/i,
  /public domain/i,
  /creativecommons\.org\/publicdomain/i,
  /creativecommons\.org\/licenses\/publicdomain/i,
  /creativecommons\.org\/licenses\/by/i,
  /creativecommons\.org\/licenses\/zero/i,
];

export type ItemRightsResult = {
  ok: boolean;
  reason: string;
  rights_label: string | null;
  license_url: string | null;
};

function normalizeRightsText(value: unknown) {
  return String(value || "").trim();
}

export function evaluateArchiveRightsMetadata(metadata: {
  licenseurl?: string | null;
  rights?: string | null;
  "possible-copyright-status"?: string | null;
}): ItemRightsResult {
  const licenseUrl = normalizeRightsText(metadata.licenseurl);
  const rights = normalizeRightsText(metadata.rights);
  const copyrightStatus = normalizeRightsText(metadata["possible-copyright-status"]);
  const haystack = `${licenseUrl} ${rights} ${copyrightStatus}`.toLowerCase();

  if (!haystack.trim()) {
    return {
      ok: false,
      reason: "Item-level rights metadata missing.",
      rights_label: null,
      license_url: licenseUrl || null,
    };
  }

  const allowed = ALLOWED_LICENSE_PATTERNS.some((pattern) => pattern.test(haystack));
  if (!allowed) {
    return {
      ok: false,
      reason: `Item-level rights not clearly public domain or compatible CC: ${haystack.slice(0, 180)}`,
      rights_label: rights || copyrightStatus || null,
      license_url: licenseUrl || null,
    };
  }

  return {
    ok: true,
    reason: "Item-level public domain or compatible license confirmed.",
    rights_label: rights || copyrightStatus || "public_domain",
    license_url: licenseUrl || null,
  };
}

export async function verifyArchiveItemRights(
  archiveId: string,
  preloaded?: {
    licenseurl?: string | null;
    rights?: string | null;
    "possible-copyright-status"?: string | null;
  }
): Promise<ItemRightsResult> {
  const hasPreloaded =
    Boolean(normalizeRightsText(preloaded?.licenseurl)) ||
    Boolean(normalizeRightsText(preloaded?.rights)) ||
    Boolean(normalizeRightsText(preloaded?.["possible-copyright-status"]));
  if (hasPreloaded && preloaded) {
    return evaluateArchiveRightsMetadata(preloaded);
  }

  const parentId = String(archiveId || "").split("::")[0];

  try {
    const response = await fetch(
      `https://archive.org/metadata/${encodeURIComponent(parentId)}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      }
    );
    if (!response.ok) {
      return {
        ok: false,
        reason: `Archive metadata unavailable (${response.status}).`,
        rights_label: null,
        license_url: null,
      };
    }

    const payload = (await response.json()) as { metadata?: ArchiveRightsMetadata };
    return evaluateArchiveRightsMetadata(payload.metadata || {});
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Rights verification failed.",
      rights_label: null,
      license_url: null,
    };
  }
}

export function mapCandidateToRegistrySource(sourceKey: string, registryKeys: string[]) {
  if (registryKeys.includes(sourceKey)) return sourceKey;
  if (sourceKey.startsWith("archive:")) {
    if (registryKeys.includes("archive:internet-archive-prelinger-motivation")) {
      return "archive:internet-archive-prelinger-motivation";
    }
    if (registryKeys.includes("archive:internet-archive-opensource-motivation")) {
      return "archive:internet-archive-opensource-motivation";
    }
  }
  return null;
}
