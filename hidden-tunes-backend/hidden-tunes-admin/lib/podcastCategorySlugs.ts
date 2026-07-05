/**
 * Frontend category slugs (podcast_categories.slug / route param) mapped to
 * values stored on podcast_shows.primary_category and podcast_shows.categories[].
 */
export const PODCAST_CATEGORY_SLUG_ALIASES: Record<string, readonly string[]> = {
  business: ["business"],
  technology: ["technology"],
  health: ["health"],
  education: ["education"],
  science: ["science"],
  history: ["history"],
  news: ["news"],
  comedy: ["comedy"],
  faith: ["faith"],
  music: ["music"],
  sports: ["sports"],
  "true-crime": ["true-crime", "truecrime"],
  "society-culture": ["society-culture", "society"],
  society: ["society-culture", "society"],
  finance: ["finance", "business"],
};

export function resolvePodcastCategorySlugs(category: string) {
  const raw = String(category || "").trim().toLowerCase();
  if (!raw) return [];

  const aliases = PODCAST_CATEGORY_SLUG_ALIASES[raw];
  if (aliases?.length) {
    return Array.from(new Set(aliases.map((entry) => entry.toLowerCase())));
  }

  return [raw];
}

export function buildShowCategoryOrFilterForSlugs(slugs: string[]) {
  const parts = new Set<string>();

  for (const slug of slugs) {
    const raw = String(slug || "").trim();
    if (!raw) continue;

    const escaped = raw.replace(/[%_]/g, "\\$&");
    const lower = raw.toLowerCase();
    const needsQuotes = /[^a-zA-Z0-9_-]/.test(raw);
    const encoded = needsQuotes
      ? `"${raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
      : raw;

    parts.add(`primary_category.eq.${lower}`);
    parts.add(`primary_category.ilike.%${escaped}%`);
    parts.add(`categories.cs.{${encoded}}`);
    parts.add(`categories.cs.{${lower}}`);
  }

  return Array.from(parts).join(",");
}
