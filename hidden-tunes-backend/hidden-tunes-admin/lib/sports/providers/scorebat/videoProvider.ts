/**
 * ScoreBat SportsVideoProvider pilot.
 *
 * Entitlement posture (honest):
 * - Free Video API (`/free-feed/`) supplies football highlights embeds — NOT confirmed live match streams.
 * - `/live-streams/` requires paid entitlement; do not force live_in_app without proof.
 * - This adapter classifies content as highlights unless live entitlement is explicitly confirmed.
 */

import {
  getScoreBatRuntimeConfig,
  hasScoreBatToken,
  SCOREBAT_PROVIDER_SLUG,
} from "./config";
import { validateScoreBatEmbed } from "./embedSafety";
import {
  getScoreBatHealth,
  isScoreBatDiscoveryPaused,
} from "./health";
import { resolveScoreBatPlayback } from "./playback";
import type {
  ProviderBroadcast,
  ProviderHealth,
  ProviderPlaybackSession,
  SportsVideoProvider,
} from "../videoProvider";
import { validateSportsBroadcast } from "../../playback/validateBroadcast";
import type { ValidationResult } from "../../playback/validateBroadcast";

export type ScoreBatEntitlementReport = {
  provider: "scorebat";
  accountTier: "unknown" | "free_feed" | "live_streams" | "absent_token";
  liveEntitlementConfirmed: boolean;
  commercialUseConfirmed: boolean;
  embedPermitted: boolean;
  mobileSupported: boolean;
  territories: string;
  quota: string;
  contentClass: "highlights" | "live" | "unknown";
  notes: string[];
};

/**
 * Static entitlement assessment without calling ScoreBat with secrets in logs.
 * Live confirmation requires an explicit env override after account verification.
 */
export function assessScoreBatEntitlement(): ScoreBatEntitlementReport {
  const token = hasScoreBatToken();
  const liveConfirmed =
    process.env.SPORTS_SCOREBAT_LIVE_ENTITLEMENT_CONFIRMED === "true" ||
    process.env.SPORTS_SCOREBAT_LIVE_ENTITLEMENT_CONFIRMED === "1";
  const commercialConfirmed =
    process.env.SPORTS_SCOREBAT_COMMERCIAL_USE_CONFIRMED === "true" ||
    process.env.SPORTS_SCOREBAT_COMMERCIAL_USE_CONFIRMED === "1";

  const notes: string[] = [];
  if (!token) {
    notes.push("SCOREBAT_API_TOKEN absent — discovery uses local fixtures only.");
  }
  if (!liveConfirmed) {
    notes.push(
      "Live streams not confirmed. Treating ScoreBat as highlights provider."
    );
  }
  if (!commercialConfirmed) {
    notes.push(
      "Commercial-app permission not confirmed via SPORTS_SCOREBAT_COMMERCIAL_USE_CONFIRMED."
    );
  }

  return {
    provider: "scorebat",
    accountTier: !token
      ? "absent_token"
      : liveConfirmed
        ? "live_streams"
        : "free_feed",
    liveEntitlementConfirmed: liveConfirmed,
    commercialUseConfirmed: commercialConfirmed,
    embedPermitted: true,
    mobileSupported: true,
    territories: "provider-dependent; apply country allow/block lists per asset",
    quota: "respect ScoreBat rate limits; bounded workers only",
    contentClass: liveConfirmed ? "live" : "highlights",
    notes,
  };
}

export function createScoreBatVideoProvider(
  over: {
    /** In-memory asset store for pilot / tests */
    assets?: Map<string, ProviderBroadcast>;
  } = {}
): SportsVideoProvider {
  const assets = over.assets ?? new Map<string, ProviderBroadcast>();

  return {
    providerId: SCOREBAT_PROVIDER_SLUG,

    async discoverLiveBroadcasts(input) {
      const entitlement = assessScoreBatEntitlement();
      const cfg = getScoreBatRuntimeConfig();
      if (!cfg.enabled || cfg.killSwitch || !cfg.discoveryEnabled) {
        return [];
      }

      const found: ProviderBroadcast[] = [];
      for (const asset of assets.values()) {
        if (asset.fixtureId !== input.fixtureId) continue;
        if (
          input.providerFixtureId &&
          asset.providerFixtureId &&
          asset.providerFixtureId !== input.providerFixtureId
        ) {
          continue;
        }
        // Do not promote highlights to live_match without entitlement.
        if (
          asset.broadcastType === "live_match" &&
          !entitlement.liveEntitlementConfirmed
        ) {
          found.push({
            ...asset,
            broadcastType: "highlights",
            metadata: {
              ...(asset.metadata || {}),
              demotedFromLive: true,
              reason: "live_entitlement_unconfirmed",
            },
          });
        } else {
          found.push(asset);
        }
      }
      return found;
    },

    async validatePlayback(input) {
      const asset = assets.get(input.providerAssetId);
      if (!asset) {
        return {
          status: "failed",
          healthScore: 0,
          reason: "asset_not_found",
          checkedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        } satisfies ValidationResult;
      }

      const cfg = getScoreBatRuntimeConfig();
      const embedCheck = validateScoreBatEmbed(
        String(asset.embedUrlOrHtml || "")
      );

      return validateSportsBroadcast({
        providerId: SCOREBAT_PROVIDER_SLUG,
        providerEnabled: cfg.enabled,
        providerKillSwitch: cfg.killSwitch,
        providerStatus: isScoreBatDiscoveryPaused() ? "degraded" : "healthy",
        providerAssetId: input.providerAssetId,
        playbackKind: asset.playbackKind,
        embedUrlOrHtml: asset.embedUrlOrHtml,
        isOfficial: asset.isOfficial,
        isEmbeddable: asset.isEmbeddable !== false,
        mobileSupported: asset.mobileSupported !== false,
        webSupported: asset.webSupported !== false,
        requiresSubscription: asset.requiresSubscription,
        countryAllowlist: asset.countryAllowlist,
        countryBlocklist: asset.countryBlocklist,
        fixtureId: asset.fixtureId,
        expectedFixtureId: input.fixtureId,
        countryCode: input.countryCode,
        platform: input.platform,
        assetProof: {
          exists: embedCheck.ok,
          embedContractOk: embedCheck.ok,
          reason: embedCheck.ok ? undefined : embedCheck.reason,
        },
        endsAt: null, // highlights
      });
    },

    async createPlaybackSession(input) {
      const asset = assets.get(input.providerAssetId);
      if (!asset) {
        throw new Error("ScoreBat asset not found");
      }
      const cfg = getScoreBatRuntimeConfig();
      const resolved = resolveScoreBatPlayback({
        broadcastId: input.providerAssetId,
        fixtureId: input.fixtureId,
        embedUrlOrHtml: asset.embedUrlOrHtml,
        providerEnabled: cfg.enabled,
        providerKillSwitch: cfg.killSwitch,
        playbackFlagEnabled: cfg.playbackEnabled,
      });
      if (!resolved.ok) {
        throw new Error(resolved.message);
      }
      const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
      return {
        providerAssetId: input.providerAssetId,
        playbackKind: "webview",
        sessionPayload: resolved.payload,
        expiresAt,
      } satisfies ProviderPlaybackSession;
    },

    async healthCheck() {
      const h = getScoreBatHealth();
      const cfg = getScoreBatRuntimeConfig();
      if (cfg.killSwitch || !cfg.enabled) {
        return { status: "disabled" } satisfies ProviderHealth;
      }
      if (isScoreBatDiscoveryPaused()) {
        return {
          status: "degraded",
          consecutiveFailures: h.consecutiveFailures,
          details: { paused: true },
        };
      }
      return {
        status: h.consecutiveFailures >= 3 ? "degraded" : "healthy",
        consecutiveFailures: h.consecutiveFailures,
        successRate: h.playbackSuccessRate,
      };
    },
  };
}

/** Register a pilot asset into an in-memory provider (tests / dry-run). */
export function registerScoreBatPilotAsset(
  provider: SportsVideoProvider,
  asset: ProviderBroadcast,
  store: Map<string, ProviderBroadcast>
): void {
  store.set(asset.providerAssetId, asset);
  void provider;
}
