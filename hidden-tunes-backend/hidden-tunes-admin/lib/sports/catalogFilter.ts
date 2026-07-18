/**
 * Exclude test / placeholder Sports catalog rows from public browse responses.
 */

const PLACEHOLDER_HOST_RE =
  /(?:^|\.)example\.com$|(?:^|\.)example\.org$|(?:^|\.)test$|(?:^|\.)localhost$/i;

const TEST_SOURCE_MARKERS = [
  "sports_private_pilot",
  "phase2a_test",
  "pilot_seed",
  "demo_fixture",
  "synthetic",
];

export function isPlaceholderSportsUrl(url: string | null | undefined): boolean {
  const raw = String(url || "").trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return PLACEHOLDER_HOST_RE.test(host);
  } catch {
    return /example\.com|example\.org/i.test(raw);
  }
}

export function isTestSportsCompetition(input: {
  name?: string | null;
  slug?: string | null;
}): boolean {
  const name = String(input.name || "");
  const slug = String(input.slug || "").toLowerCase();
  if (/\(test\)/i.test(name)) return true;
  if (slug.startsWith("pilot-")) return true;
  if (slug.includes("-test") || slug.endsWith("-test")) return true;
  return false;
}

export function isTestOrPlaceholderSportsFixture(input: {
  title?: string | null;
  metadata?: Record<string, unknown> | null;
  competitionName?: string | null;
  competitionSlug?: string | null;
}): boolean {
  if (
    isTestSportsCompetition({
      name: input.competitionName,
      slug: input.competitionSlug,
    })
  ) {
    return true;
  }

  const title = String(input.title || "");
  if (/\(test\)/i.test(title)) return true;

  const meta = input.metadata || {};
  const source = String(meta.source || meta.seed || meta.import_source || "")
    .trim()
    .toLowerCase();
  if (TEST_SOURCE_MARKERS.some((m) => source.includes(m))) return true;
  if (meta.test === true || meta.is_test === true || meta.demo === true) {
    return true;
  }

  const officialUrl = String(
    meta.official_url || meta.officialUrl || meta.external_url || ""
  );
  if (isPlaceholderSportsUrl(officialUrl)) return true;

  return false;
}

/** ZZ is an internal unknown-country fallback — never a public country hub. */
export function isPublicSportsCountryCode(code: string | null | undefined): boolean {
  const normalized = String(code || "")
    .trim()
    .toUpperCase();
  if (!normalized) return false;
  if (normalized === "ZZ" || normalized === "XX" || normalized === "AA") {
    return false;
  }
  return /^[A-Z]{2}$/.test(normalized);
}
