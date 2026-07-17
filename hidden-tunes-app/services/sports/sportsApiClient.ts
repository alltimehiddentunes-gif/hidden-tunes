import { isSportsClientEnabled } from "../../constants/sportsFlags";
import type {
  SportsHomeResponse,
  SportsPlaybackResult,
} from "../../types/sports";

export const SPORTS_CATALOG_BASE_URL = "https://admin.hiddentunes.com";
export const SPORTS_DEFAULT_PAGE_LIMIT = 20;

type FetchOptions = {
  signal?: AbortSignal;
  country?: string;
  platform?: string;
};

const inflight = new Map<string, Promise<unknown>>();

function dedupe<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = factory().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

async function sportsFetch<T>(
  path: string,
  init: RequestInit & { country?: string; platform?: string } = {}
): Promise<T> {
  if (!isSportsClientEnabled("sports_enabled")) {
    return {
      success: true,
      enabled: false,
    } as T;
  }

  const url = new URL(path, SPORTS_CATALOG_BASE_URL);
  if (init.country) url.searchParams.set("country", init.country);
  if (init.platform) url.searchParams.set("platform", init.platform);

  const headers = new Headers(init.headers || {});
  if (init.platform) headers.set("x-ht-platform", init.platform);
  if (init.country) headers.set("x-ht-storefront-country", init.country);

  const response = await fetch(url.toString(), {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Sports API ${response.status}: ${text.slice(0, 200)}`);
  }

  return (await response.json()) as T;
}

export async function fetchSportsHome(
  options: FetchOptions = {}
): Promise<SportsHomeResponse> {
  const country = options.country || "ZZ";
  const platform = options.platform || "ios";
  return dedupe(`home:${country}:${platform}`, () =>
    sportsFetch<SportsHomeResponse>("/api/sports/home", {
      signal: options.signal,
      country,
      platform,
    })
  );
}

export async function resolveSportsBroadcastPlayback(input: {
  broadcastId: string;
  platform: string;
  country: string;
  deviceId?: string;
  appVersion?: string;
  signal?: AbortSignal;
}): Promise<{ success: boolean; playback?: SportsPlaybackResult; code?: string; error?: string }> {
  if (!isSportsClientEnabled("sports_enabled")) {
    return { success: false, code: "FEATURE_DISABLED", error: "Sports is disabled." };
  }

  return dedupe(
    `play:${input.broadcastId}:${input.platform}:${input.country}`,
    async () => {
      const response = await fetch(
        `${SPORTS_CATALOG_BASE_URL}/api/sports/broadcasts/${encodeURIComponent(input.broadcastId)}/play`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-ht-platform": input.platform,
          },
          body: JSON.stringify({
            platform: input.platform,
            country: input.country,
            deviceId: input.deviceId,
            appVersion: input.appVersion,
          }),
          signal: input.signal,
          cache: "no-store",
        }
      );
      return (await response.json()) as {
        success: boolean;
        playback?: SportsPlaybackResult;
        code?: string;
        error?: string;
      };
    }
  );
}
