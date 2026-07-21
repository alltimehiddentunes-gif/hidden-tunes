import type { TvPublicVideo } from "@/lib/tvCatalog";

/** Verified results first, then discovery, bounded to page limit. */
export function mergeTvSearchResultsVerifiedFirst(
  verified: TvPublicVideo[],
  discovery: TvPublicVideo[],
  limit: number
) {
  const merged: TvPublicVideo[] = [];
  for (const row of verified) {
    if (merged.length >= limit) break;
    merged.push(row);
  }
  for (const row of discovery) {
    if (merged.length >= limit) break;
    merged.push(row);
  }
  return merged;
}
