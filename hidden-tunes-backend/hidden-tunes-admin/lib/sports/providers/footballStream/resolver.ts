import { fetchLiveFootballStreamCatalog } from "./client";
import { validateFootballStreamSource } from "./health";
import { classifyServer, stableListingId, stableSourceId } from "./normalize";

export async function resolveKnownFootballStreamListing(listingId: string, recentlyValidatedSourceIds: string[]) {
  if (!/^[a-f0-9]{32}$/.test(listingId)) return null;
  const catalog = await fetchLiveFootballStreamCatalog();
  const listing = catalog.matches.find((match) => stableListingId(match) === listingId);
  // The provider's status=live endpoint is authoritative; individual rows use
  // several labels (Live, In Progress, half-time) rather than one literal.
  if (!listing) return null;
  for (const source of listing.servers || []) {
    if (classifyServer(source) !== "direct_hls") continue;
    if (!recentlyValidatedSourceIds.includes(stableSourceId(source))) continue;
    const health = await validateFootballStreamSource(source);
    if (health.state === "HEALTHY" && source.url) {
      return { url: source.url, playbackKind: "hls" as const, expiresInSeconds: 120, host: health.host, latencyMs: health.latencyMs };
    }
  }
  return null;
}
