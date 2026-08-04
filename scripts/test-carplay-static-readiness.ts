/**
 * Static CarPlay readiness checks for CLEAN consolidation.
 * Run: npx tsx scripts/test-carplay-static-readiness.ts
 */
// @ts-nocheck
const fs = require("fs");
const path = require("path");

const root = process.cwd();

function assertOk(condition, label) {
  if (!condition) throw new Error(label);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

function main() {
  const appJson = JSON.parse(read("app.json"));
  assertOk(appJson.expo?.ios?.bundleIdentifier === "com.hiddentunes.app", "bundle id");
  assertOk(
    appJson.expo?.ios?.entitlements?.["com.apple.developer.carplay-audio"] === true,
    "app.json carplay-audio entitlement"
  );
  assertOk(
    !("com.apple.developer.carplay-video" in appJson.expo.ios.entitlements),
    "app.json excludes carplay-video entitlement"
  );

  const plugin = read("plugins/hidden-audio/index.js");
  assertOk(plugin.includes('config.modResults["com.apple.developer.carplay-audio"] = true'), "plugin audio");
  assertOk(plugin.includes('delete config.modResults["com.apple.developer.carplay-video"]'), "plugin removes video entitlement");
  assertOk(plugin.includes("CPTemplateApplicationSceneSessionRoleApplication"), "CarPlay scene role");
  assertOk(plugin.includes("assertCarPlaySceneManifest"), "manifest assertion helper");
  assertOk(plugin.includes("must not contain ${CARPLAY_WINDOW_SCENE_ROLE}"), "rejects any window-CarPlay role");
  assertOk(plugin.includes("expected exactly ${requiredRoles.length} scene roles"), "requires exactly two generated roles");
  assertOk(plugin.includes("phone role must use PhoneSceneDelegate"), "requires generated phone delegate");
  assertOk(plugin.includes("Do NOT register UIWindowSceneSessionRoleCarPlay"), "docs remove invalid window role");
  assertOk(!plugin.includes("[CARPLAY_WINDOW_SCENE_ROLE]: [CARPLAY_SCENE_CONFIG]"), "manifest does not register window CarPlay template");
  assertOk(plugin.includes("CarPlaySceneDelegate.swift"), "scene file in NATIVE_FILES");
  assertOk(plugin.includes("HiddenAudioCarPlayTabValidation.swift"), "validation file in NATIVE_FILES");
  assertOk(plugin.includes('addFramework("CarPlay.framework"'), "CarPlay.framework link");

  const router = read("plugins/hidden-audio/carPlaySceneRouter.js");
  assertOk(router.includes("reject_invalid_pairing"), "router rejects window-role template pairing");
  assertOk(router.includes("@objc public func application("), "router ObjC-visible configurationForConnecting");
  assertOk(
    router.includes("window_role_requires_UIWindowScene"),
    "router rejects window role without selecting template"
  );
  assertOk(
    router.includes("RejectedCarPlayWindowSceneDelegate.self"),
    "unexpected window CarPlay role cannot be owned by Expo/React"
  );
  assertOk(
    router.includes("CPTemplateApplicationSceneSessionRoleApplication"),
    "router matches template role"
  );
  assertOk(
    !/let isCarPlayRole = isCarPlayTemplateRole \|\| isCarPlayWindowRole/.test(
      router.split("function hasCompleteCarPlaySceneRouter")[0]
    ),
    "injected router source does not treat window role as template"
  );

  assertOk(appJson.expo?.ios?.buildNumber === "1.0.211", "diagnostic build number bumped");
  const manifestValidator = read("plugins/hidden-audio/ios/validate-carplay-scene-manifest.sh");
  assertOk(manifestValidator.includes("${TARGET_BUILD_DIR}/${INFOPLIST_PATH}"), "validates processed plist");
  assertOk(manifestValidator.includes("processed plist must not contain $WINDOW_CARPLAY_ROLE"), "rejects processed window-CarPlay role");
  assertOk(manifestValidator.includes("processed plist must contain exactly two scene roles"), "requires exactly two processed roles");
  assertOk(manifestValidator.includes("must resolve to PRODUCT_MODULE_NAME.PhoneSceneDelegate"), "requires processed phone delegate");
  assertOk(manifestValidator.includes("expected exactly one $TEMPLATE_ROLE configuration"), "rejects duplicate template role");
  assertOk(manifestValidator.includes("installed CarPlay SDK"), "verifies installed SDK declaration");
  assertOk(plugin.includes("/usr/bin/tr -d"), "normalizes validator line endings before execution");

  const scene = read("plugins/hidden-audio/ios/HiddenAudioModule/CarPlaySceneDelegate.swift");
  assertOk(scene.includes("@objc(CarPlaySceneDelegate)"), "@objc CarPlaySceneDelegate");
  assertOk(scene.includes("@objc(RejectedCarPlayWindowSceneDelegate)"), "defensive window scene owner");
  assertOk(scene.includes("requestSceneSessionDestruction"), "unexpected vehicle window destroyed");
  assertOk(scene.includes('NSLog("[HTCarPlay] scene_delegate_init")'), "scene_delegate_init");
  assertOk(scene.includes('NSLog("[HTCarPlay] scene_connection_start")'), "scene_connection_start");
  assertOk(scene.includes("[HTCarPlayNative]"), "scene emits HTCarPlayNative diagnostics");
  assertOk(scene.includes("private var templateApplicationScene"), "scene strongly retained");
  assertOk(scene.includes("private var rootTemplate"), "root strongly retained");
  assertOk(scene.includes("diagnostic_root.visible_window_started"), "diagnostic root visibility window");
  assertOk(scene.includes('text: "CarPlay Connected"'), "unmistakable native diagnostic row");
  assertOk(scene.includes('detailText: "Native runtime active"'), "native diagnostic detail");
  assertOk(scene.includes("didConnect.enter"), "scene native didConnect diagnostic");
  assertOk(scene.includes("setRootTemplate.completion"), "scene native setRoot completion diagnostic");
  assertOk(scene.includes("attachConnectedSession"), "scene attaches manager after confirmed root");
  assertOk(scene.includes("rootInstallConfirmed: true"), "scene only attaches after confirmed root");
  assertOk(scene.includes("setRootTemplate("), "scene installs root inline (Apple audio pattern)");
  assertOk(!scene.includes("Loading your audio"), "diagnostic root is unmistakable");
  for (const marker of [
    "delegate_init",
    "did_connect_enter",
    "interface_controller_received",
    "root_template_created",
    "set_root_template_called",
    "set_root_template_result",
    "cached_catalog_replay_started",
    "cached_catalog_replay_completed",
    "did_disconnect",
  ]) {
    assertOk(scene.includes(`[HTCarPlayNative] ${marker}`), `native diagnostic ${marker}`);
  }
  assertOk(scene.includes("makeImmediateFallbackRoot"), "scene fallback helper");
  assertOk(scene.includes("installSafeRoot"), "scene bounded install helper");
  assertOk(scene.includes("root_install_retry"), "scene retries failed setRoot");
  assertOk(scene.includes("maxRootInstallAttempts"), "scene bounds retries");
  assertOk(scene.includes("private var interfaceController: CPInterfaceController?"), "strong IC");
  assertOk(/didConnect interfaceController: CPInterfaceController,\s+to window/.test(scene), "window callback compatibility entry");
  assertOk(/didDisconnect interfaceController: CPInterfaceController,\s+from window/.test(scene), "window disconnect compatibility entry");
  assertOk(scene.includes("reason=duplicate_callback"), "callback variants are idempotent");
  // Scene installs only the safe list root — never constructs the tab bar itself.
  assertOk(!scene.includes("CPTabBarTemplate("), "scene delegate does not construct tab bar");
  // Completion-gated attach: success path passes rootInstallConfirmed; failure falls to manager.connect.
  assertOk(scene.includes("HiddenAudioCarPlayManager.shared.connect("), "scene falls back to manager.connect");
  assertOk(scene.includes("carplay_scene_root_install_succeeded"), "scene emits root success diagnostic");
  assertOk(scene.includes("carplay_scene_root_install_exhausted"), "scene emits retry-exhausted diagnostic");

  const manager = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift");
  assertOk(manager.includes("import CarPlay"), "manager imports CarPlay");
  assertOk(manager.includes("func attachConnectedSession("), "manager attachConnectedSession");
  assertOk(manager.includes("rootInstallConfirmed"), "manager requires root confirmation");
  assertOk(manager.includes("scheduleValidatedTabUpgrade"), "manager defers tab upgrade");
  assertOk(manager.includes("carplay_catalog_replayed_after_connect"), "catalog replay after connect");
  assertOk(manager.includes("carplay_catalog_cached_pending_connect"), "catalog cached when disconnected");
  assertOk(manager.includes("root_install_retry"), "manager retries failed setRoot");
  assertOk(manager.includes("maxRootInstallAttempts"), "manager bounds retries");
  assertOk(manager.includes("func connect("), "manager connect fallback");
  assertOk(manager.includes("private var interfaceController: CPInterfaceController?"), "strong IC");
  assertOk(!manager.includes("private weak var interfaceController"), "IC not weak");
  assertOk(manager.includes("CPListTemplate"), "CPListTemplate root");
  assertOk(manager.includes("CPNowPlayingTemplate"), "now playing");
  assertOk(manager.includes("CPSearchTemplate"), "search template type");
  assertOk(manager.includes('pushTemplateSafely(search, operation: "search")'), "search uses guarded navigation stack");
  assertOk(!manager.includes("presentTemplate(search"), "search never uses modal presentation");
  assertOk(manager.includes("presentSearchTemplate"), "presentSearchTemplate helper");
  assertOk(manager.includes("makeFavoritesSection"), "favorites section helper");
  assertOk(manager.includes("sanitizedFavoritesNodes"), "uses sanitized favorites");
  assertOk(manager.includes("requiredTabImage"), "guaranteed tab images");
  assertOk(manager.includes("tryUpgradeToValidatedTabRoot"), "validated tab upgrade");
  assertOk(manager.includes("installSafeFallbackRoot"), "safe fallback root");
  assertOk(manager.includes('tabTitle = "Listen"'), "Listen tab title");
  assertOk(manager.includes('tabTitle = "Radio"'), "Radio tab title");
  assertOk(manager.includes('tabTitle = "Library"'), "Library tab title");
  assertOk(manager.includes("videos_tab_included=0"), "no Videos tab");
  assertOk(manager.includes("validateCarPlayTabs"), "validates before CPTabBarTemplate");
  assertOk(manager.includes("HiddenAudioCarPlayTabValidation.validateCarPlayTabs"), "uses shared validator");
  assertOk(manager.includes("CPTabBarTemplate(templates:"), "validated tab construction allowed");
  assertOk(manager.includes("fallback_restored reason="), "fallback_restored log");
  assertOk(manager.includes("disconnect"), "disconnect path");
  assertOk(manager.includes("playback_preserved=1"), "disconnect preserves playback");
  assertOk(manager.includes("emitCarPlayMediaSelection"), "playback bridge");
  assertOk(manager.includes("updateSections"), "catalog updates existing list");
  assertOk(manager.includes("connectionGeneration"), "connection generation for stale guards");
  assertOk(manager.includes("connect_idempotent_skip"), "idempotent connect guard");
  assertOk(!manager.includes("AVPlayer("), "no second AVPlayer");
  assertOk(!manager.includes("AVAudioPlayer("), "no AVAudioPlayer");
  // Search must never be a tab child (historical crash cause).
  assertOk(!/CPSearchTemplate\(\)[\s\S]{0,200}tabTitle/.test(manager), "search is not a tab");
  assertOk(!manager.includes('tabTitle = "Search"'), "search not a tab title");
  assertOk(!manager.includes('tabTitle = "Videos"'), "videos not a tab title");
  // Tab upgrade must be scheduled, not invoked synchronously inside attachConnectedSession body
  // before the next runloop (race guard).
  assertOk(
    manager.includes("DispatchQueue.main.async") && manager.includes("scheduleValidatedTabUpgrade"),
    "tab upgrade deferred via main async"
  );

  const validation = read(
    "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayTabValidation.swift"
  );
  assertOk(validation.includes("func validateCarPlayTabs"), "validator function");
  assertOk(validation.includes("invalid tabs: empty"), "rejects empty");
  assertOk(validation.includes("invalid tabs: duplicate"), "rejects duplicates");
  assertOk(validation.includes("invalid tabs: missing title"), "rejects missing title");
  assertOk(validation.includes("invalid tabs: missing image"), "rejects missing image");
  assertOk(validation.includes("invalid tab class"), "rejects unsupported class");
  assertOk(validation.includes("template is CPListTemplate"), "requires CPListTemplate tabs");

  const catalog = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayCatalog.swift");
  assertOk(catalog.includes("ensureDefaultCatalog"), "default catalog");
  assertOk(catalog.includes("sanitizedFavoritesNodes"), "favorites sanitizer");
  assertOk(catalog.includes("emptyFavoritesNode"), "favorites empty node");
  assertOk(catalog.includes("No favorites yet"), "favorites empty copy");
  assertOk(catalog.includes('"favorites"'), "favorites section id");

  const module = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift");
  assertOk(module.includes("MPNowPlayingInfoCenter"), "now playing center");
  assertOk(module.includes("MPRemoteCommandCenter"), "remote commands");

  const appJsonRaw = read("app.json");
  assertOk(appJsonRaw.includes("supportsPictureInPicture"), "TV PiP config preserved");

  // Scene has a single setRootTemplate call site (retry helper reuses it).
  const sceneSetRoot = countOccurrences(scene, "setRootTemplate(");
  assertOk(sceneSetRoot === 1, `scene has exactly one setRootTemplate call site (found ${sceneSetRoot})`);

  const pluginAppDelegate = read("plugins/hidden-audio/index.js");
  assertOk(
    pluginAppDelegate.includes("FATAL: AppDelegate CarPlay scene router not applied"),
    "plugin fails build when scene router missing"
  );

  console.log("carplay-static-readiness: ok");
  console.log("checks: confirmed root before attach, deferred tab upgrade, bounded retries,");
  console.log("  catalog replay after connect, fail-fast AppDelegate router, audio-only entitlement");
}

main();
