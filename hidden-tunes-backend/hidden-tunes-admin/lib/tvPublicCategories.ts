export type TvPublicCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  parent_slug: string | null;
};

export const TV_PUBLIC_CATEGORY_NAMES = [
  "Featured",
  "Trending",
  "News",
  "Sports",
  "Movies",
  "Entertainment",
  "Kids",
  "Documentary",
  "Music TV",
  "Afrobeats",
  "Amapiano",
  "Hip Hop",
  "R&B",
  "Pop",
  "Rock",
  "Country",
  "Jazz",
  "Classical",
  "Reggae",
  "Latin",
  "EDM",
  "Worship Music",
  "Live Sessions",
  "Artist TV",
  "Festival Streams",
  "Lifestyle",
  "Education",
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

export function buildTvPublicCategoryCatalog(): TvPublicCategory[] {
  const categories: TvPublicCategory[] = [];
  let sortOrder = 100;

  for (const name of TV_PUBLIC_CATEGORY_NAMES) {
    categories.push({
      id: slugify(name),
      name,
      slug: slugify(name),
      description: null,
      sort_order: sortOrder,
      parent_slug: null,
    });
    sortOrder += 10;
  }

  const motivationParent = slugify("Motivation");
  let motivationSort = 1800;

  for (const name of TV_MOTIVATION_SUBCATEGORY_NAMES) {
    categories.push({
      id: slugify(name),
      name,
      slug: slugify(name),
      description: "Motivation",
      sort_order: motivationSort,
      parent_slug: motivationParent,
    });
    motivationSort += 10;
  }

  return categories;
}

export function buildPublicTvCategories(row: Record<string, unknown>) {
  const values = new Set<string>();

  for (const key of ["category", "genre", "mood", "format"] as const) {
    const value = String(row[key] || "").trim();
    if (value) values.add(value);
  }

  if (Array.isArray(row.tags)) {
    for (const tag of row.tags) {
      const value = String(tag || "").trim();
      if (value) values.add(value);
    }
  }

  return [...values];
}
