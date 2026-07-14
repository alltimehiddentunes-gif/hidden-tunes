import { createIptvOrgCategoryAdapter } from "@/lib/tvExpansion25k/sources/shared/iptvOrgCategoryFactory";

export const regionalTvAdapter = createIptvOrgCategoryAdapter({
  id: "regional-tv",
  label: "Regional television",
  categories: ["Local", "General"],
  legalBasis: "iptv-org indexed regional and local broadcaster streams.",
});
