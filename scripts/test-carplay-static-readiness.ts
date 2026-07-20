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
    "app.json carplay-audio entitlement"
  );

  const plugin = read("plugins/hidden-audio/index.js");
  assertOk(plugin.includes('config.modResults["com.apple.developer.carplay-audio"] = true'), "plugin enables entitlement");
  assertOk(plugin.includes("CPTemplateApplicationSceneSessionRoleApplication"), "CarPlay scene role");
  assertOk(plugin.includes("PhoneSceneDelegate"), "Phone scene delegate");
  assertOk(plugin.includes("CarPlaySceneDelegate.swift"), "scene file in NATIVE_FILES");
  assertOk(plugin.includes("HiddenAudioCarPlayCatalog.swift"), "catalog in NATIVE_FILES");
  assertOk(plugin.includes('addFramework("CarPlay.framework"'), "CarPlay.framework link");
  assertOk(plugin.includes("withHiddenAudioAppDelegate"), "AppDelegate scene patch");

  const manager = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift");
  assertOk(manager.includes("import CarPlay"), "manager imports CarPlay");
  assertOk(manager.includes("func connect("), "manager connect");
  assertOk(manager.includes("CPTabBarTemplate"), "tab bar template");
  assertOk(manager.includes("CPListTemplate"), "list template");
  assertOk(manager.includes("CPNowPlayingTemplate"), "now playing template");
  assertOk(manager.includes("CPSearchTemplate"), "search template");
  assertOk(manager.includes("emitCarPlayMediaSelection"), "playback bridge selection");
  assertOk(!manager.includes("func startIfNeeded() {}"), "manager is not no-op stub");

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
  ]) {
    assertOk(catalog.includes(`"${section}"`), `catalog section ${section}`);
  }

  const module = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift");
  assertOk(module.includes("MPNowPlayingInfoCenter"), "now playing center");
  assertOk(module.includes("MPRemoteCommandCenter"), "remote commands");
  assertOk(module.includes('entitlementMode": "carplay-audio"'), "diagnostic entitlement mode");

  assertOk(fs.existsSync(path.join(root, "plugins/hidden-audio/ios/HiddenAudioModule/CarPlaySceneDelegate.swift")), "scene delegate file");
  assertOk(fs.existsSync(path.join(root, "plugins/hidden-audio/ios/HiddenAudioModule/PhoneSceneDelegate.swift")), "phone scene file");

  console.log("carplay-static-readiness: ok");
}

main();
