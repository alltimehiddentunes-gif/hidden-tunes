import type { FixedStreamEntry } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";
import { createFixedStreamListAdapter } from "@/lib/tvExpansion25k/sources/shared/fixedStreamListAdapter";

export function createWorldwaveJsonAdapter(options: {
  id: string;
  label: string;
  legalBasis: string;
  entries: FixedStreamEntry[];
  sourceType?: "hls_stream" | "youtube_video";
}) {
  return createFixedStreamListAdapter({
    id: options.id,
    label: options.label,
    legalBasis: options.legalBasis,
    entries: options.entries,
    sourceType: options.sourceType,
  });
}
