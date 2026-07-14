import { createIptvOrgCategoryAdapter } from "@/lib/tvExpansion25k/sources/shared/iptvOrgCategoryFactory";

export const sportsBroadcastersAdapter = createIptvOrgCategoryAdapter({
  id: "sports-broadcasters",
  label: "Sports broadcasters",
  categories: ["Sports"],
  legalBasis: "iptv-org indexed free sports broadcaster streams.",
});
