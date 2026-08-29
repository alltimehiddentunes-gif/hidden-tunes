import {
  indexIptvOrgSnapshot,
  loadIptvOrgSnapshot,
  type IptvOrgSnapshot,
} from "@/lib/tvIptvOrgSource";
import { validatePublicTvUrl } from "@/lib/tvStationHealth";
import { fetchGzJson } from "@/lib/tvExpansion25k/sources/shared/gzJsonFetch";
import { parseM3uPlaylist } from "@/lib/tvExpansion25k/sources/shared/m3uParser";
import { retryFetchText } from "@/lib/tvExpansion25k/sources/shared/retryFetch";
import type {
  TvProviderCandidate,
  TvProviderIdentity,
  TvRecoveryStation,
} from "@/lib/tvRecovery/types";

export interface TvRecoveryProvider {
  id: string;
  cooldownMs: number;
  identify(station: TvRecoveryStation): TvProviderIdentity | null;
  resolveExact(identity: TvProviderIdentity): Promise<TvProviderCandidate[]>;
}

export class TvRecoveryProviderRegistry {
  private readonly providersById: Map<string, TvRecoveryProvider>;

  constructor(providers: TvRecoveryProvider[]) {
    this.providersById = new Map(providers.map((provider) => [provider.id, provider]));
  }

  identify(station: TvRecoveryStation) {
    for (const provider of this.providersById.values()) {
      const identity = provider.identify(station);
      if (identity) return identity;
    }
    return null;
  }

  getProvider(providerId: string) {
    return this.providersById.get(providerId) || null;
  }

  async resolveExact(identity: TvProviderIdentity) {
    const provider = this.getProvider(identity.providerId);
    if (!provider) return [];
    const candidates = await provider.resolveExact(identity);
    return candidates.filter(
      (candidate) =>
        candidate.providerId === identity.providerId &&
        candidate.canonicalId === identity.canonicalId &&
        candidate.sourceKey === identity.sourceKey
    );
  }
}

function exactPrefixIdentity(
  station: TvRecoveryStation,
  providerId: string,
  sourceKeyPrefixes: string[],
  sourceIdPrefixes: string[] = []
) {
  const sourceKey = String(station.source_key || "").trim();
  for (const prefix of sourceKeyPrefixes) {
    if (sourceKey.startsWith(prefix) && sourceKey.length > prefix.length) {
      const canonicalId = sourceKey.slice(prefix.length);
      return { providerId, canonicalId, sourceKey: `${providerId}:${canonicalId}` };
    }
  }

  const sourceId = String(station.source_id || "").trim();
  for (const prefix of sourceIdPrefixes) {
    if (sourceId.startsWith(prefix) && sourceId.length > prefix.length) {
      const canonicalId = sourceId.slice(prefix.length);
      return { providerId, canonicalId, sourceKey: `${providerId}:${canonicalId}` };
    }
  }
  return null;
}

function uniqueCandidates(candidates: TvProviderCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.sourceKey}::${candidate.sourceUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createIptvOrgRecoveryProvider(options: {
  loadSnapshot?: () => Promise<IptvOrgSnapshot>;
} = {}): TvRecoveryProvider {
  let indexedSnapshot: ReturnType<typeof indexIptvOrgSnapshot> | null = null;
  const loadSnapshot = options.loadSnapshot ?? (() => loadIptvOrgSnapshot());

  return {
    id: "iptv-org",
    cooldownMs: 30_000,
    identify(station) {
      return exactPrefixIdentity(station, "iptv-org", ["iptv-org:"], ["iptv-org-"]);
    },
    async resolveExact(identity) {
      if (!indexedSnapshot) indexedSnapshot = indexIptvOrgSnapshot(await loadSnapshot());
      const channel = indexedSnapshot.channelById.get(identity.canonicalId);
      if (!channel) return [];
      const candidates: TvProviderCandidate[] = [];
      for (const stream of indexedSnapshot.streamsByChannelId.get(identity.canonicalId) || []) {
        const url = validatePublicTvUrl(stream.url);
        if (!url.ok) continue;
        candidates.push({
          providerId: "iptv-org",
          canonicalId: identity.canonicalId,
          sourceKey: identity.sourceKey,
          sourceType: "hls_stream",
          sourceId: `iptv-org-${identity.canonicalId}`,
          sourceUrl: url.url,
          title: channel.name,
          metadata: {
            country: channel.country || null,
            language: channel.languages?.[0] || null,
            logo: channel.logo || null,
          },
        });
      }
      return uniqueCandidates(candidates);
    },
  };
}

const FREE_TV_PLAYLIST_URL = "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";

export function createFreeTvRecoveryProvider(options: {
  loadPlaylist?: () => Promise<string>;
} = {}): TvRecoveryProvider {
  let entriesPromise: Promise<ReturnType<typeof parseM3uPlaylist>> | null = null;
  const loadPlaylist = options.loadPlaylist ?? (() => retryFetchText(FREE_TV_PLAYLIST_URL));

  return {
    id: "free-tv",
    cooldownMs: 60_000,
    identify(station) {
      return exactPrefixIdentity(station, "free-tv", ["free-tv:"], ["free-tv-"]);
    },
    async resolveExact(identity) {
      const pending = entriesPromise || loadPlaylist().then(parseM3uPlaylist);
      entriesPromise = pending;
      let entries: ReturnType<typeof parseM3uPlaylist>;
      try {
        entries = await pending;
      } catch (error) {
        if (entriesPromise === pending) entriesPromise = null;
        throw error;
      }
      const exact = entries.filter(
        (entry) => String(entry.tvgId || entry.title).trim() === identity.canonicalId
      );
      return uniqueCandidates(
        exact.flatMap<TvProviderCandidate>((entry) => {
          const url = validatePublicTvUrl(entry.url);
          if (!url.ok) return [];
          return [{
            providerId: "free-tv",
            canonicalId: identity.canonicalId,
            sourceKey: identity.sourceKey,
            sourceType: "hls_stream",
            sourceId: `free-tv-${identity.canonicalId}`,
            sourceUrl: url.url,
            title: entry.tvgName || entry.title,
            metadata: {
              country: entry.tvgCountry || null,
              language: entry.tvgLanguage || null,
              logo: entry.logo || null,
            },
          }];
        })
      );
    },
  };
}

type MjhChannel = {
  name?: string;
  logo?: string;
  license_url?: string;
};

type MjhCatalog = {
  slug?: string;
  channels?: Record<string, MjhChannel>;
  regions?: Record<string, { channels?: Record<string, MjhChannel> }>;
};

function findExactMjhChannel(catalog: MjhCatalog, canonicalId: string) {
  const direct = catalog.channels?.[canonicalId];
  if (direct) return direct;
  for (const region of Object.values(catalog.regions || {})) {
    const channel = region.channels?.[canonicalId];
    if (channel) return channel;
  }
  return null;
}

function createMjhRecoveryProvider(options: {
  id: string;
  sourceKeyPrefixes: string[];
  catalogUrl: string;
  streamUrlForId: (id: string, catalog: MjhCatalog) => string;
  exclude?: (channel: MjhChannel) => boolean;
  loadCatalog?: () => Promise<MjhCatalog>;
}): TvRecoveryProvider {
  let catalogPromise: Promise<MjhCatalog> | null = null;
  const loadCatalog = options.loadCatalog ?? (() => fetchGzJson<MjhCatalog>(options.catalogUrl));

  return {
    id: options.id,
    cooldownMs: 90_000,
    identify(station) {
      return exactPrefixIdentity(station, options.id, options.sourceKeyPrefixes);
    },
    async resolveExact(identity) {
      const pending = catalogPromise || loadCatalog();
      catalogPromise = pending;
      let catalog: MjhCatalog;
      try {
        catalog = await pending;
      } catch (error) {
        if (catalogPromise === pending) catalogPromise = null;
        throw error;
      }
      const channel = findExactMjhChannel(catalog, identity.canonicalId);
      if (!channel || options.exclude?.(channel)) return [];
      const url = validatePublicTvUrl(options.streamUrlForId(identity.canonicalId, catalog));
      if (!url.ok) return [];
      return [{
        providerId: options.id,
        canonicalId: identity.canonicalId,
        sourceKey: identity.sourceKey,
        sourceType: "hls_stream",
        sourceId: identity.canonicalId,
        sourceUrl: url.url,
        title: channel.name || identity.canonicalId,
        metadata: { logo: channel.logo || null },
      }];
    },
  };
}

export function createStaticExactRecoveryProvider(options: {
  id: string;
  candidates: TvProviderCandidate[];
  sourceKeyPrefixes?: string[];
  sourceIdPrefixes?: string[];
  cooldownMs?: number;
}): TvRecoveryProvider {
  const byIdentity = new Map<string, TvProviderCandidate[]>();
  for (const candidate of options.candidates) {
    const key = `${candidate.providerId}:${candidate.canonicalId}`;
    const current = byIdentity.get(key) || [];
    current.push(candidate);
    byIdentity.set(key, current);
  }
  return {
    id: options.id,
    cooldownMs: options.cooldownMs ?? 0,
    identify(station) {
      return exactPrefixIdentity(
        station,
        options.id,
        options.sourceKeyPrefixes ?? [`${options.id}:`],
        options.sourceIdPrefixes ?? []
      );
    },
    async resolveExact(identity) {
      return uniqueCandidates(byIdentity.get(`${identity.providerId}:${identity.canonicalId}`) || []);
    },
  };
}

export function createDefaultTvRecoveryRegistry(options: {
  historicalMappings?: TvProviderCandidate[];
} = {}) {
  const providers: TvRecoveryProvider[] = [
    createIptvOrgRecoveryProvider(),
    createFreeTvRecoveryProvider(),
    createMjhRecoveryProvider({
      id: "samsung-tv-plus-fast",
      sourceKeyPrefixes: ["samsung-tv-plus-fast:"],
      catalogUrl: "https://i.mjh.nz/SamsungTVPlus/.channels.json.gz",
      streamUrlForId: (id, catalog) =>
        `https://jmp2.uk/${(catalog.slug || "stvp-{id}").replace("{id}", id)}`,
      exclude: (channel) => Boolean(channel.license_url),
    }),
    createMjhRecoveryProvider({
      id: "roku-fast-channels",
      sourceKeyPrefixes: ["roku-fast-channels:"],
      catalogUrl: "https://i.mjh.nz/Roku/.channels.json.gz",
      streamUrlForId: (id) => `https://jmp2.uk/rok-${id}.m3u8`,
    }),
  ];

  const historical = options.historicalMappings || [];
  for (const providerId of [...new Set(historical.map((candidate) => candidate.providerId))]) {
    if (providers.some((provider) => provider.id === providerId)) continue;
    providers.push(
      createStaticExactRecoveryProvider({
        id: providerId,
        candidates: historical.filter((candidate) => candidate.providerId === providerId),
      })
    );
  }
  return new TvRecoveryProviderRegistry(providers);
}
