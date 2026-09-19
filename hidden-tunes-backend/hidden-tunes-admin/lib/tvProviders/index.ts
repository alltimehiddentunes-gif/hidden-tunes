import type { ResolveTvPlaybackInput, ResolvedTvPlayback } from "./types";
import { resolvePlutoPlayback } from "./pluto/resolver";

export async function resolveTvPlayback(input: ResolveTvPlaybackInput): Promise<ResolvedTvPlayback> {
  if (input.provider === "pluto") {
    return resolvePlutoPlayback(input.providerChannelId, input.region ?? null);
  }
  throw new Error(`Unsupported TV playback provider: ${String(input.provider)}`);
}

export type { ResolveTvPlaybackInput, ResolvedTvPlayback, TvValidationState } from "./types";

