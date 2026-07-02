#!/usr/bin/env node
/**
 * Validate generated ios/ project for standalone native startup safety.
 */
const fs = require("fs");
const path = require("path");

const iosRoot = path.join(__dirname, "..", "ios");
const podfilePath = path.join(iosRoot, "Podfile");
const workspacePath = path.join(iosRoot, "HiddenTunes.xcworkspace");
const projectPath = path.join(iosRoot, "HiddenTunes.xcodeproj");

const blockedPodTokens = [
  "expo-dev-client",
  "expo-dev-launcher",
  "expo-dev-menu",
];

function fail(message) {
  console.error(`[verify-ios-native] FAIL: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(iosRoot)) {
  fail(
    "ios/ folder missing. Run: npm run prebuild:ios:standalone (on Mac or any host to generate), then pod install on macOS."
  );
}

if (!fs.existsSync(podfilePath)) {
  fail("ios/Podfile missing.");
}

const podfile = fs.readFileSync(podfilePath, "utf8");
for (const token of blockedPodTokens) {
  if (podfile.includes(token)) {
    fail(`Podfile still references ${token}`);
  }
}

const podfilePropertiesPath = path.join(iosRoot, "Podfile.properties.json");
if (fs.existsSync(podfilePropertiesPath)) {
  const properties = JSON.parse(fs.readFileSync(podfilePropertiesPath, "utf8"));
  if (properties.EX_DEV_CLIENT_NETWORK_INSPECTOR === "true") {
    fail("Podfile.properties.json still enables EX_DEV_CLIENT_NETWORK_INSPECTOR");
  }
}

if (podfile.includes("EXDevLauncher") || podfile.includes("EXDevMenu")) {
  fail("Podfile still references Expo dev launcher/menu pods.");
}

const pbxprojGlob = fs
  .readdirSync(projectPath)
  .find((name) => name === "project.pbxproj");

if (!pbxprojGlob) {
  fail("ios/HiddenTunes.xcodeproj/project.pbxproj missing.");
}

const pbxproj = fs.readFileSync(
  path.join(projectPath, "project.pbxproj"),
  "utf8"
);

for (const token of blockedPodTokens) {
  if (pbxproj.includes(token)) {
    fail(`Xcode project still references ${token}`);
  }
}

if (!fs.existsSync(workspacePath) && !fs.existsSync(projectPath)) {
  fail("No Xcode workspace or project found.");
}

console.log("[verify-ios-native] OK: ios/ project looks standalone-safe.");
console.log(
  "[verify-ios-native] Next on macOS: cd ios && pod install && open HiddenTunes.xcworkspace"
);
