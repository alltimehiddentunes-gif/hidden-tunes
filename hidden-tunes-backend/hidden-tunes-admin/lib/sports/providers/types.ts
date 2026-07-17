/**
 * Sports provider adapter contract.
 * Phase 1: interfaces + empty placeholder adapters only.
 * Do not import real production inventory yet.
 */

export type ProviderEvent = {
  externalId: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  sportSlug?: string;
  competitionExternalId?: string;
  metadata?: Record<string, unknown>;
};

export type ProviderChannel = {
  externalId: string;
  name: string;
  officialUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProviderVideo = {
  externalId: string;
  title: string;
  videoType: string;
  metadata?: Record<string, unknown>;
};

export type NormalizedSportsItem = {
  kind: "event" | "channel" | "video" | "team" | "competition" | "athlete";
  externalId: string;
  title: string;
  payload: Record<string, unknown>;
};

export type TerritoryRule = {
  countryCode: string;
  availability: string;
  accessType: string;
};

export type VerifyInput = {
  externalId: string;
  country?: string;
  platform?: string;
};

export type VerificationResult = {
  ok: boolean;
  reasons: string[];
};

export type ResolveInput = {
  externalId: string;
  platform: string;
  country: string;
};

export type PlaybackResult = {
  mode: "native" | "embedded" | "external";
  payload: Record<string, unknown>;
};

export type SportsProviderConfig = {
  slug: string;
  name: string;
  enabled: boolean;
  killSwitch: boolean;
  rateLimitPerMinute: number;
  timeoutMs: number;
  allowedDomains: string[];
};

export interface SportsProviderAdapter {
  readonly config: SportsProviderConfig;
  discoverEvents(): Promise<ProviderEvent[]>;
  discoverChannels(): Promise<ProviderChannel[]>;
  discoverVideos(): Promise<ProviderVideo[]>;
  normalizeMetadata(): Promise<NormalizedSportsItem[]>;
  getTerritories(): Promise<TerritoryRule[]>;
  verifyAvailability(input: VerifyInput): Promise<VerificationResult>;
  resolvePlayback(input: ResolveInput): Promise<PlaybackResult>;
}

export abstract class BaseSportsProviderAdapter implements SportsProviderAdapter {
  abstract readonly config: SportsProviderConfig;

  protected assertEnabled() {
    if (this.config.killSwitch || !this.config.enabled) {
      throw new Error(`Provider ${this.config.slug} is disabled.`);
    }
  }

  async discoverEvents(): Promise<ProviderEvent[]> {
    return [];
  }
  async discoverChannels(): Promise<ProviderChannel[]> {
    return [];
  }
  async discoverVideos(): Promise<ProviderVideo[]> {
    return [];
  }
  async normalizeMetadata(): Promise<NormalizedSportsItem[]> {
    return [];
  }
  async getTerritories(): Promise<TerritoryRule[]> {
    return [];
  }
  async verifyAvailability(_input: VerifyInput): Promise<VerificationResult> {
    return { ok: false, reasons: ["not_implemented_phase1"] };
  }
  async resolvePlayback(_input: ResolveInput): Promise<PlaybackResult> {
    throw new Error("resolvePlayback not implemented in Phase 1");
  }
}

export function createPlaceholderAdapter(
  slug: string,
  name: string
): SportsProviderAdapter {
  return new (class extends BaseSportsProviderAdapter {
    readonly config: SportsProviderConfig = {
      slug,
      name,
      enabled: false,
      killSwitch: true,
      rateLimitPerMinute: 30,
      timeoutMs: 15_000,
      allowedDomains: [],
    };
  })();
}
