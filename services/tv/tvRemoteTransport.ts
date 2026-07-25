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
    logTvMediaSessionDiag("remote_command_routed", {
      command,
      routed: false,
      reason: "tv_session_inactive",
    });
    return false;
  }

  switch (command) {
    case "play":
      logTvMediaSessionDiag("tv_remote_play_received");
      logTvMediaSessionDiag("remote_command_routed", {
        command: "play",
        routed: true,
        target: "tv_session",
      });
      api.setPlaying?.(true);
      return true;
    case "pause":
      logTvMediaSessionDiag("tv_remote_pause_received");
      logTvMediaSessionDiag("remote_command_routed", {
        command: "pause",
        routed: true,
        target: "tv_session",
      });
      api.setPlaying?.(false);
      return true;
    case "toggle":
      if (api.isPlaying?.()) {
        logTvMediaSessionDiag("tv_remote_pause_received", { via: "toggle" });
        logTvMediaSessionDiag("remote_command_routed", {
          command: "pause",
          routed: true,
          via: "toggle",
          target: "tv_session",
        });
        api.setPlaying?.(false);
      } else {
        logTvMediaSessionDiag("tv_remote_play_received", { via: "toggle" });
        logTvMediaSessionDiag("remote_command_routed", {
          command: "play",
          routed: true,
          via: "toggle",
          target: "tv_session",
        });
        api.setPlaying?.(true);
      }
      return true;
    case "next":
      if (!api.canGoNext?.()) {
        logTvMediaSessionDiag("remote_command_routed", {
          command: "next",
          routed: false,
          reason: "no_adjacent_station",
        });
        return false;
      }
      logTvMediaSessionDiag("tv_remote_next_received", {
        nextId: api.getActiveVideo?.()?.id,
        queueIndex: api.getQueueIndex?.(),
      });
      logTvMediaSessionDiag("remote_command_routed", {
        command: "next",
        routed: true,
        target: "tv_session",
      });
      api.nextChannel?.();
      return true;
    case "previous":
      if (!api.canGoPrevious?.()) {
        logTvMediaSessionDiag("remote_command_routed", {
          command: "previous",
          routed: false,
          reason: "no_adjacent_station",
        });
        return false;
      }
      logTvMediaSessionDiag("tv_remote_previous_received", {
        queueIndex: api.getQueueIndex?.(),
      });
      logTvMediaSessionDiag("remote_command_routed", {
        command: "previous",
        routed: true,
        target: "tv_session",
      });
      api.previousChannel?.();
      return true;
    case "stop":
      logTvMediaSessionDiag("tv_remote_stop_received");
      logTvMediaSessionDiag("remote_command_routed", {
        command: "stop",
        routed: true,
        target: "tv_session",
      });
      api.stopSession();
      return true;
    default:
      return false;
  }
}
