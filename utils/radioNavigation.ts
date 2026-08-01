import { BackHandler } from "react-native";

import { router } from "expo-router";

import { canRouterGoBack } from "./safeNavigation";
import {
  RADIO_EXIT_FALLBACK_ROUTE,
  RADIO_HOME_ROUTE,
  resolveRadioBackTarget,
  type RadioBackHref,
  type RadioNavigationOrigin,
} from "./radioBackTargets";

export {
  RADIO_EXIT_FALLBACK_ROUTE,
  RADIO_HOME_ROUTE,
  RADIO_SEARCH_ROUTE,
  isValidRadioCategoryId,
  resolveRadioBackTarget,
  type RadioBackHref,
  type RadioNavigationOrigin,
} from "./radioBackTargets";

/**
 * Explicit Radio back — always replace so child routes do not remain on the stack.
 */
export function navigateRadioToParent(target: RadioBackHref): void {
  if (typeof target === "string") {
    router.replace(target as never);
    return;
  }
  router.replace(target as never);
}

/**
 * Category / search / mature results → Radio Home in one tap.
 */
export function navigateRadioChildBack(): void {
  navigateRadioToParent(RADIO_HOME_ROUTE);
}

/**
 * Radio Home exit: prefer history (page that opened Radio), else Library.
 * Does not walk internal Radio browse history (children use replace).
 */
export function navigateRadioHomeBack(): void {
  if (canRouterGoBack()) {
    router.back();
    return;
  }
  router.replace(RADIO_EXIT_FALLBACK_ROUTE as never);
}

/**
 * Live-radio full player → originating category / search / Radio Home.
 */
export function navigateRadioPlayerBack(input?: {
  searchQuery?: string | null;
  railId?: string | null;
  origin?: RadioNavigationOrigin | null;
}): void {
  const target = resolveRadioBackTarget({
    screen: "player",
    searchQuery: input?.searchQuery,
    railId: input?.railId,
    origin: input?.origin,
  });
  navigateRadioToParent(target);
}

/**
 * Android hardware back → same logical parent as the visible Radio back button.
 * Returns an unsubscribe function.
 */
export function bindRadioHardwareBack(onBack: () => void): () => void {
  const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
    onBack();
    return true;
  });
  return () => subscription.remove();
}
