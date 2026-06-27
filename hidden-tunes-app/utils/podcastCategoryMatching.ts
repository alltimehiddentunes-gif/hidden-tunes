const CATEGORY_ALIASES: Record<string, string[]> = {
  "all-mature": ["mature", "adult", "explicit", "all-mature-podcasts"],
  "relationships-dating": [
    "relationships",
    "relationship",
    "dating",
    "love",
    "romance",
    "intimacy",
    "mature-relationships",
    "modern-relationships",
  ],
  "adult-comedy": ["comedy", "explicit-comedy", "adult-comedy", "humor", "uncensored"],
  "sex-education": [
    "sex",
    "education",
    "sex-education",
    "sexual-health",
    "body",
    "sex education",
  ],
  "confessions-storytelling": [
    "confessions",
    "storytelling",
    "stories",
    "raw-stories",
    "anonymous",
  ],
  "psychology-intimacy": [
    "psychology",
    "therapy",
    "intimacy",
    "mental-health",
    "emotional",
  ],
  "marriage-couples": ["marriage", "couples", "partnership", "wedding"],
  "womens-health": ["women", "womens-health", "female", "body", "wellness"],
  "mens-health": ["men", "mens-health", "male", "manhood"],
  "lgbtq-conversations": ["lgbtq", "queer", "gay", "lesbian", "trans", "pride"],
  "explicit-interviews": [
    "interviews",
    "explicit-interviews",
    "long-form",
    "guests",
  ],
  "after-dark-talk": [
    "after-dark",
    "after dark",
    "late-night",
    "night",
    "talk",
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
