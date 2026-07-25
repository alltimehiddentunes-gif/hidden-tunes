/**
 * Imperative TV transport surface for lock-screen / car remote commands.
 * Routes through the single TvPlaybackProvider owner — never invents a second player.
 */

import { getTvSessionController } from "./tvSessionController";
import { logTvMediaSessionDiag } from "./tvMediaSessionDiagnostics";

export type TvRemoteTransportCommand =
  | "play"
  | "pause"
  | "toggle"
  | "next"
  | "previous"
  | "stop";

export function dispatchTvRemoteTransportCommand(
  command: TvRemoteTransportCommand
): boolean {
  const api = getTvSessionController();
  if (!api?.isSessionActive()) {
    return false;
  }

  switch (command) {
    case "play":
      logTvMediaSessionDiag("tv_remote_play_received");
      api.setPlaying?.(true);
      return true;
    case "pause":
      logTvMediaSessionDiag("tv_remote_pause_received");
      api.setPlaying?.(false);
      return true;
    case "toggle":
      if (api.isPlaying?.()) {
        logTvMediaSessionDiag("tv_remote_pause_received", { via: "toggle" });
        api.setPlaying?.(false);
      } else {
        logTvMediaSessionDiag("tv_remote_play_received", { via: "toggle" });
        api.setPlaying?.(true);
      }
      return true;
    case "next":
      if (!api.canGoNext?.()) return false;
      logTvMediaSessionDiag("tv_remote_next_received");
      api.nextChannel?.();
      return true;
    case "previous":
      if (!api.canGoPrevious?.()) return false;
      logTvMediaSessionDiag("tv_remote_previous_received");
      api.previousChannel?.();
      return true;
    case "stop":
      logTvMediaSessionDiag("tv_remote_stop_received");
      api.stopSession();
      return true;
    default:
      return false;
  }
}
