export class RecommendationCache<T> {
  private values = new Map<string, { expires: number; value: T }>(); private pending = new Map<string, Promise<T>>();
  constructor(private maxEntries = 250, private ttlMs = 30_000) {}
  get(key: string) { const entry = this.values.get(key); if (!entry || entry.expires <= Date.now()) { if (entry) this.values.delete(key); return undefined; } this.values.delete(key); this.values.set(key, entry); return entry.value; }
  set(key: string, value: T) { this.values.delete(key); this.values.set(key, { value, expires: Date.now() + this.ttlMs }); while (this.values.size > this.maxEntries) this.values.delete(this.values.keys().next().value as string); }
  async coalesce(key: string, work: () => Promise<T>) { const existing = this.pending.get(key); if (existing) return { value: await existing, coalesced: true }; const promise = work(); this.pending.set(key, promise); try { return { value: await promise, coalesced: false }; } finally { if (this.pending.get(key) === promise) this.pending.delete(key); } }
  clear() { this.values.clear(); this.pending.clear(); }
}
