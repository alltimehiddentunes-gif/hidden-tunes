import {
  dedupeTvGrowthCandidates,
  type TvGrowthCandidate,
} from "@/lib/tvStationHealth";
import {
  loadAllTvDedupeKeys,
  type TvDedupeKeyIndex,
} from "@/lib/tvExpansion25k/dedupeKeys";

export type { TvDedupeKeyIndex };

/**
 * Session-scoped dedupe index — loaded once per run, updated after accepted candidates.
 * Thread-safe for single-process parallel workers via synchronous Set updates.
 */
export class TvDedupeCache {
  private index: TvDedupeKeyIndex | null = null;
  private loadPromise: Promise<TvDedupeKeyIndex> | null = null;

  async ensureLoaded() {
    if (this.index) return this.index;
    if (!this.loadPromise) {
      this.loadPromise = loadAllTvDedupeKeys().then((loaded) => {
        this.index = loaded;
        return loaded;
      });
    }
    return this.loadPromise;
  }

  async prefilter(candidates: TvGrowthCandidate[]) {
    const existing = await this.ensureLoaded();
    const before = candidates.length;
    const accepted = dedupeTvGrowthCandidates(candidates, existing);
    return {
      accepted,
      removed: before - accepted.length,
      existingKeyCount: existing.sourceKeys.size,
    };
  }

  registerAccepted(candidates: TvGrowthCandidate[]) {
    if (!this.index) return;
    for (const candidate of candidates) {
      const sourceKey =
        candidate.source_key || `${candidate.source_type}:${candidate.source_id}`;
      const urlKey = String(candidate.source_url || "")
        .trim()
        .replace(/\/+$/, "")
        .toLowerCase();
      const titleCountryKey = `${String(candidate.title || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")}::${String(candidate.country || candidate.region || "")
        .trim()
        .toLowerCase()}`;
      this.index.sourceKeys.add(sourceKey);
      if (urlKey) this.index.urlKeys.add(urlKey);
      this.index.titleCountryKeys.add(titleCountryKey);
    }
  }

  async refresh() {
    this.index = await loadAllTvDedupeKeys();
    this.loadPromise = Promise.resolve(this.index);
    return this.index;
  }
}
