#!/usr/bin/env node
/**
 * Sanity-check that preview/production builds ship as standalone Hidden Tunes
 * (no expo-dev-client plugin or autolinking in resolved config).
 */
const path = require("path");

function loadConfig(profile) {
  process.env.EAS_BUILD_PROFILE = profile;
  process.env.EXPO_PUBLIC_BUILD_PROFILE = profile;
  const configPath = path.join(__dirname, "..", "app.config.js");
  delete require.cache[require.resolve(configPath)];
  const appConfig = require(configPath);
  return appConfig({ config: {} });
}

function loadReactNativeConfig(profile) {
  process.env.EAS_BUILD_PROFILE = profile;
  process.env.EXPO_PUBLIC_BUILD_PROFILE = profile;
  const configPath = path.join(__dirname, "..", "react-native.config.js");
  delete require.cache[require.resolve(configPath)];
  return require(configPath);
}

function pluginNames(plugins = []) {
  return plugins.map((entry) => (Array.isArray(entry) ? entry[0] : entry));
}

function assertStandalone(profile) {
  const resolved = loadConfig(profile);
  const names = pluginNames(resolved.plugins);
  const hasDevClient = names.includes("expo-dev-client");

  if (hasDevClient) {
    console.error(
      `[verify-preview-config] FAIL: ${profile} build still includes expo-dev-client`
    );
    process.exit(1);
  }

  if (resolved.name !== "Hidden Tunes") {
    console.error(
      `[verify-preview-config] FAIL: ${profile} app name is "${resolved.name}", expected "Hidden Tunes"`
    );
    process.exit(1);
  }

  if (resolved.extra?.isStandaloneBuild !== true) {
    console.error(
      `[verify-preview-config] FAIL: ${profile} extra.isStandaloneBuild is not true`
    );
    process.exit(1);
  }

  if (!names.includes("./plugins/standalone-build-guard")) {
    console.error(
      `[verify-preview-config] FAIL: ${profile} build missing ./plugins/standalone-build-guard`
    );
    process.exit(1);
  }

  const rnConfig = loadReactNativeConfig(profile);
  const disabled = { ios: null, android: null };

  for (const pkg of [
    "expo-dev-client",
    "expo-dev-launcher",
    "expo-dev-menu",
    "expo-dev-menu-interface",
  ]) {
    const platforms = rnConfig.dependencies?.[pkg]?.platforms;
    if (
      platforms?.ios !== disabled.ios ||
      platforms?.android !== disabled.android
    ) {
      console.error(
        `[verify-preview-config] FAIL: ${profile} react-native.config must disable ${pkg} on both platforms`
      );
      process.exit(1);
    }
  }

  console.log(`[verify-preview-config] OK: ${profile} standalone config`);
}

assertStandalone("preview");
assertStandalone("production");
assertStandalone("local");

const devResolved = loadConfig("developmentClient");
if (!pluginNames(devResolved.plugins).includes("expo-dev-client")) {
  console.error(
    "[verify-preview-config] FAIL: developmentClient build missing expo-dev-client"
  );
  process.exit(1);
}

const devRnConfig = loadReactNativeConfig("developmentClient");
const devOnlyKeys = Object.keys(devRnConfig.dependencies || {}).filter(
  (key) => key !== "react-native-track-player"
);
if (devOnlyKeys.length > 0) {
  console.error(
    "[verify-preview-config] FAIL: developmentClient must not disable dev-client autolinking"
  );
  process.exit(1);
}

console.log("[verify-preview-config] OK: developmentClient includes expo-dev-client");
console.log("[verify-preview-config] All checks passed.");
