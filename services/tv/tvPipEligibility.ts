/**
 * Pure TV Picture-in-Picture eligibility and start-gate helpers.
 * PiP belongs only to the native TV surface — never Radio/music owners.
 */

export type TvPipSurface = "native" | "webview";

export type TvPipPlayerStatus =
  | "idle"
  | "loading"
  | "readyToPlay"
  | "playing"
  | "paused"
  | "error";

export type CanUseTvPiPInput = {
  platform: string;
  sourceUri?: string | null;
  surface: TvPipSurface;
  playerStatus: TvPipPlayerStatus;
  isAudioOnly?: boolean;
  isNativeSurfaceMounted: boolean;
  hasFatalError?: boolean;
  sessionActive?: boolean;
};

export type TvPipStartGate = {
  inFlight: boolean;
  sessionActive: boolean;
  eligible: boolean;
  disposed: boolean;
};

export type TvPipRejectKind =
  | "unsupported"
  | "not_ready"
  | "stale_session"
  | "in_flight"
  | "disposed"
  | "rejected";

const AUDIO_ONLY_HINT =
  /(audio[_\s-]?only|audio\/(mpeg|mp4|aac|ogg)|icecast|shoutcast)/i;

/**
 * Conservative URI classification for eligibility only.
 * Does not rewrite stream URLs. Does not mark every HTTPS URL eligible.
 */
export function classifyTvPipSource(sourceUri?: string | null): {
  hasSource: boolean;
  looksAudioOnly: boolean;
  looksWebEmbed: boolean;
  looksNativeVideo: boolean;
} {
  const uri = String(sourceUri || "").trim();
  if (!uri) {
    return {
      hasSource: false,
      looksAudioOnly: false,
      looksWebEmbed: false,
      looksNativeVideo: false,
    };
  }

  const looksWebEmbed =
    /youtube\.com|youtu\.be|vimeo\.com|player\.vimeo|iframe|embed/i.test(uri) ||
    /^about:blank/i.test(uri);

  const looksAudioOnly =
    AUDIO_ONLY_HINT.test(uri) ||
    /\.(mp3|aac|ogg|opus|m4a)(?:\?|$)/i.test(uri);

  const looksNativeVideo =
    /\.m3u8(?:\?|$)/i.test(uri) ||
    /\.mp4(?:\?|$)/i.test(uri) ||
    (/^https?:\/\//i.test(uri) && !looksWebEmbed && !looksAudioOnly);

  return {
    hasSource: true,
    looksAudioOnly,
    looksWebEmbed,
    looksNativeVideo,
  };
}

export function canUseTvPiP(input: CanUseTvPiPInput): boolean {
  const platform = String(input.platform || "").toLowerCase();
  if (platform !== "ios" && platform !== "android") {
    return false;
  }

  if (!input.isNativeSurfaceMounted) return false;
  if (input.surface !== "native") return false;
  if (input.sessionActive === false) return false;
  if (input.hasFatalError) return false;
  if (input.isAudioOnly) return false;

  const status = input.playerStatus;
  if (status === "error" || status === "idle" || status === "loading") {
    return false;
  }
  if (status !== "readyToPlay" && status !== "playing" && status !== "paused") {
    return false;
  }

  const classified = classifyTvPipSource(input.sourceUri);
  if (!classified.hasSource) return false;
  if (classified.looksAudioOnly) return false;
  if (classified.looksWebEmbed) return false;
  if (!classified.looksNativeVideo) return false;

  return true;
}

/**
 * Duplicate / stale start requests must be ignored before calling native PiP.
 */
export function shouldAcceptTvPiPStart(gate: TvPipStartGate): {
  accept: boolean;
  reason?: TvPipRejectKind;
} {
  if (gate.disposed) return { accept: false, reason: "disposed" };
  if (!gate.sessionActive) return { accept: false, reason: "stale_session" };
  if (gate.inFlight) return { accept: false, reason: "in_flight" };
  if (!gate.eligible) return { accept: false, reason: "not_ready" };
  return { accept: true };
}

export function classifyTvPipRejection(error: unknown): TvPipRejectKind {
  const message = String(
    error instanceof Error ? error.message : error || ""
  ).toLowerCase();
  if (
    message.includes("unsupported") ||
    message.includes("not supported") ||
    message.includes("picture in picture")
  ) {
    return "unsupported";
  }
  if (message.includes("not ready") || message.includes("ready")) {
    return "not_ready";
  }
  return "rejected";
}

export function resolveTvPipUserMessage(kind: TvPipRejectKind): string {
  switch (kind) {
    case "unsupported":
      return "PiP unavailable on this device";
    case "not_ready":
      return "Player not ready for PiP yet";
    case "stale_session":
    case "disposed":
      return "TV session ended";
    case "in_flight":
      return "";
    case "rejected":
    default:
      return "PiP unavailable on this device";
  }
}

/**
 * PiP failures must never own or replace the TV stream error surface.
 */
export function shouldReplaceTvStreamErrorWithPipError(): false {
  return false;
}

/**
 * Source switches replace media on the existing TV player identity.
 * Radio / music owners are intentionally never referenced here.
 */
export function resolveTvPlayerReusePolicy(input: {
  previousSessionId: number;
  nextSessionId: number;
  sameSession: boolean;
}): "reuse_existing_player" | "new_session_player" {
  if (input.sameSession && input.previousSessionId === input.nextSessionId) {
    return "reuse_existing_player";
  }
  return "new_session_player";
}
