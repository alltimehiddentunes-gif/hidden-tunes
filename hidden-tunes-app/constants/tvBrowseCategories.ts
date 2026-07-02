export type TvBrowseCategory = {
  id: string;
  name: string;
  slug: string;
  parentSlug: string | null;
};

export const TV_BROWSE_CATEGORY_NAMES = [
  "News",
  "Sports",
  "Movies",
  "Entertainment",
  "Kids",
  "Documentary",
  "Music TV",
  "Faith & Worship",
  "Education",
  "Lifestyle",
  "Government",
  "Africa",
  "Europe",
  "Americas",
  "Asia",
  "Local TV",
  "Motivation",
  "Emotional Worlds",
] as const;

export const TV_MOTIVATION_SUBCATEGORY_NAMES = [
  "Motivational speeches",
  "Self-improvement",
  "Business motivation",
  "Gym motivation",
  "Study motivation",
  "Faith motivation",
  "Success stories",
  "Mindset",
  "Discipline",
  "Focus",
] as const;

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildTvBrowseCategoryFallback(): TvBrowseCategory[] {
  const categories: TvBrowseCategory[] = TV_BROWSE_CATEGORY_NAMES.map(
    (name, index) => ({
      id: slugify(name),
      name,
      slug: slugify(name),
      parentSlug: null,
    })
  );

  const motivationParent = slugify("Motivation");

  for (const name of TV_MOTIVATION_SUBCATEGORY_NAMES) {
    categories.push({
      id: slugify(name),
      name,
      slug: slugify(name),
      parentSlug: motivationParent,
    });
  }

  return categories;
}

export const TV_LANE_FALLBACK_QUERIES: Record<
  string,
  Array<{ category?: string; mood?: string; genre?: string }>
> = {
  "music-tv": [{ category: "Music TV" }, { category: "Music" }],
  motivation: [{ category: "Motivation" }, { mood: "Motivation" }],
};
