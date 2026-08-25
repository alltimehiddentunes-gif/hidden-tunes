import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CacheEntry<T> = { value: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();

export function sportsCacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function sportsCacheSet<T>(key: string, value: T, ttlMs: number) {
  store.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlMs) });
}

export function sportsCacheInvalidate(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function sportsCacheKey(
  parts: Array<string | number | boolean | null | undefined>
): string {
  return parts.map((p) => String(p ?? "")).join(":");
}

/**
 * Cross-process cache generation. Fixture writers bump this after a committed
 * recovery batch so the API process cannot serve an older in-memory entry.
 */
export async function getSportsFixtureDataVersion(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("sports_data_versions")
    .select("version")
    .eq("key", "fixture_catalog")
    .maybeSingle();
  if (error || data?.version == null) return "legacy";
  return String(data.version);
}
