import { createIptvOrgCategoryAdapter } from "@/lib/tvExpansion25k/sources/shared/iptvOrgCategoryFactory";

export const culturalBroadcastersAdapter = createIptvOrgCategoryAdapter({
  id: "cultural-broadcasters",
  label: "Cultural broadcasters",
  categories: ["Culture", "Documentary", "Classic"],
  legalBasis: "iptv-org indexed cultural and documentary broadcaster streams.",
});
