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
    appJson.expo?.ios?.entitlements?.["com.apple.developer.carplay-video"] === true,
    "app.json carplay-video entitlement"
  );

  const plugin = read("plugins/hidden-audio/index.js");
  assertOk(plugin.includes('config.modResults["com.apple.developer.carplay-audio"] = true'), "plugin audio");
  assertOk(plugin.includes('config.modResults["com.apple.developer.carplay-video"] = true'), "plugin video");
  assertOk(plugin.includes("CPTemplateApplicationSceneSessionRoleApplication"), "CarPlay scene role");
  assertOk(plugin.includes("CarPlaySceneDelegate.swift"), "scene file in NATIVE_FILES");
  assertOk(plugin.includes('addFramework("CarPlay.framework"'), "CarPlay.framework link");

  const scene = read("plugins/hidden-audio/ios/HiddenAudioModule/CarPlaySceneDelegate.swift");
  assertOk(scene.includes("@objc(CarPlaySceneDelegate)"), "@objc CarPlaySceneDelegate");
  assertOk(scene.includes('NSLog("[HTCarPlay] scene_delegate_init")'), "scene_delegate_init");
  assertOk(scene.includes('NSLog("[HTCarPlay] scene_connection_start")'), "scene_connection_start");
  assertOk(scene.includes("attachConnectedSession"), "scene attaches manager after inline root");
  assertOk(scene.includes("setRootTemplate("), "scene installs root inline (Apple audio pattern)");
  assertOk(scene.includes("Hidden Tunes is ready"), "scene fallback ready row");
  assertOk(scene.includes("Browse Library"), "scene fallback browse row");
  assertOk(scene.includes("Now Playing"), "scene fallback now playing row");
  assertOk(scene.includes("Search"), "scene fallback search row");
  assertOk(scene.includes("private var interfaceController: CPInterfaceController?"), "strong IC");
  assertOk(!scene.includes("CPTabBarTemplate"), "scene delegate has no tab bar");
  assertOk(!scene.includes("didConnect interfaceController: CPInterfaceController,\n    to window"), "no navigation 3-arg didConnect");
  assertOk(!scene.includes("didDisconnect interfaceController: CPInterfaceController,\n    from window"), "no navigation 3-arg didDisconnect");

  const manager = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift");
  assertOk(manager.includes("import CarPlay"), "manager imports CarPlay");
  assertOk(manager.includes("func attachConnectedSession("), "manager attachConnectedSession");
  assertOk(manager.includes("func connect("), "manager connect fallback");
  assertOk(manager.includes("private var interfaceController: CPInterfaceController?"), "strong IC");
  assertOk(!manager.includes("private weak var interfaceController"), "IC not weak");
  assertOk(manager.includes("CPListTemplate"), "CPListTemplate root");
  assertOk(manager.includes("CPNowPlayingTemplate"), "now playing");
  assertOk(manager.includes("CPSearchTemplate"), "search template type");
  assertOk(manager.includes("presentTemplate"), "search uses presentTemplate");
  assertOk(manager.includes("presentSearchTemplate"), "presentSearchTemplate helper");
  assertOk(manager.includes("Hidden Tunes is ready"), "fallback ready item");
  assertOk(manager.includes("Browse Library"), "fallback browse item");
  assertOk(manager.includes("Now Playing"), "fallback now playing item");
  assertOk(manager.includes('"Search"') || manager.includes("title: \"Search\""), "fallback search item");
  assertOk(manager.includes("fallback_item_count=") || scene.includes("fallback_item_count="), "fallback_item_count log");
  assertOk(
    manager.includes("root_created type=CPListTemplate item_count=") ||
      scene.includes("root_created type=CPListTemplate item_count="),
    "root_created log"
  );
  assertOk(manager.includes("root_type=CPListTemplate") || scene.includes("root_type=CPListTemplate"), "root_type log");
  assertOk(manager.includes("setRootTemplate start") || scene.includes("setRootTemplate start"), "setRootTemplate start log");
  assertOk(
    manager.includes("setRootTemplate complete success=") || scene.includes("setRootTemplate complete success="),
    "setRootTemplate complete log"
  );
  assertOk(manager.includes("root_retained") || scene.includes("root_retained"), "root_retained log");
  assertOk(manager.includes("search_presented"), "search_presented log");
  assertOk(manager.includes("catalog_updated_existing_root"), "catalog_updated_existing_root log");
  assertOk(manager.includes("existing_root_updated section_count="), "existing_root_updated log");
  assertOk(manager.includes("stale_update_ignored"), "stale_update_ignored log");
  assertOk(manager.includes("scene_disconnect") || scene.includes("scene_disconnect"), "scene_disconnect log");
  assertOk(manager.includes("now_playing_opened"), "now_playing_opened log");
  assertOk(manager.includes("item_selected id="), "item_selected id log");
  assertOk(manager.includes("fallback_restored reason=") || scene.includes("fallback_restored reason="), "fallback_restored log");
  assertOk(manager.includes("entitlement_present=1"), "video entitlement_present log");
  assertOk(manager.includes("mode=%@") || manager.includes("video-capable"), "video mode log");
  assertOk(manager.includes("updateSections"), "catalog updates existing list");
  assertOk(manager.includes("installSingleListRootIfNeeded"), "fallback root install path");
  assertOk(manager.includes("updateExistingRootListFromCatalog"), "in-place catalog update");
  assertOk(manager.includes("connectionGeneration"), "connection generation for stale guards");
  assertOk(manager.includes("connect_idempotent_skip"), "idempotent connect guard");
  assertOk(manager.includes("emitCarPlayMediaSelection"), "playback bridge");
  assertOk(manager.includes("supportsVideoPlayback"), "video gating");
  assertOk(scene.includes("interface_controller_attached") || manager.includes("interface_controller_attached"), "interface_controller_attached");
  assertOk(scene.includes("scene_configuration_requested") || plugin.includes("configurationForConnecting"), "scene configuration requested");
  assertOk(!manager.includes("AVPlayer("), "no second AVPlayer");
  assertOk(!manager.includes("AVAudioPlayer("), "no AVAudioPlayer");

  // Zero runtime CPTabBarTemplate construction in active manager source.
  assertOk(!/CPTabBarTemplate\s*\(/.test(manager), "no CPTabBarTemplate( construction");
  assertOk(!manager.includes("init(templates:)"), "zero init(templates:)");
  assertOk(!manager.includes("upgradeToTabBarRoot"), "no tab upgrade path");
  assertOk(!manager.includes("tabBarTemplate"), "no tabBarTemplate property");
  assertOk(!manager.includes("CPTabBarTemplate"), "zero CPTabBarTemplate identifier in manager");

  // Primary root install is inline in the scene delegate (Apple audio sample).
  // Manager may keep one fallback setRootTemplate for non-scene entry only.
  const sceneSetRoot = countOccurrences(scene, "setRootTemplate(");
  const managerSetRoot = countOccurrences(manager, "setRootTemplate(");
  assertOk(sceneSetRoot === 1, `scene has exactly one setRootTemplate (found ${sceneSetRoot})`);
  assertOk(managerSetRoot === 1, `manager has exactly one fallback setRootTemplate (found ${managerSetRoot})`);

  // No force root replacement / concurrent reinstall paths.
  assertOk(!manager.includes("installRootTemplates(force: true"), "no force root reinstall");
  assertOk(!manager.includes("root_replacement"), "no root_replacement log/path");
  assertOk(
    manager.includes("already_installed") ||
      manager.includes("already_in_progress") ||
      manager.includes("connect_idempotent_skip"),
    "blocks concurrent install"
  );
  const catalog = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayCatalog.swift");
  assertOk(catalog.includes("ensureDefaultCatalog"), "default catalog");
  assertOk(catalog.includes("emptyNode(for:"), "empty node helper");

  const module = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift");
  assertOk(module.includes("MPNowPlayingInfoCenter"), "now playing center");
  assertOk(module.includes("MPRemoteCommandCenter"), "remote commands");
  assertOk(module.includes('entitlementMode": "carplay-audio+video"'), "dual entitlement mode");

  const appJsonRaw = read("app.json");
  assertOk(appJsonRaw.includes("expo-screen-orientation"), "expo-screen-orientation included");
  assertOk(appJsonRaw.includes("supportsPictureInPicture"), "TV PiP config preserved");

  // Workspace-wide plugin/source check: no active CPTabBarTemplate construction in tracked CarPlay sources.
  const pluginSources = [
    "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift",
    "plugins/hidden-audio/ios/HiddenAudioModule/CarPlaySceneDelegate.swift",
    "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayCatalog.swift",
  ];
  for (const rel of pluginSources) {
    const src = read(rel);
    assertOk(!/CPTabBarTemplate\s*\(/.test(src), `no CPTabBarTemplate( in ${rel}`);
  }

  console.log("carplay-static-readiness: ok");
  console.log("checks: single CPListTemplate root, zero CPTabBarTemplate construction,");
  console.log("  presentTemplate search, in-place catalog update, dual entitlements");
}

main();
