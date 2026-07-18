import type { TvPlaybackContext } from "@/types/tv";

let activeSession: TvPlaybackContext | null = null;

export function setTvPlaybackSession(session: TvPlaybackContext) {
  activeSession = session;
}

export function getTvPlaybackSession() {
  return activeSession;
}

export function clearTvPlaybackSession() {
  activeSession = null;
}
