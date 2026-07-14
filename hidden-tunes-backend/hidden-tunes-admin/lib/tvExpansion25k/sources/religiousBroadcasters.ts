import { createIptvOrgCategoryAdapter } from "@/lib/tvExpansion25k/sources/shared/iptvOrgCategoryFactory";

export const religiousBroadcastersAdapter = createIptvOrgCategoryAdapter({
  id: "religious-broadcasters",
  label: "Religious broadcasters",
  categories: ["Religious"],
  legalBasis: "iptv-org indexed religious broadcaster streams.",
});
