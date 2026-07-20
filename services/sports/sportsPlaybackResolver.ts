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

export function isSportsResolveAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = String((error as { name?: string }).name || "");
  if (name === "AbortError") return true;
  const message = String((error as { message?: string }).message || "");
  return /aborted|AbortError|The operation was aborted/i.test(message);
}

/**
 * Pure latest-tap-wins gate for Sports player resolve commits.
 * Used by the player route and unit-tested without React.
 */
export function shouldCommitSportsResolve(input: {
  generation: number;
  currentGeneration: number;
  fixtureId: string;
  activeFixtureId: string;
  aborted: boolean;
  mounted: boolean;
}): boolean {
  if (!input.mounted) return false;
  if (input.aborted) return false;
  if (input.generation !== input.currentGeneration) return false;
  if (input.fixtureId !== input.activeFixtureId) return false;
  return true;
}

export async function resolveSportsPlayback(
  input: SportsResolveInput
): Promise<
  | { ok: true; playback: SportsPlaybackResult }
  | { ok: false; code: string; message: string; aborted?: boolean }
> {
  try {
    if (input.signal?.aborted) {
      return {
        ok: false,
        code: "ABORTED",
        message: "Playback request was cancelled.",
        aborted: true,
      };
    }
    const result = await resolveSportsBroadcastPlayback(input);
    if (input.signal?.aborted) {
      return {
        ok: false,
        code: "ABORTED",
        message: "Playback request was cancelled.",
        aborted: true,
      };
    }
    if (!result.success || !result.playback) {
      return {
        ok: false,
        code: result.code || "NO_AUTHORIZED_SOURCE",
        message: result.error || "Unable to resolve Sports playback.",
      };
    }
    return { ok: true, playback: result.playback };
  } catch (error) {
    if (isSportsResolveAbortError(error) || input.signal?.aborted) {
      return {
        ok: false,
        code: "ABORTED",
        message: "Playback request was cancelled.",
        aborted: true,
      };
    }
    return {
      ok: false,
      code: "RESOLVE_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Unable to resolve Sports playback.",
    };
  }
}
