import officialGlobalHlsData from "@/lib/tvExpansion25k/sources/data/officialGlobalHls.json";
import { createFixedStreamListAdapter } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";
import type { FixedStreamEntry } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";

export const officialGlobalHlsAdapter = createFixedStreamListAdapter({
  id: "official-global-hls",
  label: "Official global broadcaster HLS",
  legalBasis:
    "Direct public HLS manifests published by official broadcasters and public media organisations.",
  entries: officialGlobalHlsData as FixedStreamEntry[],
});
