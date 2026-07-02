"use strict";

const fs = require("fs");
const path = require("path");
const {
  withDangerousMod,
  withGradleProperties,
  withInfoPlist,
} = require("@expo/config-plugins");

const DEV_CLIENT_MODULES = [
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

function stripDevClientPodLines(contents) {
  const blocked = DEV_CLIENT_MODULES.flatMap((name) => [
    name,
    name.replace(/-/g, "_"),
  ]);

  return contents
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("pod ")) return true;
      return !blocked.some((token) => trimmed.includes(token));
    })
    .join("\n");
}

function stripDevClientGradleReferences(contents) {
  return contents
    .split("\n")
    .filter((line) => {
      const lower = line.toLowerCase();
      return !DEV_CLIENT_MODULES.some((name) => lower.includes(name));
    })
    .join("\n");
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

const withStandaloneAndroidSettings = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const settingsPath = path.join(
        config.modRequest.platformProjectRoot,
        "settings.gradle"
      );

      if (fs.existsSync(settingsPath)) {
        const next = stripDevClientGradleReferences(
          fs.readFileSync(settingsPath, "utf8")
        );
        fs.writeFileSync(settingsPath, next);
      }

      return config;
    },
  ]);
};

const withStandaloneIosPlist = (config) => {
  return withInfoPlist(config, (config) => {
    delete config.modResults.EXDevLauncherEnabled;
    delete config.modResults.EXDevMenuEnabled;
    return config;
  });
};

const withStandaloneIosPodfile = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );

      if (fs.existsSync(podfilePath)) {
        const next = stripDevClientPodLines(fs.readFileSync(podfilePath, "utf8"));
        fs.writeFileSync(podfilePath, next);
      }

      return config;
    },
  ]);
};

module.exports = function withStandaloneBuildGuard(config) {
  config = withStandaloneAndroidGradle(config);
  config = withStandaloneAndroidSettings(config);
  config = withStandaloneIosPlist(config);
  config = withStandaloneIosPodfile(config);
  return config;
};
