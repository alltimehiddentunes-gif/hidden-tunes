import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";

/**
 * Wave 8 — deep global pagination only.
 * Walks obscure Radio Browser orderings for many pages to surface stations
 * missed by tag/country crawls (mostly low-vote / recently-checked).
 */

export function buildRadioExpansionBatch15Queries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  for (const kind of ["lastcheck_asc", "votes_asc", "clicks_asc", "lastchange_asc", "name_order"] as const) {
    queries.push({
      key: `radio_browser:${kind}:wave8-deep`,
      kind,
      value: kind,
      categorySlug: "global",
      priority: 1,
    });
  }

  // Second pass with distinct keys so exhausted wave7/wave6 keys cannot block.
  for (const kind of ["lastcheck", "recent", "clicks"] as const) {
    queries.push({
      key: `radio_browser:${kind}:wave8-deep-b`,
      kind,
      value: kind,
      categorySlug: "global",
      priority: 2,
    });
  }

  return queries;
}
