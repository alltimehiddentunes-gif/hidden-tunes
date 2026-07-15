import officialGlobalHlsData from "@/lib/tvExpansion25k/sources/data/officialGlobalHls.json";
import { createFixedStreamListAdapter } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";
import type { FixedStreamEntry } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";

/** Fresh cursor over the expanded official broadcaster CDN inventory. */
export const officialGlobalHlsExtendedAdapter = createFixedStreamListAdapter({
  id: "official-global-hls-ext",
  label: "Official global broadcaster HLS (extended)",
  legalBasis:
    "Direct public HTTPS HLS manifests published by official broadcasters and public media organisations.",
  entries: officialGlobalHlsData as FixedStreamEntry[],
});
