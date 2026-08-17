export type ListeningRoomRefreshDecision =
  | "fresh"
  | "preserve-cache-error"
  | "preserve-cache-empty"
  | "genuine-empty"
  | "error";

export function decideListeningRoomRefresh(input: {
  requestFailed: boolean;
  responseShapeRecognized: boolean;
  rawCount: number;
  playableCount: number;
  cachedCount: number;
}): ListeningRoomRefreshDecision {
  if (input.requestFailed || !input.responseShapeRecognized) {
    return input.cachedCount > 0 ? "preserve-cache-error" : "error";
  }

  if (input.rawCount > 0 && input.playableCount === 0) {
    return input.cachedCount > 0 ? "preserve-cache-error" : "error";
  }

  if (input.playableCount > 0) return "fresh";
  if (input.cachedCount > 0) return "preserve-cache-empty";
  return "genuine-empty";
}

export function shouldPersistListeningRoomRefresh(
  decision: ListeningRoomRefreshDecision
) {
  return decision === "fresh";
}
