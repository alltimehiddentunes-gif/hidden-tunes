import { SPORTS_PLATFORM_RIGHTS_FIELD } from "../constants";
import type {
  SportsPlatform,
  SportsPlaybackMode,
  SportsRightsGrant,
} from "../types";

export type RightsEvaluationInput = {
  grant: SportsRightsGrant | null;
  platform: SportsPlatform;
  now?: Date;
};

export type RightsEvaluationResult = {
  ok: boolean;
  code?:
    | "NO_RIGHTS_GRANT"
    | "RIGHTS_EXPIRED"
    | "RIGHTS_REVOKED"
    | "RIGHTS_PENDING"
    | "PLATFORM_NOT_ALLOWED"
    | "NATIVE_NOT_ALLOWED"
    | "EMBED_NOT_ALLOWED"
    | "EXTERNAL_NOT_ALLOWED";
  message: string;
  allowedModes: SportsPlaybackMode[];
};

function isWithinWindow(grant: SportsRightsGrant, now: Date): boolean {
  const from = new Date(grant.valid_from).getTime();
  const until = grant.valid_until
    ? new Date(grant.valid_until).getTime()
    : Number.POSITIVE_INFINITY;
  const t = now.getTime();
  return t >= from && t <= until;
}

export function evaluateSportsRights(
  input: RightsEvaluationInput
): RightsEvaluationResult {
  const now = input.now ?? new Date();
  const grant = input.grant;

  if (!grant) {
    return {
      ok: false,
      code: "NO_RIGHTS_GRANT",
      message: "No rights grant is attached to this content.",
      allowedModes: [],
    };
  }

  if (grant.evidence_status === "revoked") {
    return {
      ok: false,
      code: "RIGHTS_REVOKED",
      message: "Rights have been revoked.",
      allowedModes: [],
    };
  }

  if (grant.evidence_status === "pending" || grant.evidence_status === "rejected") {
    return {
      ok: false,
      code: "RIGHTS_PENDING",
      message: "Rights evidence is not approved.",
      allowedModes: [],
    };
  }

  if (grant.evidence_status === "expired" || !isWithinWindow(grant, now)) {
    return {
      ok: false,
      code: "RIGHTS_EXPIRED",
      message: "Rights grant is expired or outside its validity window.",
      allowedModes: [],
    };
  }

  if (grant.evidence_status !== "approved") {
    return {
      ok: false,
      code: "RIGHTS_PENDING",
      message: "Rights evidence status is not approved.",
      allowedModes: [],
    };
  }

  const platformField = SPORTS_PLATFORM_RIGHTS_FIELD[input.platform];
  if (!grant[platformField]) {
    return {
      ok: false,
      code: "PLATFORM_NOT_ALLOWED",
      message: `Platform ${input.platform} is not permitted by the rights grant.`,
      allowedModes: [],
    };
  }

  const allowedModes: SportsPlaybackMode[] = [];
  if (grant.native_playback_allowed) allowedModes.push("native");
  if (grant.embedding_allowed) allowedModes.push("embedded");
  if (grant.external_linking_allowed) allowedModes.push("external");

  if (allowedModes.length === 0) {
    return {
      ok: false,
      code: "EXTERNAL_NOT_ALLOWED",
      message: "No playback modes are permitted by the rights grant.",
      allowedModes: [],
    };
  }

  return {
    ok: true,
    message: "Rights grant permits playback.",
    allowedModes,
  };
}

export function selectPreferredPlaybackMode(
  allowedModes: SportsPlaybackMode[],
  source: {
    is_direct_play_allowed: boolean;
    is_embed_allowed: boolean;
    is_external_only: boolean;
  },
  flags: {
    nativeEnabled: boolean;
    embeddedEnabled: boolean;
    externalEnabled: boolean;
  }
): SportsPlaybackMode | null {
  if (source.is_external_only) {
    return allowedModes.includes("external") && flags.externalEnabled
      ? "external"
      : null;
  }

  const candidates: SportsPlaybackMode[] = ["native", "embedded", "external"];
  for (const mode of candidates) {
    if (!allowedModes.includes(mode)) continue;
    if (mode === "native" && (!flags.nativeEnabled || !source.is_direct_play_allowed)) {
      continue;
    }
    if (mode === "embedded" && (!flags.embeddedEnabled || !source.is_embed_allowed)) {
      continue;
    }
    if (mode === "external" && !flags.externalEnabled) continue;
    return mode;
  }
  return null;
}
