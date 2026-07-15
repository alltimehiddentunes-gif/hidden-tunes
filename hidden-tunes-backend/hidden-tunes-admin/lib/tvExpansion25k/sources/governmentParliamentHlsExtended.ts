import governmentParliamentHlsData from "@/lib/tvExpansion25k/sources/data/governmentParliamentHls.json";
import { createFixedStreamListAdapter } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";
import type { FixedStreamEntry } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";

/** Fresh cursor over the expanded government and parliamentary inventory. */
export const governmentParliamentHlsExtendedAdapter = createFixedStreamListAdapter({
  id: "government-parliament-hls-ext",
  label: "Government and parliamentary HLS (extended)",
  legalBasis:
    "Public government, parliamentary, and civic institution live streams published for free public access.",
  entries: governmentParliamentHlsData as FixedStreamEntry[],
});
