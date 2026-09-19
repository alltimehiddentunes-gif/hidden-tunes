/**
 * Extensible MetadataProvider registry.
 * Only wire providers that are actually configured — do not fabricate APIs.
 */

export class MetadataProviderRegistry {
  constructor() {
    this.providers = [];
  }

  register(provider) {
    if (!provider?.id || typeof provider.lookup !== "function") {
      throw new Error("invalid_metadata_provider");
    }
    this.providers = this.providers.filter((p) => p.id !== provider.id);
    this.providers.push(provider);
    return this;
  }

  list() {
    return [...this.providers];
  }

  clear() {
    this.providers = [];
  }

  async enrich(identity, signal) {
    const started = Date.now();
    for (const provider of this.providers) {
      if (signal?.aborted) break;
      try {
        const result = await provider.lookup(identity, signal);
        if (result && result.confidence && result.confidence !== "NO_MATCH") {
          return { ...result, providerId: provider.id, enrichmentDurationMs: Date.now() - started };
        }
      } catch {
        // Provider isolation — continue.
      }
    }
    return {
      confidence: "NO_MATCH",
      providerId: null,
      enrichmentDurationMs: Date.now() - started,
    };
  }
}

export const metadataProviderRegistry = new MetadataProviderRegistry();
