import { createMjhFastCatalogAdapter } from "@/lib/tvExpansion25k/sources/shared/mjhFastCatalogAdapter";

const SAMSUNG_CATALOG_URL = "https://i.mjh.nz/SamsungTVPlus/.channels.json.gz";

export const samsungTvPlusFastAdapter = createMjhFastCatalogAdapter({
  id: "samsung-tv-plus-fast",
  label: "Samsung TV Plus FAST",
  legalBasis:
    "Samsung TV Plus free ad-supported FAST channels from Samsung's public TV Plus service catalog.",
  catalogUrl: SAMSUNG_CATALOG_URL,
  cacheKey: "mjh-samsung-tv-plus",
  defaultWebsite: "https://www.samsung.com/us/tvs/tvplus/",
  streamUrlForId: (channelId, _catalog, regionKey) =>
    regionKey
      ? `https://i.mjh.nz/SamsungTVPlus/${regionKey}/${channelId}.m3u8`
      : `https://i.mjh.nz/SamsungTVPlus/${channelId}.m3u8`,
  skipChannel: (channel) => Boolean(channel.license_url),
});
