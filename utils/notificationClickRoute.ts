import { getNowPlayingSnapshot } from "./nowPlayingStore";

const APP_SCHEME = "hiddentunes";

export type NotificationClickTarget = "/music-feed";

export function resolveNotificationClickRoute(): NotificationClickTarget {
  const { currentSongId, isPlaying } = getNowPlayingSnapshot();

  if (currentSongId || isPlaying) {
    return "/music-feed";
  }

  return "/music-feed";
}

export function isNotificationClickPath(path: string): boolean {
  if (!path) return false;

  const normalized = path.trim().toLowerCase();
  if (normalized.includes("notification.click")) {
    return true;
  }

  try {
    const url = new URL(path, `${APP_SCHEME}://`);
    return (
      url.host === "notification.click" ||
      url.pathname.replace(/^\//, "") === "notification.click"
    );
  } catch {
    return false;
  }
}
