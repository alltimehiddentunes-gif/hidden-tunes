"use strict";

const {
  withDangerousMod,
  withGradleProperties,
  withInfoPlist,
} = require("@expo/config-plugins");

const DEV_CLIENT_PODS = [
  "expo-dev-client",
  "expo-dev-launcher",
  "expo-dev-menu",
  "expo-dev-menu-interface",
];

function upsertGradleProperty(modResults, key, value) {
  const next = modResults.filter(
    (entry) => entry.type !== "property" || entry.key !== key
  );
  next.push({ type: "property", key, value });
  return next;
}

const withStandaloneAndroidGradle = (config) => {
  return withGradleProperties(config, (config) => {
    config.modResults = upsertGradleProperty(
      config.modResults,
      "EX_DEV_CLIENT_NETWORK_INSPECTOR",
      "false"
    );
    return config;
  });
};

const withStandaloneIosPlist = (config) => {
  return withInfoPlist(config, (config) => {
    delete config.modResults.EXDevLauncherEnabled;
    delete config.modResults.EXDevMenuEnabled;
    delete config.modResults.NSBonjourServices;
    delete config.modResults.NSLocalNetworkUsageDescription;
    return config;
  });
};

const withStandaloneIosPodfile = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const fs = require("fs");
      const path = require("path");
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );

      if (!fs.existsSync(podfilePath)) {
        return config;
      }

      const blocked = DEV_CLIENT_PODS.flatMap((name) => [
        name,
        name.replace(/-/g, "_"),
      ]);

      const next = fs
        .readFileSync(podfilePath, "utf8")
        .split("\n")
        .filter((line) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith("pod ")) return true;
          return !blocked.some((token) => trimmed.includes(token));
        })
        .join("\n");

      fs.writeFileSync(podfilePath, next);
      return config;
    },
  ]);
};

module.exports = function withStandaloneBuildGuard(config) {
  config = withStandaloneAndroidGradle(config);
  config = withStandaloneIosPlist(config);
  config = withStandaloneIosPodfile(config);
  return config;
};
