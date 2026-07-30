/**
 * Canonical TV category membership for public browse/search routes.
 *
 * All category filters must go through this module so routes never diverge
 * between raw equality vs normalized aliases.
 *
 * Membership uses existing truthful metadata only (category, genre, mood,
 * format, tags). Title-keyword assignment is intentionally NOT applied here —
 * that lives in import-time mappers only.
 */

import { TV_PUBLIC_CATEGORY_NAMES } from "@/lib/tvPublicCategories";

export type TvCanonicalCategoryName =
  | (typeof TV_PUBLIC_CATEGORY_NAMES)[number]
  | "Religious"
  | "Faith & Worship"
  | "Music";

/** Quote a PostgREST filter value for safe embedding in `.or(...)`. */
export function quoteTvFilterValue(value: string) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Map a request category label to one canonical browse name.
 * Unknown labels pass through trimmed (backward compatible).
 */
export function resolveTvCanonicalCategory(raw: string): string {
  const cleaned = String(raw || "").trim();
  if (!cleaned) return "";

  const key = cleaned
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const aliases: Record<string, string> = {
    sport: "Sports",
    sports: "Sports",
    "sports tv": "Sports",
    "live sports": "Sports",
    "sports and outdoors": "Sports",
    "sports & outdoors": "Sports",
    deportes: "Sports",
    esportes: "Sports",

    news: "News",
    "news and current affairs": "News",
    "news & current affairs": "News",
    "current affairs": "News",

    kids: "Kids",
    children: "Kids",
    childrens: "Kids",
    "children s": "Kids",
    cartoons: "Kids",
    cartoon: "Kids",

    documentary: "Documentary",
    documentaries: "Documentary",
    docs: "Documentary",

    religion: "Religious",
    religious: "Religious",
    faith: "Faith & Worship",
    "faith and worship": "Faith & Worship",
    "faith & worship": "Faith & Worship",
    worship: "Worship Music",
    "worship music": "Worship Music",

    movie: "Movies",
    movies: "Movies",
    film: "Movies",
    cinema: "Movies",

    entertainment: "Entertainment",
    music: "Music TV",
    "music tv": "Music TV",
    "music television": "Music TV",

    education: "Education",
    lifestyle: "Lifestyle",
    government: "Government",
    motivation: "Motivation",
    "emotional worlds": "Emotional Worlds",
  };

  if (aliases[key]) return aliases[key];

  // Preserve known public catalog casing when the raw label matches ignoring case.
  const known = TV_PUBLIC_CATEGORY_NAMES.find((name) => name.toLowerCase() === key);
  if (known) return known;

  return cleaned;
}

type MembershipPlan = {
  /** Canonical display / request name */
  canonical: string;
  /** category/genre/mood/format ILIKE contains tokens (lowercase preferred) */
  contains: string[];
  /** Exact tag tokens for `tags.cs.{...}` */
  tags: string[];
  /** Extra exact category equals (rare localized labels already reviewed) */
  exactCategories?: string[];
};

/**
 * Build membership tokens for a canonical (or raw) category request.
 * Conservative: only legitimate equivalents, not vague title guesses.
 */
export function planTvCategoryMembership(rawCategory: string): MembershipPlan | null {
  const canonical = resolveTvCanonicalCategory(rawCategory);
  if (!canonical) return null;

  const key = canonical.toLowerCase();

  const plans: Record<string, MembershipPlan> = {
    sports: {
      canonical: "Sports",
      contains: ["sport"],
      tags: ["Sports", "sports", "Sport", "sport", "Deportes", "Esportes"],
      exactCategories: ["Deportes", "Esportes", "Baseball", "Football", "Soccer", "Live Sports"],
    },
    news: {
      canonical: "News",
      contains: ["news"],
      tags: ["News", "news"],
    },
    kids: {
      canonical: "Kids",
      contains: ["kid", "children", "cartoon"],
      tags: ["Kids", "kids", "Children", "children"],
    },
    documentary: {
      canonical: "Documentary",
      contains: ["documentar"],
      tags: ["Documentary", "documentary", "Documentaries"],
    },
    religious: {
      canonical: "Religious",
      contains: ["religio", "faith", "worship", "gospel"],
      tags: ["Religious", "Religion", "Faith", "Worship", "Worship Music", "Faith & Worship"],
    },
    "faith & worship": {
      canonical: "Faith & Worship",
      contains: ["faith", "worship", "gospel", "religio"],
      tags: ["Faith & Worship", "Worship Music", "Worship", "Faith", "Religious", "Religion"],
    },
    "worship music": {
      canonical: "Worship Music",
      contains: ["worship", "gospel", "faith", "religio"],
      tags: ["Worship Music", "Worship", "Faith & Worship", "Faith", "Religious"],
    },
    movies: {
      canonical: "Movies",
      contains: ["movie", "film", "cinema"],
      tags: ["Movies", "movies", "Movie", "Film"],
    },
    entertainment: {
      canonical: "Entertainment",
      contains: ["entertainment"],
      tags: ["Entertainment", "entertainment"],
    },
    "music tv": {
      canonical: "Music TV",
      contains: ["music"],
      tags: ["Music TV", "Music", "music"],
    },
    education: {
      canonical: "Education",
      contains: ["educat"],
      tags: ["Education", "education"],
    },
    lifestyle: {
      canonical: "Lifestyle",
      contains: ["lifestyle"],
      tags: ["Lifestyle", "lifestyle"],
    },
    government: {
      canonical: "Government",
      contains: ["government"],
      tags: ["Government", "government"],
    },
    motivation: {
      canonical: "Motivation",
      contains: ["motivat"],
      tags: ["Motivation", "motivation"],
    },
    "emotional worlds": {
      canonical: "Emotional Worlds",
      contains: ["emotional"],
      tags: ["Emotional Worlds"],
    },
  };

  if (plans[key]) return plans[key];

  // Default: match the requested label as contains + exact tag (legacy behaviour, unified).
  return {
    canonical,
    contains: [canonical],
    tags: [canonical, canonical.toLowerCase()],
  };
}

/**
 * PostgREST `or=(...)` filter: category membership BEFORE pagination.
 * Covers primary category, genre, mood, format, and tags.
 */
export function buildTvCategoryMembershipOrFilter(rawCategory: string): string | null {
  const plan = planTvCategoryMembership(rawCategory);
  if (!plan) return null;

  const parts: string[] = [];

  for (const token of plan.contains) {
    const cleaned = String(token || "").trim();
    if (!cleaned) continue;
    const quoted = quoteTvFilterValue(`%${cleaned}%`);
    parts.push(`category.ilike.${quoted}`);
    parts.push(`genre.ilike.${quoted}`);
    parts.push(`mood.ilike.${quoted}`);
    parts.push(`format.ilike.${quoted}`);
  }

  for (const tag of plan.tags) {
    const cleaned = String(tag || "").trim();
    if (!cleaned) continue;
    parts.push(`tags.cs.{${quoteTvFilterValue(cleaned)}}`);
  }

  for (const exact of plan.exactCategories || []) {
    const cleaned = String(exact || "").trim();
    if (!cleaned) continue;
    parts.push(`category.eq.${quoteTvFilterValue(cleaned)}`);
  }

  // Always include the canonical label itself as an exact-ish contains for tags/category.
  const self = quoteTvFilterValue(`%${plan.canonical}%`);
  parts.push(`category.ilike.${self}`);
  parts.push(`tags.cs.{${quoteTvFilterValue(plan.canonical)}}`);

  // Deduplicate identical clauses
  return [...new Set(parts)].join(",");
}

/** Pure membership test for unit verifiers (mirrors filter intent, not SQL). */
export function tvRowMatchesCanonicalCategory(
  row: {
    category?: string | null;
    genre?: string | null;
    mood?: string | null;
    format?: string | null;
    tags?: unknown;
  },
  rawCategory: string
): boolean {
  const plan = planTvCategoryMembership(rawCategory);
  if (!plan) return false;

  const fields = [row.category, row.genre, row.mood, row.format]
    .map((v) => String(v || "").toLowerCase())
    .filter(Boolean);
  const tags = Array.isArray(row.tags)
    ? row.tags.map((t) => String(t || "").trim()).filter(Boolean)
    : [];
  const tagsLower = tags.map((t) => t.toLowerCase());

  for (const token of plan.contains) {
    const t = token.toLowerCase();
    if (fields.some((f) => f.includes(t))) return true;
  }
  for (const tag of plan.tags) {
    if (tags.includes(tag) || tagsLower.includes(tag.toLowerCase())) return true;
  }
  for (const exact of plan.exactCategories || []) {
    if (String(row.category || "").trim() === exact) return true;
  }
  if (fields.some((f) => f.includes(plan.canonical.toLowerCase()))) return true;
  if (tags.includes(plan.canonical) || tagsLower.includes(plan.canonical.toLowerCase())) {
    return true;
  }
  return false;
}
