/**
 * Canonical Sports slug normalization for route params and API filters.
 */
export function normalizeSportsSlug(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** ISO country codes used by the private pilot (and browse UI). */
export function normalizeSportsCountryCode(
  value: string | null | undefined
): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
}
