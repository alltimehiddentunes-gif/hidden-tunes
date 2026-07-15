type CacheEntry<T> = {
  loadedAt: number;
  data: T;
};

const cache = new Map<string, CacheEntry<unknown>>();

export async function loadWithCache<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = 30 * 60_000
): Promise<T> {
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && Date.now() - existing.loadedAt < ttlMs) {
    return existing.data;
  }

  const data = await loader();
  cache.set(key, { loadedAt: Date.now(), data });
  return data;
}

export function paginateArray<T>(items: T[], offset: number, limit: number) {
  const slice = items.slice(offset, offset + limit);
  const nextOffset = offset + slice.length;
  return {
    slice,
    nextOffset,
    exhausted: nextOffset >= items.length,
    total: items.length,
  };
}
