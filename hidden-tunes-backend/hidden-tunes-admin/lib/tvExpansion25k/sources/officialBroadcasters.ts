import { createIptvOrgCategoryAdapter } from "@/lib/tvExpansion25k/sources/shared/iptvOrgCategoryFactory";

export const officialBroadcastersAdapter = createIptvOrgCategoryAdapter({
  id: "official-broadcasters",
  label: "Official broadcasters",
  categories: ["General", "Entertainment", "Public"],
  legalBasis:
    "iptv-org indexed streams linked to identified public broadcasters in general, entertainment, and public categories.",
});
