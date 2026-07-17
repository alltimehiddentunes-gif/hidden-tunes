/**
 * Sports playback resolver — client side.
 * Resolves only after user tap. Does not touch PlayerContext / TV session.
 */

import { resolveSportsBroadcastPlayback } from "./sportsApiClient";
import type { SportsPlaybackResult } from "../../types/sports";

export type SportsResolveInput = {
  broadcastId: string;
  platform: "ios" | "android" | "desktop" | "web" | "smart_tv";
  country: string;
  deviceId?: string;
  appVersion?: string;
  signal?: AbortSignal;
};

export async function resolveSportsPlayback(
  input: SportsResolveInput
): Promise<
  | { ok: true; playback: SportsPlaybackResult }
  | { ok: false; code: string; message: string }
> {
  const result = await resolveSportsBroadcastPlayback(input);
  if (!result.success || !result.playback) {
    return {
      ok: false,
      code: result.code || "NO_AUTHORIZED_SOURCE",
      message: result.error || "Unable to resolve Sports playback.",
    };
  }
  return { ok: true, playback: result.playback };
}
