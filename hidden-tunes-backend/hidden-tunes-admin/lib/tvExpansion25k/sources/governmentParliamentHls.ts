import governmentParliamentHlsData from "@/lib/tvExpansion25k/sources/data/governmentParliamentHls.json";
import { createFixedStreamListAdapter } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";
import type { FixedStreamEntry } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";

export const governmentParliamentHlsAdapter = createFixedStreamListAdapter({
  id: "government-parliament-hls",
  label: "Government and parliamentary TV",
  legalBasis:
    "Official government and parliamentary television streams published by public institutions.",
  entries: governmentParliamentHlsData as FixedStreamEntry[],
});
