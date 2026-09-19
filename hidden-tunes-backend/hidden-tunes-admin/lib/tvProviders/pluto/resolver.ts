import type { ResolvedTvPlayback } from "../types";

const GUIDE_URL = "https://service-channels.clusters.pluto.tv/v1/guide?appName=web&deviceType=web&deviceModel=web&deviceMake=web";
const CACHE_MS = 90_000;
const PLUTO_ID = /^[a-f0-9]{24}$/i;

type GuideChannel = {
  id?: unknown;
  name?: unknown;
  stitched?: { urls?: Array<{ url?: unknown }> };
};

type CacheEntry = { expires: number; value: ResolvedTvPlayback };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ResolvedTvPlayback>>();
let guideCache: { expires: number; channels: GuideChannel[] } | null = null;
let guideInflight: Promise<GuideChannel[]> | null = null;

function assertOfficialSource(raw: string, channelId: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || !url.hostname.toLowerCase().endsWith(".pluto.tv")) {
    throw new Error("Pluto guide returned a non-official playback host");
  }
  if (!url.pathname.includes(`/channel/${channelId}/`)) {
    throw new Error("Pluto guide playback path does not match the requested channel");
  }
  const partner = `${url.searchParams.get("embedPartner") ?? ""} ${url.searchParams.get("deviceType") ?? ""}`;
  if (/samsung|roku/i.test(partner)) {
    throw new Error("Partner-emulation playback parameters are forbidden");
  }
  return url.toString();
}

async function fetchOfficialGuide(): Promise<GuideChannel[]> {
  if (guideCache && guideCache.expires > Date.now()) return guideCache.channels;
  if (guideInflight) return guideInflight;
  guideInflight = (async () => {
  const response = await fetch(GUIDE_URL, {
    headers: { Accept: "application/json" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Official Pluto guide failed (${response.status})`);
  const payload = (await response.json()) as unknown;
    const channels = Array.isArray(payload)
      ? payload as GuideChannel[]
      : payload && typeof payload === "object" && Array.isArray((payload as { channels?: unknown }).channels)
        ? (payload as { channels: GuideChannel[] }).channels
        : null;
    if (!channels) throw new Error("Official Pluto guide returned an invalid document");
    guideCache = { expires: Date.now() + CACHE_MS, channels };
    return channels;
  })().finally(() => { guideInflight = null; });
  return guideInflight;
}

async function fetchOfficialChannel(channelId: string, region: string | null): Promise<ResolvedTvPlayback> {
  const started = Date.now();
  const channels = await fetchOfficialGuide();
  const channel = channels.find((item) => item.id === channelId);
  if (!channel || typeof channel.name !== "string") {
    throw new Error(`Channel ${channelId} is absent from the current public Pluto guide`);
  }
  const raw = channel.stitched?.urls?.[0]?.url;
  if (typeof raw !== "string") throw new Error(`Channel ${channelId} has no public stitched playback URL`);
  const source = assertOfficialSource(raw, channelId);
  const resolvedAt = new Date(started);
  return {
    provider: "pluto",
    providerChannelId: channelId,
    canonicalName: channel.name,
    source,
    protocol: "hls",
    headers: {},
    region,
    provenance: "official_public_pluto_guide",
    confidence: "EXACT",
    resolvedAt: resolvedAt.toISOString(),
    expiresAt: new Date(started + CACHE_MS).toISOString(),
    validationState: "UNKNOWN",
  };
}

export async function resolvePlutoPlayback(
  providerChannelId: string,
  region: string | null = null,
): Promise<ResolvedTvPlayback> {
  if (!PLUTO_ID.test(providerChannelId)) throw new Error("Invalid canonical Pluto channel ID");
  const key = `${providerChannelId}:${region ?? "default"}`;
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.value;
  const pending = inflight.get(key);
  if (pending) return pending;
  const operation = fetchOfficialChannel(providerChannelId, region)
    .then((value) => {
      cache.set(key, { expires: Date.now() + CACHE_MS, value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, operation);
  return operation;
}

export function clearPlutoResolverCacheForTests(): void {
  cache.clear();
  guideCache = null;
}
