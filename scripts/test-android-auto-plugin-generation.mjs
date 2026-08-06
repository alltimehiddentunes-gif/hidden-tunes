import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const plugin = fs.readFileSync(path.resolve("plugins/hidden-audio/index.js"), "utf8");
const descriptor = fs.readFileSync(
  path.resolve("plugins/hidden-audio/android/res/xml/automotive_app_desc.xml"), "utf8"
);
const app = JSON.parse(fs.readFileSync(path.resolve("app.json"), "utf8"));
const remoteMediaControls = fs.readFileSync(
  path.resolve("services/remoteMediaControls.ts"),
  "utf8"
);

assert.equal(app.expo.android.package, "com.hiddentunes.app");
assert.ok(app.expo.plugins.includes("./plugins/hidden-audio"));
assert.match(descriptor, /<uses name="media"\s*\/>/);
assert.doesNotMatch(descriptor, /video|notification|messaging/i);
assert.match(plugin, /com\.hiddentunes\.app\.audio\.HiddenAudioMediaBrowserService/);
assert.match(plugin, /android\.media\.browse\.MediaBrowserService/);
assert.match(plugin, /exported: "true"/);
assert.match(plugin, /com\.google\.android\.gms\.car\.application/);
assert.match(plugin, /@xml\/automotive_app_desc/);
assert.match(plugin, /fs\.copyFileSync\(sourceXml, destinationXml\)/);
assert.match(plugin, /ensureAndroidManifestService/);
assert.match(plugin, /existingIndex >= 0/);
assert.match(plugin, /expo\.modules\.mediacontrol\.MediaPlaybackService/);
assert.match(plugin, /"tools:node": "remove"/);
assert.match(plugin, /withFinalizedMod/);
assert.match(plugin, /dedupeAndroidManifestPermissions/);
assert.match(
  remoteMediaControls,
  /function isRemoteMediaControlsPlatformEnabled\(\)[\s\S]*?return false;/,
  "legacy expo-media-control must not activate a competing Android MediaSession"
);
assert.equal((plugin.match(/ensureAndroidManifestReceiver\(/g) || []).length, 1,
  "helper declaration is allowed but the plugin must not register a second media-button receiver");

console.log("test-android-auto-plugin-generation: PASS");
