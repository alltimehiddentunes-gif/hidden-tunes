import { router } from "expo-router";

import { getTvSessionController } from "./tvSessionController";
import {
  reducePipRestoreIntent,
  shouldOpenTvPlayerRoute,
  type TvPipRestoreIntentState,
  type TvPlayerOpenReason,
} from "./tvPlayerNavigationContract";

let tvPlayerRouteFocused = false;
let restoreIntent: TvPipRestoreIntentState = "idle";

function logRestore(event: string, detail?: string) {
  if (!__DEV__) return;
  const safe = detail ? ` ${detail}` : "";
  console.log(`[HTTvPiPRestore] ${event}${safe}`);
}

export function setTvPlayerRouteFocused(focused: boolean) {
  if (tvPlayerRouteFocused === focused) return;
  tvPlayerRouteFocused = focused;
  logRestore("route-focused", String(focused));
}

export function isTvPlayerRouteFocused() {
  return tvPlayerRouteFocused;
}

export function getTvPipRestoreIntentState() {
  return restoreIntent;
}

function clearRestoreIntent(outcome: "completed" | "failed") {
  restoreIntent = reducePipRestoreIntent(
    restoreIntent,
    outcome === "completed" ? "restore_completed" : "restore_failed"
  );
  logRestore("restore-intent", restoreIntent);
}

/**
 * Singleton full-player entry. Never push a second `/tv-player`.
 * Prefer expanding the persistent host; navigate only when the route is absent.
 */
export function openTvPlayerFullScreen(reason: TvPlayerOpenReason): {
  ok: boolean;
  navigated: boolean;
  reusedRoute: boolean;
  rejectReason?: string;
} {
  const controller = getTvSessionController();
  const sessionActive = Boolean(controller?.isSessionActive());
  const presentationMode =
    controller?.getPresentationMode?.() || ("closed" as const);

  if (reason === "pip-restore") {
    restoreIntent = reducePipRestoreIntent(restoreIntent, "restore_requested");
    logRestore("restore-requested", `intent=${restoreIntent}`);
  }

  const decision = shouldOpenTvPlayerRoute({
    reason,
    sessionActive,
    routeIsTvPlayer: tvPlayerRouteFocused,
    presentationMode:
      presentationMode === "fullPlayer" ||
      presentationMode === "floating" ||
      presentationMode === "closed"
        ? presentationMode
        : "closed",
    restoreInFlight: restoreIntent === "handling",
  });

  if (!decision.setFullPresentation && decision.rejectReason === "no-session") {
    if (reason === "pip-restore") clearRestoreIntent("failed");
    logRestore("restore-rejected", decision.rejectReason);
    return {
      ok: false,
      navigated: false,
      reusedRoute: false,
      rejectReason: decision.rejectReason,
    };
  }

  if (reason === "pip-restore") {
    restoreIntent = reducePipRestoreIntent(restoreIntent, "restore_handling");
  }

  if (decision.setFullPresentation) {
    controller?.setPresentationMode("fullPlayer");
    logRestore("presentation", "fullPlayer");
  }

  if (!decision.navigate) {
    if (reason === "pip-restore") clearRestoreIntent("completed");
    logRestore("reuse-route", decision.rejectReason || "no-navigation");
    return {
      ok: true,
      navigated: false,
      reusedRoute: decision.reuseExistingRoute,
      rejectReason: decision.rejectReason,
    };
  }

  try {
    if (decision.navigationMode === "push") {
      router.push("/tv-player" as never);
    } else {
      router.replace("/tv-player" as never);
    }
    logRestore("navigated", decision.navigationMode);
    if (reason === "pip-restore") clearRestoreIntent("completed");
    return { ok: true, navigated: true, reusedRoute: false };
  } catch {
    if (reason === "pip-restore") clearRestoreIntent("failed");
    logRestore("navigate-failed");
    return {
      ok: false,
      navigated: false,
      reusedRoute: false,
      rejectReason: "blank-route-forbidden",
    };
  }
}

/** PiP start must never open/navigate the full route. */
export function onTvPipStarted() {
  restoreIntent = reducePipRestoreIntent(restoreIntent, "pip_started");
  logRestore("pip-started", "no-navigation");
}

/**
 * PiP stop while the app is active is treated as explicit restore.
 * Closing PiP while the app stays backgrounded must not open a blank route.
 */
export function onTvPipStoppedWhileActive() {
  return openTvPlayerFullScreen("pip-restore");
}

export function onTvSessionStoppedNavigation() {
  restoreIntent = reducePipRestoreIntent(restoreIntent, "session_stopped");
  tvPlayerRouteFocused = false;
}
