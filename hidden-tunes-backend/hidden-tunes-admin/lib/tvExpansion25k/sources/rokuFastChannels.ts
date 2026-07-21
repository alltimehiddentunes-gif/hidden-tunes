import { createMjhFastCatalogAdapter } from "@/lib/tvExpansion25k/sources/shared/mjhFastCatalogAdapter";

const ROKU_CATALOG_URL = "https://i.mjh.nz/Roku/.channels.json.gz";

export const rokuFastChannelsAdapter = createMjhFastCatalogAdapter({
  id: "roku-fast-channels",
  label: "Roku FAST channels",
  legalBasis:
    "Roku Channel free ad-supported FAST streams from Roku's public live channel catalog.",
  catalogUrl: ROKU_CATALOG_URL,
  cacheKey: "mjh-roku-fast",
  defaultWebsite: "https://therokuchannel.roku.com/",
  streamUrlForId: (channelId) => `https://jmp2.uk/rok-${channelId}.m3u8`,
});
