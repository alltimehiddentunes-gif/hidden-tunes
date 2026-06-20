/** Max songs retained in Home/Explore screen React state (global cache holds the full catalog). */
export const MAX_SCREEN_CATALOG_SONGS = 240;

export function capScreenCatalogSongs<T>(songs: T[]): T[] {
  if (songs.length <= MAX_SCREEN_CATALOG_SONGS) return songs;
  return songs.slice(0, MAX_SCREEN_CATALOG_SONGS);
}
