import { createIptvOrgCategoryAdapter } from "@/lib/tvExpansion25k/sources/shared/iptvOrgCategoryFactory";

export const parliamentaryTvAdapter = createIptvOrgCategoryAdapter({
  id: "parliamentary-tv",
  label: "Parliamentary television",
  categories: ["Legislative"],
  legalBasis: "iptv-org indexed parliamentary and legislative television streams.",
});
