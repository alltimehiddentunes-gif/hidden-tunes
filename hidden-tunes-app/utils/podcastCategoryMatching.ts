const CATEGORY_ALIASES: Record<string, string[]> = {
  "all-mature": ["mature", "adult", "explicit", "all-mature-podcasts"],
  "mature-relationships": [
    "relationships",
    "relationship",
    "dating",
    "love",
    "marriage",
    "modern-relationships",
    "intimacy",
  ],
  "adult-comedy": ["comedy", "explicit-comedy", "adult-comedy", "humor"],
  "sex-education": ["sex", "education", "sex-education", "sexual-health", "body"],
  "explicit-interviews": [
    "interviews",
    "explicit-interviews",
    "raw-stories",
    "confessions",
    "stories",
  ],
};

export function normalizeCategoryId(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function expandCategoryTokens(categoryId: string) {
  const normalized = normalizeCategoryId(categoryId);
  const aliases = CATEGORY_ALIASES[normalized] || [];
  return new Set([normalized, ...aliases.map((entry) => normalizeCategoryId(entry))]);
}

export function seedCategoryMatches(
  seedCategories: string[],
  targetCategoryId: string
) {
  const targetTokens = expandCategoryTokens(targetCategoryId);

  if (targetTokens.has("all-mature")) {
    return seedCategories.length > 0;
  }

  const seedTokens = seedCategories.flatMap((category) => [
    normalizeCategoryId(category),
    ...((CATEGORY_ALIASES[normalizeCategoryId(category)] || []).map((entry) =>
      normalizeCategoryId(entry)
    )),
  ]);

  return seedTokens.some((token) => targetTokens.has(token));
}
