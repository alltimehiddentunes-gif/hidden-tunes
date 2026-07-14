import { createIptvOrgCategoryAdapter } from "@/lib/tvExpansion25k/sources/shared/iptvOrgCategoryFactory";

export const officialFastProvidersAdapter = createIptvOrgCategoryAdapter({
  id: "official-fast-providers",
  label: "Official FAST providers",
  categories: ["Entertainment", "Series", "Movies"],
  legalBasis:
    "iptv-org indexed free ad-supported style public streams from identified broadcaster sources.",
});
