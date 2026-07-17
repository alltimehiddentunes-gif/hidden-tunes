/**
 * Map between legacy mode playback and tap-to-watch session DTO.
 */
import type {
  SportsPlaybackResult,
  SportsPlaybackSession,
} from "../../types/sports";

export function sessionFromLegacyPlayback(
  fixtureId: string,
  title: string,
  playback: SportsPlaybackResult
): SportsPlaybackSession {
  if (playback.mode === "embedded") {
    return {
      status: "ready",
      fixtureId,
      playbackKind: "embed",
      playbackToken: `legacy-embed-${fixtureId}`,
      expiresAt: playback.expiresAt,
      title,
      providerLabel: playback.provider,
      embedUrl: playback.embedUrl,
    };
  }
  if (playback.mode === "native") {
    return {
      status: "ready",
      fixtureId,
      playbackKind: "hls",
      playbackToken: `legacy-native-${fixtureId}`,
      expiresAt: playback.expiresAt,
      title,
      manifestUrl: playback.manifestUrl,
    };
  }
  return {
    status: "external",
    fixtureId,
    officialUrl: playback.fallbackUrl || playback.deepLink || "",
    providerLabel: playback.provider || "Official provider",
  };
}

export function legacyFromSession(
  session: SportsPlaybackSession
): SportsPlaybackResult | null {
  if (session.status === "ready") {
    if (session.playbackKind === "hls" || session.playbackKind === "dash") {
      if (!session.manifestUrl) return null;
      return {
        mode: "native",
        manifestUrl: session.manifestUrl,
        expiresAt: session.expiresAt,
        headers: {},
        drm: null,
        heartbeatInterval: 30,
      };
    }
    if (session.embedUrl) {
      return {
        mode: "embedded",
        provider: session.providerLabel || "sports",
        embedUrl: session.embedUrl,
        expiresAt: session.expiresAt,
      };
    }
    return null;
  }
  if (session.status === "external") {
    return {
      mode: "external",
      provider: session.providerLabel,
      deepLink: null,
      fallbackUrl: session.officialUrl,
      accessType: "free",
    };
  }
  if (session.status === "subscription_required") {
    return {
      mode: "external",
      provider: session.providerLabel,
      deepLink: null,
      fallbackUrl: session.officialUrl || "",
      accessType: "subscription",
    };
  }
  return null;
}

export function unavailableSession(
  fixtureId: string,
  reason: Extract<SportsPlaybackSession, { status: "unavailable" }>["reason"],
  message?: string
): SportsPlaybackSession {
  return { status: "unavailable", fixtureId, reason, message };
}
