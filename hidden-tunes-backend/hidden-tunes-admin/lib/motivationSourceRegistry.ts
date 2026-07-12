import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeCanonicalSourceUrl } from "@/lib/motivationDuplicates";

export type MotivationRegistrySource = {
  source_key: string;
  source_name: string;
  source_type: string;
  source_url: string | null;
  rights_type: string;
  license_url: string | null;
  redistribution_allowed: boolean;
  embedding_allowed: boolean;
  commercial_use_allowed: boolean;
  reviewed: boolean;
  enabled: boolean;
  attribution_required?: boolean;
  attribution_text?: string | null;
};

export type MotivationRegistryValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const DEFAULT_ARCHIVE_DOMAINS = ["archive.org", "www.archive.org"];
const DEFAULT_MEDIA_HOSTS = ["archive.org", "www.archive.org", "cdn.archive.org"];

function hostFromUrl(value: string | null | undefined) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function approvedDomainsForSource(source: MotivationRegistrySource) {
  const host = hostFromUrl(source.source_url);
  return host ? [host, ...DEFAULT_ARCHIVE_DOMAINS] : DEFAULT_ARCHIVE_DOMAINS;
}

function approvedMediaHostsForSource(source: MotivationRegistrySource) {
  return approvedDomainsForSource(source);
}

export async function loadMotivationRegistrySource(sourceKey: string) {
  const { data, error } = await supabaseAdmin
    .from("motivation_source_registry")
    .select(
      "source_key, source_name, source_type, source_url, rights_type, license_url, redistribution_allowed, embedding_allowed, commercial_use_allowed, attribution_required, attribution_text, reviewed, enabled"
    )
    .eq("section", "motivation")
    .eq("source_key", sourceKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MotivationRegistrySource | null) || null;
}

export async function loadEnabledMotivationRegistrySources() {
  const { data, error } = await supabaseAdmin
    .from("motivation_source_registry")
    .select(
      "source_key, source_name, source_type, source_url, rights_type, license_url, redistribution_allowed, embedding_allowed, commercial_use_allowed, attribution_required, attribution_text, reviewed, enabled"
    )
    .eq("section", "motivation")
    .eq("enabled", true)
    .eq("reviewed", true);
  if (error) throw new Error(error.message);
  return (data || []) as MotivationRegistrySource[];
}

export function resolveMotivationRegistrySourceKey(
  sourceKey: string | null | undefined,
  registrySources: MotivationRegistrySource[]
) {
  const cleaned = String(sourceKey || "").trim();
  if (!cleaned) return null;
  const keys = new Set(registrySources.map((row) => row.source_key));
  if (keys.has(cleaned)) return cleaned;
  if (cleaned.startsWith("archive:")) {
    for (const row of registrySources) {
      if (row.source_key.startsWith("archive:")) return row.source_key;
    }
  }
  return null;
}

export function validateMotivationSourceForItem(
  source: MotivationRegistrySource | null,
  item: {
    source_type?: string | null;
    source_url?: string | null;
    media_url?: string | null;
    is_mature?: boolean | null;
  }
): MotivationRegistryValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!source) {
    errors.push("Source registry entry not found.");
    return { ok: false, errors, warnings };
  }
  if (!source.enabled) errors.push("Source registry entry is disabled.");
  if (!source.reviewed) errors.push("Source registry entry is not reviewed.");
  if (!source.rights_type?.trim()) errors.push("Rights basis missing on registry source.");
  if (!source.license_url?.trim() && source.rights_type !== "public_domain") {
    errors.push("Rights reference missing on registry source.");
  }
  if (item.source_type && source.source_type !== item.source_type) {
    errors.push("Item source type is not permitted for this registry source.");
  }

  const approvedDomains = approvedDomainsForSource(source);
  const sourceHost = hostFromUrl(item.source_url);
  if (item.source_url && sourceHost && !approvedDomains.includes(sourceHost)) {
    errors.push("Source URL host is not approved for this registry source.");
  }

  const mediaHost = hostFromUrl(item.media_url);
  const approvedMediaHosts = approvedMediaHostsForSource(source);
  if (item.media_url && mediaHost && !approvedMediaHosts.includes(mediaHost)) {
    errors.push("Media host is not allowed for this registry source.");
  }

  if (item.is_mature === true) {
    warnings.push("Mature item requires explicit maturity policy approval.");
  }

  if (item.source_url && !normalizeCanonicalSourceUrl(item.source_url)) {
    errors.push("Canonical source URL could not be normalized.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

export async function validateAllMotivationRegistrySources() {
  const { data, error } = await supabaseAdmin
    .from("motivation_source_registry")
    .select(
      "source_key, source_name, source_type, source_url, rights_type, license_url, redistribution_allowed, embedding_allowed, commercial_use_allowed, attribution_required, attribution_text, reviewed, enabled"
    )
    .eq("section", "motivation")
    .order("source_key", { ascending: true });
  if (error) throw new Error(error.message);

  const results = [];
  for (const row of (data || []) as MotivationRegistrySource[]) {
    const validation = validateMotivationSourceForItem(row, {
      source_type: row.source_type,
      source_url: row.source_url,
      media_url: row.source_url,
      is_mature: false,
    });
    results.push({
      source_key: row.source_key,
      enabled: row.enabled,
      reviewed: row.reviewed,
      ok: validation.ok,
      errors: validation.errors,
      warnings: validation.warnings,
    });
  }

  return results;
}
