import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveTvBackVersusCloseActions } from "../services/tv/tvPlayerLayoutContract";
import { resolveBackVersusCloseRouteActions } from "../services/tv/tvPlayerNavigationContract";
import { createScopedActionLock } from "../utils/scopedActionLock";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const host = read("components/tv/TvPlayerHost.tsx");
const routeShell = read("app/tv-player.tsx");
const navigation = read("utils/tvNavigation.ts");

const handleBack = host.match(
  /const handleBack = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]+\]\);/
)?.[0];
const handleHeaderClose = host.match(
  /const handleHeaderClose = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]+\]\);/
)?.[0];

assert.ok(handleBack, "Back handler is present");
assert.ok(handleHeaderClose, "X handler is present");

const actions = resolveTvBackVersusCloseActions();
const routes = resolveBackVersusCloseRouteActions();
assert.equal(actions.back, "leave_expanded_preserve_session");
assert.equal(actions.close, "stop_or_clear_tv_session");
assert.equal(routes.back.preserveSession, true);
assert.equal(routes.back.presentationAfter, "floating");
assert.equal(routes.close.preserveSession, false);
assert.equal(routes.close.presentationAfter, "closed");

assert.match(handleBack, /navigateTvPlayerBack\(\)/, "Back navigates through the TV parent helper");
assert.doesNotMatch(handleBack, /closeFullPlayer|onStop|stopTv/, "Back never closes the TV owner");
assert.match(handleBack, /isUiFullscreen[\s\S]*?handleExitFullscreen\(\)[\s\S]*?return;/, "Back exits UI fullscreen before route navigation");
assert.match(handleHeaderClose, /closeFullPlayer\(\)/, "X uses the authoritative close pathway");
assert.doesNotMatch(handleHeaderClose, /navigateTvPlayerBack/, "X never takes the preserve-session pathway");
assert.match(host, /hardwareBackPress[\s\S]*?handleBack\(\)/, "Android system Back shares Back semantics");
assert.match(host, /if \(exitInFlightRef\.current\) return;/, "rapid X is idempotent");
assert.match(host, /closeFinalizedRef\.current = true;[\s\S]*?onStop\(\)/, "X finalizes teardown once after destination render");
assert.match(host, /accessibilityLabel="Close"[\s\S]*?handleHeaderClose\(\)/, "fullscreen X remains explicit close");

assert.match(
  navigation,
  /getTvDiscoverySession\(\)\?\.originalContext\.browseReturnPath/,
  "Back resolves the recorded TV browse parent"
);
assert.match(
  navigation,
  /navigateTvPlayerBack[\s\S]*?canNavigateBack\(\)[\s\S]*?router\.back\(\)/,
  "Back restores the retained category/filter screen when history exists"
);
assert.match(
  routeShell,
  /active\.setPresentationMode\("floating"\)/,
  "route blur keeps the same TV session in floating mode"
);
assert.doesNotMatch(routeShell, /stopTv|stopSession|closeTv/, "route unmount never terminates playback");

let timerCallback: (() => void) | null = null;
const fakeTimer = {} as ReturnType<typeof setTimeout>;
const backLock = createScopedActionLock(
  2_500,
  (callback) => {
    timerCallback = callback;
    return fakeTimer;
  },
  () => {
    timerCallback = null;
  }
);

let navigations = 0;
const pressBack = () => {
  if (!backLock.tryAcquire("tv-player-back")) return;
  navigations += 1;
};

pressBack();
assert.equal(navigations, 1, "one Back tap navigates once");
for (let index = 0; index < 10; index += 1) pressBack();
assert.equal(navigations, 1, "rapid Back taps do not queue duplicate navigation");
backLock.release();
pressBack();
assert.equal(navigations, 2, "a later legitimate Back tap works after route commit");
assert.ok(timerCallback, "bounded lock release remains armed");
timerCallback?.();
assert.equal(backLock.isLocked(), false, "bounded fallback cannot leave Back permanently locked");
backLock.dispose();

console.log("PASS: TV Back preserves playback/category; X alone closes the session");
