import { createIptvOrgCategoryAdapter } from "@/lib/tvExpansion25k/sources/shared/iptvOrgCategoryFactory";

export const newsBroadcastersAdapter = createIptvOrgCategoryAdapter({
  id: "news-broadcasters",
  label: "News broadcasters",
  categories: ["News"],
  legalBasis: "iptv-org indexed news broadcaster streams.",
});
