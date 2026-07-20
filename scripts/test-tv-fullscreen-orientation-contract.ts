import {
  classifySimulatedExpoScreenOrientationMissingError,
  resolveFullscreenGeometryPolicy,
  resolveLayoutOrientationFromWindow,
  resolveOrientationFailureFullscreenContract,
  resolveOrientationNativeRebuildContract,
  resolvePipOrientationInteractionContract,
  resolveTvOrientationOwnerContract,
  shouldRequestLandscapeOnFullscreenEnter,
  shouldRestorePortraitOnFullscreenExit,
} from "../services/tv/tvFullscreenOrientationContract";
import { resolveFullscreenNavigationContract } from "../services/tv/tvFullscreenContract";
import {
  classifyTvOrientationLoadError,
  getTvFullscreenOrientationOwnerStateForTests,
  isTvOrientationPackagePresent,
  requestTvFullscreenLandscape,
  resetTvFullscreenOrientationOwnerForTests,
  restoreTvPortraitOrientation,
  setTvOrientationCapabilityLoaderForTests,
} from "../services/tv/tvFullscreenOrientation";

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(`FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `FAIL: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

async function main() {
  resetTvFullscreenOrientationOwnerForTests();

  // Exact device error must classify as native-module-missing (not thrown)
  assertEqual(
    classifyTvOrientationLoadError(
      new Error("Cannot find native module 'ExpoScreenOrientation'")
    ),
    "native-module-missing",
    "device-error. classify thrown message"
  );
  assertEqual(
    classifySimulatedExpoScreenOrientationMissingError(
      "Cannot find native module 'ExpoScreenOrientation'"
    ),
    "native-module-missing",
    "device-error. contract classify"
  );

  // 1–3. missing native module does not throw; returns unsupported; caches
  setTvOrientationCapabilityLoaderForTests(() => null);
  const missing1 = await requestTvFullscreenLandscape();
  assertEqual(missing1.supported, false, "1. missing → unsupported");
  assertEqual(missing1.applied, false, "1b. not applied");
  assertEqual(missing1.reason, "native-module-missing", "1c. reason");
  assertEqual(
    getTvFullscreenOrientationOwnerStateForTests().nativeModuleMissingCached,
    true,
    "3. missing cached"
  );

  const missing2 = await requestTvFullscreenLandscape();
  assertEqual(missing2.reason, "native-module-missing", "7. no retry loop");
  assertEqual(missing2.supported, false, "7b. still unsupported");

  // Loader that throws the exact Expo error must be swallowed
  resetTvFullscreenOrientationOwnerForTests();
  setTvOrientationCapabilityLoaderForTests(() => {
    throw new Error("Cannot find native module 'ExpoScreenOrientation'");
  });
  let threw = false;
  let thrownResult: Awaited<ReturnType<typeof requestTvFullscreenLandscape>> | null =
    null;
  try {
    thrownResult = await requestTvFullscreenLandscape();
  } catch {
    threw = true;
  }
  assert(!threw, "1d. device error does not throw");
  assertEqual(thrownResult?.supported, false, "1e. unsupported after throw path");
  assertEqual(
    thrownResult?.reason,
    "native-module-missing",
    "1f. classified after throw path"
  );

  // 4–5. fullscreen UI still enters / usable in portrait (geometry contract)
  const failSafe = resolveOrientationFailureFullscreenContract();
  assert(failSafe.entersUiFullscreenRegardless, "4. FS enters regardless");
  assert(failSafe.remainsUsableInPortrait, "5. portrait FS usable");
  const portraitFs = resolveFullscreenGeometryPolicy({
    isUiFullscreen: true,
    width: 390,
    height: 844,
  });
  assertEqual(portraitFs.absoluteFillStage, true, "5b. edge-to-edge");
  assertEqual(portraitFs.portraitChromeVisible, false, "5c. chrome hidden");

  // 6. restore does not throw
  resetTvFullscreenOrientationOwnerForTests();
  setTvOrientationCapabilityLoaderForTests(() => null);
  let restoreThrew = false;
  let restoreResult: Awaited<ReturnType<typeof restoreTvPortraitOrientation>> | null =
    null;
  try {
    restoreResult = await restoreTvPortraitOrientation();
  } catch {
    restoreThrew = true;
  }
  assert(!restoreThrew, "6. restore does not throw");
  assert(restoreResult != null, "6b. restore returns");

  // 8–10. failure does not stop playback / alter PiP / remount
  assert(failSafe.doesNotStopPlayback, "8. no playback stop");
  assert(failSafe.doesNotAlterPip, "9. no PiP alter");
  assert(failSafe.doesNotRemountVideoView, "10. no remount");

  // 11–12. no fake rotation / protected refs
  const owner = resolveTvOrientationOwnerContract();
  assertEqual(owner.usesTransformFakeRotation, false, "11. no fake rotation");
  assertEqual(owner.referencesHiddenAudio, false, "12. no HiddenAudio");
  assertEqual(owner.referencesPlayerContext, false, "12b. no PlayerContext");

  // Supported path (fake native) still requests once
  resetTvFullscreenOrientationOwnerForTests();
  let lockCalls = 0;
  setTvOrientationCapabilityLoaderForTests(() => ({
    lockAsync: async () => {
      lockCalls += 1;
    },
  }));
  const ok1 = await requestTvFullscreenLandscape();
  assertEqual(ok1.supported, true, "supported. ok");
  assertEqual(ok1.applied, true, "supported. applied");
  assertEqual(lockCalls, 1, "supported. one lock");
  const ok2 = await requestTvFullscreenLandscape();
  assertEqual(ok2.reason, "already_requested", "supported. no second lock");
  assertEqual(lockCalls, 1, "supported. still one");
  const restored = await restoreTvPortraitOrientation();
  assertEqual(restored.supported, true, "supported. restore");
  assertEqual(restored.applied, true, "supported. restore applied");
  assertEqual(lockCalls, 2, "supported. portrait lock");

  // Pure geometry / rebuild contracts
  assertEqual(
    shouldRequestLandscapeOnFullscreenEnter({
      enteringFullscreen: false,
      alreadyRequestedForSession: false,
    }),
    false,
    "pure. no landscape outside FS"
  );
  assert(
    shouldRequestLandscapeOnFullscreenEnter({
      enteringFullscreen: true,
      alreadyRequestedForSession: false,
    }),
    "pure. FS entry may request"
  );
  assertEqual(
    resolveLayoutOrientationFromWindow(844, 390),
    "landscape",
    "pure. landscape dims"
  );
  assertEqual(
    resolvePipOrientationInteractionContract().orientationLoopForbidden,
    true,
    "pip. no loop"
  );

  const rebuild = resolveOrientationNativeRebuildContract({
    packageInstalled: true,
    resolvedExpoOrientation: "default",
    pluginPresent: true,
  });
  assert(rebuild.requiresNewIosBuild, "rebuild required for landscape");
  assertEqual(
    rebuild.jsCanControlOrientationWithoutRebuild,
    false,
    "Metro cannot activate native module"
  );
  assert(isTvOrientationPackagePresent(), "package present in lockfile");

  const nav = resolveFullscreenNavigationContract();
  assertEqual(nav.orientationLockAvailable, true, "nav. JS owner wired");
  assert(nav.requiresNewIosDevelopmentBuild, "nav. new build for landscape");
  assertEqual(nav.usesTransformFakeRotation, false, "nav. no fake rotate");

  resetTvFullscreenOrientationOwnerForTests();
  console.log("PASS: tv-fullscreen-orientation-contract");
}

void main();
