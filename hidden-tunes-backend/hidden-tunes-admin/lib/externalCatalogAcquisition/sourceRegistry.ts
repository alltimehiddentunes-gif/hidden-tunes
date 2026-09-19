import type { ExternalCatalogSourceAdapter } from "./sourceAdapter";
import type { ProviderId } from "./types";
export type RegisteredSource = { providerId: ProviderId; name: string; enabledByDefault: false; ingestionStatus: "AVAILABLE" | "EXISTING"; reingestPolicy: "ALLOW" | "DO_NOT_REINGEST" };
export const SOURCE_REGISTRY: readonly RegisteredSource[] = [
  ["dogmazic", "Dogmazic", "AVAILABLE", "ALLOW"], ["free_music_archive", "Free Music Archive", "AVAILABLE", "ALLOW"], ["musopen", "Musopen", "AVAILABLE", "ALLOW"], ["wikimedia_commons", "Wikimedia Commons", "AVAILABLE", "ALLOW"], ["open_music_archive", "Open Music Archive", "AVAILABLE", "ALLOW"], ["ccmixter", "ccMixter", "AVAILABLE", "ALLOW"], ["imslp", "IMSLP", "AVAILABLE", "ALLOW"], ["audiotreasure", "AudioTreasure", "AVAILABLE", "ALLOW"], ["public_domain_audio_bibles", "Public Domain Audio Bibles", "AVAILABLE", "ALLOW"], ["internet_archive", "Internet Archive", "EXISTING", "DO_NOT_REINGEST"],
].map(([providerId, name, ingestionStatus, reingestPolicy]) => ({ providerId: providerId as ProviderId, name, enabledByDefault: false as const, ingestionStatus: ingestionStatus as RegisteredSource["ingestionStatus"], reingestPolicy: reingestPolicy as RegisteredSource["reingestPolicy"] }));
export function createSourceRegistry(adapters: readonly ExternalCatalogSourceAdapter[] = []) {
  const map = new Map<ProviderId, ExternalCatalogSourceAdapter>();
  for (const adapter of adapters) {
    if (map.has(adapter.providerId)) throw new Error(`Duplicate source adapter: ${adapter.providerId}`);
    const source = SOURCE_REGISTRY.find((entry) => entry.providerId === adapter.providerId);
    if (!source || source.reingestPolicy === "DO_NOT_REINGEST") throw new Error(`Provider is not eligible for acquisition: ${adapter.providerId}`);
    map.set(adapter.providerId, adapter);
  }
  return { get: (providerId: ProviderId) => map.get(providerId), list: () => [...SOURCE_REGISTRY] };
}
