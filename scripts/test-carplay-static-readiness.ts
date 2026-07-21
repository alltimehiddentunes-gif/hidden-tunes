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

function main() {
  const appJson = JSON.parse(read("app.json"));
  assertOk(appJson.expo?.ios?.bundleIdentifier === "com.hiddentunes.app", "bundle id");
  assertOk(
    appJson.expo?.ios?.entitlements?.["com.apple.developer.carplay-audio"] === true,
    "1. app.json carplay-audio entitlement"
  );
  assertOk(
    appJson.expo?.ios?.entitlements?.["com.apple.developer.carplay-video"] === true,
    "1b. app.json carplay-video entitlement (Apple Guide key)"
  );

  const plugin = read("plugins/hidden-audio/index.js");
  assertOk(plugin.includes('config.modResults["com.apple.developer.carplay-audio"] = true'), "1. plugin enables audio entitlement");
  assertOk(plugin.includes('config.modResults["com.apple.developer.carplay-video"] = true'), "1b. plugin enables video entitlement");
  assertOk(!plugin.includes('delete config.modResults["com.apple.developer.carplay-video"]'), "1b. plugin does not strip video");
  assertOk(plugin.includes("CPTemplateApplicationSceneSessionRoleApplication"), "2. CarPlay scene role");
  assertOk(plugin.includes('UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).CarPlaySceneDelegate"'), "3. delegate class matches Swift");
  assertOk(plugin.includes("CarPlaySceneDelegate.swift"), "4. scene file in NATIVE_FILES");
  assertOk(plugin.includes("HiddenAudioCarPlayCatalog.swift"), "4. catalog in NATIVE_FILES");
  assertOk(plugin.includes("PhoneSceneDelegate"), "Phone scene delegate");
  assertOk(plugin.includes('addFramework("CarPlay.framework"'), "5. CarPlay.framework link");
  assertOk(plugin.includes("withHiddenAudioAppDelegate"), "AppDelegate scene patch");
  assertOk(plugin.includes("configurationForConnecting connectingSceneSession"), "12. AppDelegate role routing");
  assertOk(plugin.includes('role == "CPTemplateApplicationSceneSessionRoleApplication"'), "12. CarPlay role string");
  assertOk(plugin.includes("delegateClass = CarPlaySceneDelegate.self"), "12. CarPlay delegateClass");
  assertOk(plugin.includes("delegateClass = PhoneSceneDelegate.self"), "12. Phone delegateClass");

  const scene = read("plugins/hidden-audio/ios/HiddenAudioModule/CarPlaySceneDelegate.swift");
  assertOk(scene.includes("@objc(CarPlaySceneDelegate)"), "3. @objc CarPlaySceneDelegate");
  assertOk(scene.includes("CPTemplateApplicationSceneDelegate"), "scene conforms to protocol");
  assertOk(
    scene.includes("didConnect interfaceController: CPInterfaceController"),
    "6. audio connect method signature"
  );
  assertOk(
    scene.includes("didConnect interfaceController: CPInterfaceController,\n    to window: CPWindow") ||
      scene.includes("didConnect interfaceController: CPInterfaceController,\r\n    to window: CPWindow") ||
      /didConnect interfaceController: CPInterfaceController,\s*to window: CPWindow/.test(scene),
    "6. window-bearing connect safety net"
  );
  assertOk(scene.includes("didDisconnectInterfaceController"), "disconnect method");
  assertOk(scene.includes('NSLog("[HTCarPlay] scene_delegate_init")'), "diagnostics: init");
  assertOk(scene.includes('NSLog("[HTCarPlay] scene_connection_start")'), "diagnostics: connect");
  assertOk(scene.includes("HiddenAudioCarPlayManager.shared.connect"), "connect routes to manager");
  assertOk(scene.includes("private var interfaceController: CPInterfaceController?"), "11. strong IC in scene delegate");
  assertOk(scene.includes("private var carWindow: CPWindow?"), "12. strong CPWindow in scene delegate");
  assertOk(scene.includes("Thread.isMainThread"), "8. main-thread connect");

  const manager = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift");
  assertOk(manager.includes("import CarPlay"), "manager imports CarPlay");
  assertOk(manager.includes("func connect("), "manager connect");
  assertOk(manager.includes("private var interfaceController: CPInterfaceController?"), "11. strong IC in manager");
  assertOk(!manager.includes("private weak var interfaceController"), "11. IC is not weak");
  assertOk(manager.includes("private var carWindow: CPWindow?"), "12. strong window in manager");
  assertOk(manager.includes("setRootTemplate"), "7. root template installed on connection");
  assertOk(manager.includes("CPListTemplate"), "7. list template fallback");
  assertOk(manager.includes("CPTabBarTemplate"), "tab bar template");
  assertOk(manager.includes("CPNowPlayingTemplate"), "now playing template");
  assertOk(manager.includes("CPSearchTemplate"), "search template");
  assertOk(manager.includes("ensureDefaultCatalog()"), "9. fallback root does not depend on JS");
  assertOk(manager.includes("makeVisibleFallbackListTemplate"), "fallback factory exists");
  assertOk(manager.includes("Hidden Tunes is ready"), "fallback has visible ready item");
  assertOk(manager.includes("Open Now Playing"), "fallback has Now Playing item");
  assertOk(manager.includes("Connect to Metro for full catalog"), "fallback has Metro hint item");
  assertOk(manager.includes("fallback_template_created item_count="), "fallback item_count log");
  assertOk(manager.includes("setRootTemplate start type="), "setRootTemplate start log");
  assertOk(manager.includes("setRootTemplate complete success="), "setRootTemplate complete log");
  assertOk(manager.includes("tab_template_created tab_count="), "tab_template_created log");
  assertOk(manager.includes("tab_upgrade_complete success="), "tab_upgrade_complete log");
  assertOk(manager.includes("tab_upgrade_failed keeping_list_root"), "tab failure preserves list");
  assertOk(manager.includes("root_replacement reason="), "root_replacement log");
  assertOk(manager.includes("catalog_applied section_count="), "catalog_applied log");
  assertOk(manager.includes("pendingCatalogReload"), "catalog reload defers during install");
  assertOk(manager.includes("makeNonEmptyListTemplate"), "non-empty list helper");
  assertOk(manager.includes("guard tabs.count >= 1"), "tab bar never installed with zero tabs");
  assertOk(manager.includes('NSLog("[HTCarPlay]'), "HTCarPlay native logs");
  assertOk(manager.includes('NSLog("[HTCarPlayVideo]'), "HTCarPlayVideo native logs");
  assertOk(manager.includes("supportsVideoPlayback"), "supportsVideoPlayback gating");
  assertOk(manager.includes("CPSessionConfiguration"), "CPSessionConfiguration used");
  assertOk(manager.includes("videos_tab_included"), "video UI gated by capability");
  assertOk(manager.includes("Thread.isMainThread"), "8. main-thread safe root install");
  assertOk(manager.includes("emptyMessageTitle") || manager.includes("No items available"), "10. empty catalog safety");
  assertOk(manager.includes("installRootTemplates"), "root install path");
  assertOk(manager.includes("upgradeToTabBarRoot"), "tab upgrade path");
  assertOk(manager.includes("emitCarPlayMediaSelection"), "14. playback bridge selection");
  assertOk(!manager.includes("AVPlayer("), "13. no second AVPlayer in CarPlay manager");
  assertOk(!manager.includes("AVAudioPlayer("), "13. no AVAudioPlayer in CarPlay manager");
  assertOk(!manager.includes("func startIfNeeded() {}"), "manager is not no-op stub");
  // Root install must happen on connect before async catalog work.
  const connectIdx = manager.indexOf("self.installRootTemplates(force: true, reason: \"connect\")");
  const catalogReloadIdx = manager.indexOf("reason: \"catalog_reload\"");
  assertOk(connectIdx > 0, "connect installs root");
  assertOk(catalogReloadIdx > connectIdx, "catalog reload is separate from connect install");

  const catalog = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayCatalog.swift");
  for (const section of [
    "recently_played",
    "made_for_you",
    "playlists",
    "radio",
    "podcasts",
    "audiobooks",
    "motivationals",
    "lectures",
    "videos",
  ]) {
    assertOk(catalog.includes(`"${section}"`), `catalog section ${section}`);
  }
  assertOk(catalog.includes("emptyNode(for:"), "10. empty node helper");
  assertOk(catalog.includes("ensureDefaultCatalog"), "9. default catalog without JS");

  const module = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift");
  assertOk(module.includes("MPNowPlayingInfoCenter"), "14. now playing center");
  assertOk(module.includes("MPRemoteCommandCenter"), "14. remote commands");
  assertOk(module.includes('entitlementMode": "carplay-audio+video"'), "diagnostic dual entitlement mode");
  assertOk(module.includes("emitCarPlayMediaSelection"), "14. CarPlay selection -> HiddenAudio");

  // Preserve TV / orientation build surface (must remain present for the combined build).
  const appJsonRaw = read("app.json");
  assertOk(appJsonRaw.includes("expo-screen-orientation"), "expo-screen-orientation included");
  assertOk(appJsonRaw.includes("supportsPictureInPicture"), "TV PiP config preserved");
  const appConfig = read("app.config.js");
  assertOk(appConfig.includes("supportsPictureInPicture: true"), "TV PiP preserved in app.config.js");
  assertOk(appConfig.includes("supportsBackgroundPlayback: true"), "TV background playback preserved");

  const phone = read("plugins/hidden-audio/ios/HiddenAudioModule/PhoneSceneDelegate.swift");
  assertOk(phone.includes("@objc(PhoneSceneDelegate)"), "PhoneSceneDelegate @objc");

  assertOk(fs.existsSync(path.join(root, "plugins/hidden-audio/ios/HiddenAudioModule/CarPlaySceneDelegate.swift")), "scene delegate file");
  assertOk(fs.existsSync(path.join(root, "plugins/hidden-audio/ios/HiddenAudioModule/PhoneSceneDelegate.swift")), "phone scene file");

  // 15. TV systems untouched by this CarPlay fix (static path presence only — no edits expected here).
  assertOk(fs.existsSync(path.join(root, "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift")), "HiddenAudio remains playback owner");

  console.log("carplay-static-readiness: ok");
  console.log("checks: entitlement, scene role, delegate class, swift copy list, framework link,");
  console.log("  connect signature, root on connect, main-thread, JS-independent fallback,");
  console.log("  empty-catalog safety, strong IC/window, no second player, HiddenAudio owner");
}

main();
