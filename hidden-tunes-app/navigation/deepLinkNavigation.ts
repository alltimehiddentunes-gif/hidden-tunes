import * as Linking from "expo-linking";

import {
  isNotificationClickPath,
  resolveNotificationClickRoute,
} from "../utils/notificationClickRoute";
import { navigateToPlayerWithMerge, navigateToTabsWithMerge } from "./playerNavigation";

let deepLinkNavigationInstalled = false;

function navigateForNotificationClick() {
  const target = resolveNotificationClickRoute();

  if (target === "/(tabs)/player" || target === "/player") {
    navigateToPlayerWithMerge();
    return;
  }

  navigateToTabsWithMerge();
}

function handleDeepLinkUrl(url: string) {
  if (!url) return;

  if (isNotificationClickPath(url)) {
    navigateForNotificationClick();
  }
}

/** Install a fast lockscreen / notification tap handler using merge navigation. */
export function installNotificationDeepLinkNavigation() {
  if (deepLinkNavigationInstalled) return () => {};
  deepLinkNavigationInstalled = true;

  void Linking.getInitialURL().then((url) => {
    if (url) handleDeepLinkUrl(url);
  });

  const subscription = Linking.addEventListener("url", ({ url }) => {
    handleDeepLinkUrl(url);
  });

  return () => {
    subscription.remove();
    deepLinkNavigationInstalled = false;
  };
}
