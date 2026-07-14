import { createIptvOrgCategoryAdapter } from "@/lib/tvExpansion25k/sources/shared/iptvOrgCategoryFactory";

export const universityTvAdapter = createIptvOrgCategoryAdapter({
  id: "university-tv",
  label: "University television",
  categories: ["Education"],
  legalBasis: "iptv-org indexed university and educational broadcaster streams.",
});
