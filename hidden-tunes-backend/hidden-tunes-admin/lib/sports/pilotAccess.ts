/**
 * Private Sports pilot access — never enables public Sports globally.
 * Header: X-Hidden-Tunes-Sports-Pilot
 * Secret: SPORTS_PRIVATE_PILOT_TOKEN (server-only; never EXPO_PUBLIC in prod builds)
 */

import { timingSafeEqual } from "node:crypto";

export const SPORTS_PRIVATE_PILOT_HEADER = "x-hidden-tunes-sports-pilot";

function readConfiguredToken(): string {
  return String(process.env.SPORTS_PRIVATE_PILOT_TOKEN || "").trim();
}

export function isSportsPrivatePilotConfigured(): boolean {
  return readConfiguredToken().length >= 16;
}

/**
 * Timing-safe comparison of the pilot header against the server secret.
 * Ordinary requests without the header remain disabled when sports_enabled is false.
 */
export function isSportsPrivatePilotRequest(request: Request): boolean {
  const expected = readConfiguredToken();
  if (expected.length < 16) return false;

  const provided = String(
    request.headers.get(SPORTS_PRIVATE_PILOT_HEADER) ||
      request.headers.get("X-Hidden-Tunes-Sports-Pilot") ||
      ""
  ).trim();
  if (!provided || provided.length !== expected.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(provided, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

export type SportsBrowseAccess = {
  /** Browse/playback APIs may return Sports data. */
  enabled: boolean;
  /** True only when access came from a valid private pilot header. */
  privatePilot: boolean;
};

export async function resolveSportsBrowseAccess(
  request: Request,
  isPubliclyEnabled: () => Promise<boolean>
): Promise<SportsBrowseAccess> {
  if (isSportsPrivatePilotRequest(request)) {
    return { enabled: true, privatePilot: true };
  }
  const publicOn = await isPubliclyEnabled();
  return { enabled: publicOn, privatePilot: false };
}
