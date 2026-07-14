import { createIptvOrgCategoryAdapter } from "@/lib/tvExpansion25k/sources/shared/iptvOrgCategoryFactory";

export const educationTvAdapter = createIptvOrgCategoryAdapter({
  id: "education-tv",
  label: "Educational television",
  categories: ["Education"],
  legalBasis: "iptv-org indexed educational broadcaster streams.",
});
