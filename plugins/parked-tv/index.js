"use strict";

const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withFinalizedMod,
} = require("@expo/config-plugins");

const AAOS_FLAG = "HIDDEN_TUNES_AAOS";
const AAOS_SUFFIX = ".automotive";
const CAR_APPLICATION_META = "com.google.android.gms.car.application";
const MEDIA_BROWSER_SERVICE =
  "com.hiddentunes.app.audio.HiddenAudioMediaBrowserService";

function isAaosBuild(env = process.env) {
  return env[AAOS_FLAG] === "1";
}

function removeNamed(entries, name) {
  const values = Array.isArray(entries) ? entries : entries ? [entries] : [];
  return values.filter((entry) => entry?.$?.["android:name"] !== name);
}

function configureAaosManifest(manifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  application.$ = application.$ || {};
  application.$["android:appCategory"] = "video";

  // AAOS parked video is a separate surface. Never advertise this artifact to
  // Android Auto, whose supported Hidden Tunes surface remains audio-only.
  application["meta-data"] = removeNamed(
    application["meta-data"],
    CAR_APPLICATION_META
  );
  application.service = removeNamed(
    application.service,
    MEDIA_BROWSER_SERVICE
  );

  const activities = Array.isArray(application.activity)
    ? application.activity
    : application.activity
      ? [application.activity]
      : [];
  for (const activity of activities) {
    activity.$ = activity.$ || {};
    delete activity.$["android:distractionOptimized"];
  }

  const features = Array.isArray(manifest.manifest["uses-feature"])
    ? manifest.manifest["uses-feature"]
    : [];
  if (
    !features.some(
      (entry) =>
        entry?.$?.["android:name"] === "android.hardware.type.automotive"
    )
  ) {
    features.push({
      $: {
        "android:name": "android.hardware.type.automotive",
        "android:required": "true",
      },
    });
  }
  manifest.manifest["uses-feature"] = features;
  return manifest;
}

function patchGradle(contents) {
  let patched = contents.replace(
    /applicationId\s+['"][^'"]+['"]/,
    "applicationId 'com.hiddentunes.app.automotive'"
  );
  if (!patched.includes("hidden-tunes-aaos-build")) {
    patched = patched.replace(
      /defaultConfig\s*\{/,
      `defaultConfig {\n        // hidden-tunes-aaos-build: separate parked-video artifact\n        buildConfigField "boolean", "HIDDEN_TUNES_AAOS", "true"`
    );
  }
  if (!patched.includes("useLibrary 'android.car'")) {
    patched = patched.replace(/android\s*\{/, `android {\n    useLibrary 'android.car'`);
  }
  return patched;
}

const withAaosManifest = (config) =>
  withAndroidManifest(config, (config) => {
    config.modResults = configureAaosManifest(config.modResults);
    return config;
  });

const withAaosNativeSource = (config) =>
  withDangerousMod(config, [
    "android",
    async (config) => {
      const { projectRoot, platformProjectRoot } = config.modRequest;
      const sourceDir = path.join(
        projectRoot,
        "plugins",
        "parked-tv",
        "android"
      );
      const destinationDir = path.join(
        platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        "com",
        "hiddentunes",
        "app",
        "automotive"
      );
      fs.mkdirSync(destinationDir, { recursive: true });
      for (const fileName of ["AutomotiveSafetyModule.kt", "AutomotiveSafetyPackage.kt"]) {
        fs.copyFileSync(path.join(sourceDir, fileName), path.join(destinationDir, fileName));
      }

      const mainApplicationPath = path.join(
        platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        "com",
        "hiddentunes",
        "app",
        "MainApplication.kt"
      );
      let mainApplication = fs.readFileSync(mainApplicationPath, "utf8");
      if (!mainApplication.includes("AutomotiveSafetyPackage")) {
        mainApplication = mainApplication
          .replace(
            "import expo.modules.ExpoReactHostFactory",
            "import com.hiddentunes.app.automotive.AutomotiveSafetyPackage\nimport expo.modules.ExpoReactHostFactory"
          )
          .replace(
            "// add(MyReactNativePackage())",
            "add(AutomotiveSafetyPackage())"
          );
        if (!mainApplication.includes("add(AutomotiveSafetyPackage())")) {
          throw new Error("[parked-tv] Refusing AAOS build: package registration failed");
        }
        fs.writeFileSync(mainApplicationPath, mainApplication);
      }

      const gradlePath = path.join(platformProjectRoot, "app", "build.gradle");
      const original = fs.readFileSync(gradlePath, "utf8");
      const patched = patchGradle(original);
      if (patched === original || !patched.includes("hidden-tunes-aaos-build")) {
        throw new Error("[parked-tv] Refusing AAOS build: Gradle identity patch failed");
      }
      fs.writeFileSync(gradlePath, patched);
      return config;
    },
  ]);

const withFinalAaosContract = (config) =>
  withFinalizedMod(config, [
    "android",
    async (config) => {
      const appRoot = path.join(config.modRequest.platformProjectRoot, "app");
      const manifestPath = path.join(appRoot, "src", "main", "AndroidManifest.xml");
      const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(manifestPath);
      configureAaosManifest(manifest);
      await AndroidConfig.Manifest.writeAndroidManifestAsync(manifestPath, manifest);

      const gradlePath = path.join(appRoot, "build.gradle");
      const gradle = patchGradle(fs.readFileSync(gradlePath, "utf8"));
      if (
        !gradle.includes("applicationId 'com.hiddentunes.app.automotive'") ||
        !gradle.includes("useLibrary 'android.car'")
      ) {
        throw new Error("[parked-tv] Refusing AAOS build: final artifact isolation failed");
      }
      fs.writeFileSync(gradlePath, gradle);
      return config;
    },
  ]);

function withParkedTv(config) {
  if (!isAaosBuild()) {
    console.log(`[parked-tv] disabled (${AAOS_FLAG}=1 required)`);
    return config;
  }
  config = withAaosManifest(config);
  config = withAaosNativeSource(config);
  config = withFinalAaosContract(config);
  return config;
}

module.exports = Object.assign(withParkedTv, {
  AAOS_SUFFIX,
  configureAaosManifest,
  isAaosBuild,
  patchGradle,
});
