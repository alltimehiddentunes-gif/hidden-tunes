import youtubeOfficialGlobalData from "@/lib/tvExpansion25k/sources/data/youtubeOfficialGlobal.json";
import { createFixedStreamListAdapter } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";
import type { FixedStreamEntry } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";

export const youtubeOfficialGlobalAdapter = createFixedStreamListAdapter({
  id: "youtube-official-global",
  label: "Official YouTube live broadcasters",
  legalBasis:
    "Official broadcaster-owned YouTube live channels supported by the existing Hidden Tunes YouTube playback path.",
  sourceType: "youtube_video",
  entries: youtubeOfficialGlobalData as FixedStreamEntry[],
});
