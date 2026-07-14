import { createIptvOrgCategoryAdapter } from "@/lib/tvExpansion25k/sources/shared/iptvOrgCategoryFactory";

export const communityTvAdapter = createIptvOrgCategoryAdapter({
  id: "community-tv",
  label: "Community television",
  categories: ["Local"],
  legalBasis: "iptv-org indexed community and local broadcaster streams.",
});
