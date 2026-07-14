import { createIptvOrgCategoryAdapter } from "@/lib/tvExpansion25k/sources/shared/iptvOrgCategoryFactory";

export const musicTvAdapter = createIptvOrgCategoryAdapter({
  id: "music-tv",
  label: "Music television",
  categories: ["Music"],
  legalBasis: "iptv-org indexed music television streams.",
});
