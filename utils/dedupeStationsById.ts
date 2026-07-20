/**
 * Stable first-win dedupe by canonical station id.
 * Keeps rows with empty ids; preserves order; never uses index/random keys.
 */
export function dedupeStationsById<T extends { id?: string | null }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const id = String(item.id ?? "").trim();

    if (!id) {
      result.push(item);
      continue;
    }

    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    result.push(item);
  }

  return result;
}
