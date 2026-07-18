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
import {
  buildOlympicsEmbedUrl,
  buildOlympicsWatchUrl,
  discoverOlympicsVideos,
  isOlympicsAllowedHost,
} from "./client";
import { evaluateOlympicsVideoRights } from "./rights";
import { getOlympicsTerritoryRules } from "./territories";
import { mapOlympicsVideos } from "./mapper";
import {
  OLYMPICS_ALLOWED_HOSTS,
  OLYMPICS_PROVIDER_SLUG,
  OLYMPICS_YOUTUBE_CHANNEL_ID,
} from "./types";
import { verifyTechnicalSafety } from "../../verification/engine";

export class OlympicsProviderAdapter extends BaseSportsProviderAdapter {
  readonly config: SportsProviderConfig = {
    slug: OLYMPICS_PROVIDER_SLUG,
    name: "Olympics (Official YouTube)",
    // Defaults off — admin/env must explicitly enable for local pilot.
    enabled: false,
    killSwitch: true,
    rateLimitPerMinute: 30,
    timeoutMs: 15_000,
    allowedDomains: [...OLYMPICS_ALLOWED_HOSTS],
  };

  constructor(overrides?: Partial<SportsProviderConfig>) {
    super();
    this.config = { ...this.config, ...overrides };
  }

  async discoverEvents(): Promise<ProviderEvent[]> {
    // Olympics YouTube pilot is video/highlight oriented in Phase 2A.
    return [];
  }

  async discoverChannels(): Promise<ProviderChannel[]> {
    return [
      {
        externalId: OLYMPICS_YOUTUBE_CHANNEL_ID,
        name: "Olympics",
        officialUrl: "https://www.youtube.com/@Olympics",
        metadata: {
          handle: "@Olympics",
          rightsClassification: "official_embed_only",
          auditDoc: "docs/sports/providers/olympics-audit.md",
        },
      },
    ];
  }

  async discoverVideos(): Promise<ProviderVideo[]> {
    const discovered = await discoverOlympicsVideos({
      useFixtures: process.env.SPORTS_OLYMPICS_USE_FIXTURES === "1",
      maxResults: Number(process.env.SPORTS_OLYMPICS_LIMIT || 20),
      timeoutMs: this.config.timeoutMs,
    });

    if (!discovered.supported) {
      return [];
    }

    const { accepted } = mapOlympicsVideos(discovered.items);
    return accepted.map((item) => ({
      externalId: item.providerNativeId,
      title: item.title,
      videoType: item.videoType,
      metadata: {
        canonicalKey: item.canonicalKey,
        rights: item.rights.classification,
        playbackMode: item.rights.playbackMode,
        embedUrl: item.embedUrl,
        watchUrl: item.watchUrl,
        artworkUrl: item.artworkUrl,
        publishable: item.rights.publishable,
        playablePublic: item.rights.playablePublic,
        isFixture: item.isFixture,
      },
    }));
  }

  async normalizeMetadata(): Promise<NormalizedSportsItem[]> {
    const videos = await this.discoverVideos();
    const channel = await this.discoverChannels();
    return [
      ...channel.map((c) => ({
        kind: "channel" as const,
        externalId: c.externalId,
        title: c.name,
        payload: c.metadata || {},
      })),
      ...videos.map((v) => ({
        kind: "video" as const,
        externalId: v.externalId,
        title: v.title,
        payload: v.metadata || {},
      })),
    ];
  }

  async getTerritories(): Promise<TerritoryRule[]> {
    return getOlympicsTerritoryRules();
  }

  async verifyAvailability(input: VerifyInput): Promise<VerificationResult> {
    const videoId = String(input.externalId || "").trim();
    if (!videoId) {
      return { ok: false, reasons: ["missing_external_id"] };
    }

    if (videoId.startsWith("olympics_phase2a_fixture_")) {
      return { ok: true, reasons: ["phase2a_fixture_skip_network"] };
    }

    const embedUrl = buildOlympicsEmbedUrl(videoId);
    const safety = verifyTechnicalSafety({
      url: embedUrl,
      allowedDomains: [...OLYMPICS_ALLOWED_HOSTS],
      httpsRequired: true,
    });

    if (!safety.pass) {
      return { ok: false, reasons: safety.reasons };
    }

    if (safety.hostname && !isOlympicsAllowedHost(safety.hostname)) {
      return { ok: false, reasons: ["host_not_allowlisted"] };
    }

    return { ok: true, reasons: ["embed_host_allowlisted"] };
  }

  async resolvePlayback(input: ResolveInput): Promise<PlaybackResult> {
    if (this.config.killSwitch || !this.config.enabled) {
      throw new Error("Olympics provider is disabled (kill switch).");
    }

    const videoId = String(input.externalId || "").trim();
    if (!videoId) {
      throw new Error("Missing Olympics video id.");
    }

    // Synthetic rights check from id shape — importer stores real decisions in DB.
    const synthetic = evaluateOlympicsVideoRights({
      videoId,
      title: videoId,
      description: "",
      publishedAt: new Date().toISOString(),
      channelId: OLYMPICS_YOUTUBE_CHANNEL_ID,
      channelTitle: "Olympics",
      thumbnailUrl: null,
      durationIso: null,
      embeddable: !videoId.includes("embed_disabled"),
      privacyStatus: "public",
      liveBroadcastContent: "none",
      tags: [],
    });

    if (synthetic.playbackMode === "official_embed") {
      return {
        mode: "embedded",
        payload: {
          provider: OLYMPICS_PROVIDER_SLUG,
          playbackMode: "official_embed",
          embedUrl: buildOlympicsEmbedUrl(videoId),
          fallbackUrl: buildOlympicsWatchUrl(videoId),
          expiresAt: null,
        },
      };
    }

    return {
      mode: "external",
      payload: {
        provider: OLYMPICS_PROVIDER_SLUG,
        playbackMode: "external_only",
        deepLink: buildOlympicsWatchUrl(videoId),
        fallbackUrl: buildOlympicsWatchUrl(videoId),
        accessType: "free",
      },
    };
  }
}

export function createOlympicsAdapter(
  overrides?: Partial<SportsProviderConfig>
) {
  return new OlympicsProviderAdapter(overrides);
}
