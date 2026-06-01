import {
  isNotificationClickPath,
  resolveNotificationClickRoute,
} from "../utils/notificationClickRoute";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    if (isNotificationClickPath(path)) {
      return resolveNotificationClickRoute();
    }

    return path;
  } catch {
    return "/music-feed";
  }
}
