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

  const plugin = read("plugins/hidden-audio/index.js");
  assertOk(plugin.includes('config.modResults["com.apple.developer.carplay-audio"] = true'), "plugin audio");
  assertOk(plugin.includes("CPTemplateApplicationSceneSessionRoleApplication"), "CarPlay scene role");
  assertOk(plugin.includes("CarPlaySceneDelegate.swift"), "scene file in NATIVE_FILES");
  assertOk(plugin.includes("HiddenAudioCarPlayTabValidation.swift"), "validation file in NATIVE_FILES");
  assertOk(plugin.includes('addFramework("CarPlay.framework"'), "CarPlay.framework link");

  const scene = read("plugins/hidden-audio/ios/HiddenAudioModule/CarPlaySceneDelegate.swift");
  assertOk(scene.includes("@objc(CarPlaySceneDelegate)"), "@objc CarPlaySceneDelegate");
  assertOk(scene.includes('NSLog("[HTCarPlay] scene_delegate_init")'), "scene_delegate_init");
  assertOk(scene.includes('NSLog("[HTCarPlay] scene_connection_start")'), "scene_connection_start");
  assertOk(scene.includes("attachConnectedSession"), "scene attaches manager after inline root");
  assertOk(scene.includes("setRootTemplate("), "scene installs root inline (Apple audio pattern)");
  assertOk(scene.includes("Loading your audio"), "scene minimal loading root");
  assertOk(scene.includes("makeImmediateFallbackRoot"), "scene fallback helper");
  assertOk(scene.includes("private var interfaceController: CPInterfaceController?"), "strong IC");
  assertOk(!scene.includes("didConnect interfaceController: CPInterfaceController,\n    to window"), "no navigation 3-arg didConnect");
  assertOk(!scene.includes("didDisconnect interfaceController: CPInterfaceController,\n    from window"), "no navigation 3-arg didDisconnect");
  // Scene installs only the safe list root — never constructs the tab bar itself.
  assertOk(!scene.includes("CPTabBarTemplate("), "scene delegate does not construct tab bar");

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

  // Scene installs one safe root; manager may upgrade once after validation.
  const sceneSetRoot = countOccurrences(scene, "setRootTemplate(");
  assertOk(sceneSetRoot === 1, `scene has exactly one setRootTemplate (found ${sceneSetRoot})`);

  console.log("carplay-static-readiness: ok");
  console.log("checks: safe list root first, validated Listen/Radio/Library tabs,");
  console.log("  favorites sanitizer, no Search/Videos tabs, dual entitlements preserved");
}

main();
