import type { PlaybackContentKind } from "./PlaybackHandoffCoordinator";

type InferInput = {
  queueContextSource?: string | null;
  queueMode?: string | null;
  songSource?: string | null;
  songType?: string | null;
  songId?: string | null;
};

/**
 * Best-effort content-kind label for diagnostics / UI — not a separate engine.
 */
export function inferSharedAudioContentKind(
  input: InferInput
): PlaybackContentKind {
  const source = String(input.queueContextSource || "").toLowerCase();
  const mode = String(input.queueMode || "").toLowerCase();
  const songSource = String(input.songSource || "").toLowerCase();
  const songType = String(input.songType || "").toLowerCase();
  const songId = String(input.songId || "").toLowerCase();

  if (
    mode === "live_stream" ||
    songSource === "radio" ||
    songType === "live_stream" ||
    songId.startsWith("radio-") ||
    source.includes("radio")
  ) {
    return "radio";
  }

  if (
    source.includes("podcast") ||
    songSource.includes("podcast") ||
    songType.includes("podcast") ||
    songId.startsWith("podcast-")
  ) {
    return "podcast";
  }

  if (
    source.includes("audiobook") ||
    songSource.includes("audiobook") ||
    songType.includes("audiobook") ||
    songId.startsWith("audiobook-")
  ) {
    return "audiobook";
  }

  if (
    source.includes("lecture") ||
    source.includes("educational") ||
    songSource.includes("lecture") ||
    songId.startsWith("lecture-") ||
    songId.startsWith("educational-")
  ) {
    return "lecture";
  }

  if (
    source.includes("motivation") ||
    songSource.includes("motivation") ||
    songId.startsWith("motivation")
  ) {
    return "motivational";
  }

  return "music";
}
