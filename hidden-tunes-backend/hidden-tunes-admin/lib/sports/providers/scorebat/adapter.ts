/**
 * ScoreBat Sports provider adapter — defaults kill-switched.
 */

import { BaseSportsProviderAdapter } from "../types";
import type {
  NormalizedSportsItem,
  PlaybackResult,
  ProviderChannel,
  ProviderEvent,
  ProviderVideo,
  ResolveInput,
  SportsProviderConfig,
  TerritoryRule,
  VerificationResult,
  VerifyInput,
} from "../types";
import { discoverScoreBatMatches } from "./client";
import {
  getScoreBatRuntimeConfig,
  SCOREBAT_ALLOWED_EMBED_HOSTS,
  SCOREBAT_PROVIDER_NAME,
  SCOREBAT_PROVIDER_SLUG,
} from "./config";
import { isScoreBatDiscoveryPaused } from "./health";
import { mapScoreBatMatches } from "./mapper";
import { resolveScoreBatPlayback } from "./playback";

export class ScoreBatProviderAdapter extends BaseSportsProviderAdapter {
  readonly config: SportsProviderConfig;

  constructor(overrides?: Partial<SportsProviderConfig>) {
    super();
    const runtime = getScoreBatRuntimeConfig();
    this.config = {
      slug: SCOREBAT_PROVIDER_SLUG,
      name: SCOREBAT_PROVIDER_NAME,
      enabled: runtime.enabled,
      killSwitch: runtime.killSwitch,
      rateLimitPerMinute: 20,
      timeoutMs: runtime.timeoutMs,
      allowedDomains: [...SCOREBAT_ALLOWED_EMBED_HOSTS],
      ...overrides,
    };
  }

  async discoverEvents(): Promise<ProviderEvent[]> {
    if (this.config.killSwitch || !this.config.enabled) return [];
    if (isScoreBatDiscoveryPaused()) return [];

    const discovered = await discoverScoreBatMatches({
      useFixtures: process.env.SPORTS_SCOREBAT_USE_FIXTURES === "1",
      maxItems: Number(process.env.SPORTS_SCOREBAT_MAX_ITEMS || 100),
      timeoutMs: this.config.timeoutMs,
      allowLive: false, // import CLI opts into live explicitly
    });
    if (!discovered.supported) return [];

    const { accepted } = mapScoreBatMatches(discovered.items, {
      maxItems: discovered.items.length,
    });

    return accepted.map((m) => ({
      externalId: m.providerNativeId,
      title: m.title,
      startsAt: m.startsAt,
      sportSlug: "football",
      competitionExternalId: m.competitionSlug || undefined,
      metadata: {
        lifecycle: m.lifecycle,
        videoClass: m.videoClass,
        homeTeam: m.homeTeam?.name,
        awayTeam: m.awayTeam?.name,
        // Never put embed HTML in event metadata exposed to browse.
        hasEmbed: Boolean(m.embedUrl),
        thumbnailUrl: m.thumbnailUrl,
      },
    }));
  }

  async discoverChannels(): Promise<ProviderChannel[]> {
    return [
      {
        externalId: "scorebat-football",
        name: "ScoreBat Football",
        officialUrl: "https://www.scorebat.com/",
        metadata: {
          rightsClassification: "official_embed_allowed",
          auditDoc: "docs/sports/providers/scorebat-audit.md",
          primarySport: "football",
        },
      },
    ];
  }

  async discoverVideos(): Promise<ProviderVideo[]> {
    const events = await this.discoverEvents();
    return events.map((e) => ({
      externalId: e.externalId,
      title: e.title,
      videoType: String(e.metadata?.videoClass || "other"),
      metadata: {
        startsAt: e.startsAt,
        lifecycle: e.metadata?.lifecycle,
        hasEmbed: e.metadata?.hasEmbed,
      },
    }));
  }

  async normalizeMetadata(): Promise<NormalizedSportsItem[]> {
    const [channels, events] = await Promise.all([
      this.discoverChannels(),
      this.discoverEvents(),
    ]);
    return [
      ...channels.map((c) => ({
        kind: "channel" as const,
        externalId: c.externalId,
        title: c.name,
        payload: c.metadata || {},
      })),
      ...events.map((e) => ({
        kind: "event" as const,
        externalId: e.externalId,
        title: e.title,
        payload: e.metadata || {},
      })),
    ];
  }

  async getTerritories(): Promise<TerritoryRule[]> {
    // Territory inherited from each publisher embed — metadata-only worldwide.
    return [
      {
        countryCode: "ZZ",
        availability: "metadata_only",
        accessType: "external",
      },
    ];
  }

  async verifyAvailability(input: VerifyInput): Promise<VerificationResult> {
    if (this.config.killSwitch || !this.config.enabled) {
      return { ok: false, reasons: ["provider_disabled"] };
    }
    if (!input.externalId) {
      return { ok: false, reasons: ["missing_external_id"] };
    }
    return { ok: true, reasons: [] };
  }

  async resolvePlayback(input: ResolveInput): Promise<PlaybackResult> {
    this.assertEnabled();
    const runtime = getScoreBatRuntimeConfig();
    const result = resolveScoreBatPlayback({
      broadcastId: input.externalId,
      embedUrlOrHtml: null,
      providerEnabled: this.config.enabled,
      providerKillSwitch: this.config.killSwitch,
      playbackFlagEnabled: runtime.playbackEnabled,
    });
    if (!result.ok) {
      throw new Error(result.message);
    }
    return {
      mode: "embedded",
      payload: {
        embedUrl: result.payload,
        mode: result.mode,
        provider: "scorebat",
      },
    };
  }
}

export function createScoreBatAdapter(
  overrides?: Partial<SportsProviderConfig>
): ScoreBatProviderAdapter {
  return new ScoreBatProviderAdapter(overrides);
}
