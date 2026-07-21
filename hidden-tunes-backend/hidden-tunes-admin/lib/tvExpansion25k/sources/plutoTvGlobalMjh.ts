import { createMjhFastCatalogAdapter } from "@/lib/tvExpansion25k/sources/shared/mjhFastCatalogAdapter";

const PLUTO_CATALOG_URL = "https://i.mjh.nz/PlutoTV/.channels.json.gz";

/** Regional Pluto TV inventory (distinct cursor from api.pluto.tv US-only adapter). */
export const plutoTvGlobalMjhAdapter = createMjhFastCatalogAdapter({
  id: "pluto-tv-global-mjh",
  label: "Pluto TV global regions (FAST)",
  legalBasis:
    "Pluto TV free FAST channels across regional Pluto TV catalogs exposed via public channel metadata.",
  catalogUrl: PLUTO_CATALOG_URL,
  cacheKey: "mjh-pluto-tv-global",
  defaultWebsite: "https://pluto.tv/live-tv",
  streamUrlForId: (channelId) => `https://jmp2.uk/plu-${channelId}.m3u8`,
});
