import { createIptvOrgCategoryAdapter } from "@/lib/tvExpansion25k/sources/shared/iptvOrgCategoryFactory";

export const governmentTvAdapter = createIptvOrgCategoryAdapter({
  id: "government-tv",
  label: "Government television",
  categories: ["Public", "Legislative"],
  legalBasis: "iptv-org indexed government and public service television streams.",
});
