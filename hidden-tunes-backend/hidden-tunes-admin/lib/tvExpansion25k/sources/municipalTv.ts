import { createIptvOrgCategoryAdapter } from "@/lib/tvExpansion25k/sources/shared/iptvOrgCategoryFactory";

export const municipalTvAdapter = createIptvOrgCategoryAdapter({
  id: "municipal-tv",
  label: "Municipal television",
  categories: ["Local", "General"],
  legalBasis: "iptv-org indexed municipal and local government broadcaster streams.",
});
