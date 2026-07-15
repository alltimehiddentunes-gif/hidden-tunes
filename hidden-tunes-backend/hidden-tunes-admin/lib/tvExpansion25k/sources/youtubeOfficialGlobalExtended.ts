import youtubeOfficialGlobalData from "@/lib/tvExpansion25k/sources/data/youtubeOfficialGlobal.json";
import { createFixedStreamListAdapter } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";
import type { FixedStreamEntry } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";

/** Fresh cursor over the expanded official YouTube broadcaster inventory. */
export const youtubeOfficialGlobalExtendedAdapter = createFixedStreamListAdapter({
  id: "youtube-official-global-ext",
  label: "Official YouTube broadcasters (extended)",
  legalBasis:
    "Official broadcaster-owned YouTube channels with continuous or live public programming.",
  entries: youtubeOfficialGlobalData as FixedStreamEntry[],
  sourceType: "youtube_video",
});
