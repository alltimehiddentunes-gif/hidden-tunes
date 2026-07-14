import { createIptvOrgCategoryAdapter } from "@/lib/tvExpansion25k/sources/shared/iptvOrgCategoryFactory";

export const publicBroadcastersAdapter = createIptvOrgCategoryAdapter({
  id: "public-broadcasters",
  label: "Public broadcasters",
  categories: ["Public", "General"],
  legalBasis: "iptv-org indexed public broadcaster streams.",
});
