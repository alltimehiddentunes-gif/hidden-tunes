import {
  getCurrentSupabaseAccessToken,
  getCurrentSupabaseProfileNamespace,
  subscribeToMobileAuthState,
} from "./mobileSupabaseAuth";
import {
  isMusicRecommendationAuthSnapshotCurrent,
  normalizeMusicRecommendationRequest,
  requestMusicRecommendationsOverTransport,
  type MusicRecommendationRequest,
  type MusicRecommendationResult,
} from "./musicIntelligenceRefill";

export type {
  MusicJourneyIntent,
  MusicRecommendation,
  MusicRecommendationRequest,
  MusicRecommendationResult,
} from "./musicIntelligenceRefill";

const MUSIC_RECOMMENDATIONS_URL =
  "https://admin.hiddentunes.com/api/music/recommendations";
const REQUEST_TIMEOUT_MS = 800;
const CACHE_TTL_MS = 30_000;
const CACHE_LIMIT = 32;

type CacheEntry = { expiresAt: number; result: MusicRecommendationResult };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<MusicRecommendationResult | null>>();
const activeControllers = new Set<AbortController>();
let currentProfileNamespace = "anonymous";
let authSubscriptionReady = false;
let authEpoch = 0;

function ensureAuthIsolation() {
  if (authSubscriptionReady) return;
  authSubscriptionReady = true;
  subscribeToMobileAuthState((userId) => {
    const nextNamespace = userId ? `profile:${userId}` : "anonymous";
    if (nextNamespace === currentProfileNamespace) return;
    currentProfileNamespace = nextNamespace;
    authEpoch += 1;
    activeControllers.forEach((controller) => controller.abort());
    activeControllers.clear();
    cache.clear();
    inFlight.clear();
  });
}

function materialKey(input: MusicRecommendationRequest, namespace: string) {
  const normalized = normalizeMusicRecommendationRequest(input);
  return JSON.stringify({
    namespace,
    ...normalized,
  });
}

function readCache(key: string) {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.result;
}

function writeCache(key: string, result: MusicRecommendationResult) {
  cache.delete(key);
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (typeof oldest !== "string") break;
    cache.delete(oldest);
  }
}

export async function requestMusicRecommendations(
  input: MusicRecommendationRequest
): Promise<MusicRecommendationResult | null> {
  ensureAuthIsolation();
  const namespace = await getCurrentSupabaseProfileNamespace();
  currentProfileNamespace = namespace;
  if (namespace === "anonymous") return null;
  const normalized = normalizeMusicRecommendationRequest(input);
  const key = materialKey(normalized, namespace);
  const cached = readCache(key);
  if (cached) return cached;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const requestAuthEpoch = authEpoch;
  const requestAuthSnapshot = { namespace, epoch: requestAuthEpoch };
  const isAuthCurrent = (liveNamespace = currentProfileNamespace) =>
    isMusicRecommendationAuthSnapshotCurrent(requestAuthSnapshot, {
      namespace: liveNamespace,
      epoch: authEpoch,
    });

  const request = (async () => {
    const session = await getCurrentSupabaseAccessToken();
    if (!session.accessToken) return null;
    const liveNamespace = await getCurrentSupabaseProfileNamespace();
    if (!isAuthCurrent(liveNamespace) || !isAuthCurrent()) return null;
    const controller = new AbortController();
    activeControllers.add(controller);
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const result = await requestMusicRecommendationsOverTransport(
        normalized,
        () => fetch(MUSIC_RECOMMENDATIONS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(normalized),
          signal: controller.signal,
        })
      );
      if (!isAuthCurrent()) return null;
      if (result) writeCache(key, result);
      return result;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      activeControllers.delete(controller);
    }
  })();
  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    if (inFlight.get(key) === request) inFlight.delete(key);
  }
}

export function clearMusicRecommendationCacheForTests() {
  activeControllers.forEach((controller) => controller.abort());
  activeControllers.clear();
  cache.clear();
  inFlight.clear();
  currentProfileNamespace = "anonymous";
  authEpoch += 1;
}
