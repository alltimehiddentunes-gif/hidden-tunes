import {
  SPORTS_HOME_SECTION_RANK,
  type SportsHomeSection,
  type SportsMatchCard,
} from "../../../types/sports";
export const SPORTS_SECTION_LIMITS = {
  hero: 1,
  horizontal: 16,
  schedule: 40,
  sportGrid: 24,
  competitionGrid: 20,
  searchPage: 40,
} as const;
export function isHomeSectionArray(
  sections: SportsHomeSection[] | Partial<Record<string, unknown[]>> | undefined
): sections is SportsHomeSection[] {
  return Array.isArray(sections);
}
export function sortSportsHomeSections(
  sections: SportsHomeSection[]
): SportsHomeSection[] {
  return [...sections].sort((a, b) => {
    const ra = SPORTS_HOME_SECTION_RANK[a.id] ?? a.rank ?? 999;
    const rb = SPORTS_HOME_SECTION_RANK[b.id] ?? b.rank ?? 999;
    if (ra !== rb) return ra - rb;
    return String(a.id).localeCompare(String(b.id));
  });
}
/** Hide empty sections; keep errored sections for isolated error UI. */
export function omitEmptySportsSections(
  sections: SportsHomeSection[]
): SportsHomeSection[] {
  return sortSportsHomeSections(sections).filter((section) => {
    if (section.error) return true;
    return Array.isArray(section.items) && section.items.length > 0;
  });
}
export function boundSectionItems<T>(
  items: T[] | undefined,
  limit: number = SPORTS_SECTION_LIMITS.horizontal
): T[] {
  if (!Array.isArray(items) || !items.length) return [];
  return items.slice(0, Math.max(1, limit));
}
export function pickSportsHero(
  sections: SportsHomeSection[]
): SportsMatchCard | null {
  const live = sections.find((s) => s.id === "live_now");
  const soon = sections.find((s) => s.id === "starting_soon");
  const featured = sections.find((s) => s.id === "featured");
  for (const section of [live, soon, featured]) {
    const first = section?.items?.[0] as SportsMatchCard | undefined;
    if (first?.id) return first;
  }
  return null;
}
export function sectionItemLimit(sectionId: string): number {
  if (sectionId === "todays_schedule") return SPORTS_SECTION_LIMITS.schedule;
  if (sectionId === "browse_sports") return SPORTS_SECTION_LIMITS.sportGrid;
  if (sectionId === "browse_countries" || sectionId === "popular_competitions") {
    return SPORTS_SECTION_LIMITS.competitionGrid;
  }
  return SPORTS_SECTION_LIMITS.horizontal;
}
export function stableSportsKey(
  sectionId: string,
  item: { id?: string; code?: string } | string,
  index: number
): string {
  if (typeof item === "string") return `${sectionId}:${item}:${index}`;
  const id = String(item.id || item.code || index);
  return `${sectionId}:${id}`;
}
