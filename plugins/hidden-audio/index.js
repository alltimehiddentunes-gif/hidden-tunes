"use strict";

const fs = require("fs");
const path = require("path");
const {
  IOSConfig,
  withDangerousMod,
  withXcodeProject,
} = require("@expo/config-plugins");

const HIDDEN_AUDIO_GROUP = "HiddenAudioModule";

const NATIVE_FILES = [
  "HiddenAudioModule.swift",
  "HiddenAudioModule.m"
];

function getRepoSourceDir(projectRoot) {
  return path.join(
    projectRoot,
    "plugins",
    "hidden-audio",
    "ios",
    HIDDEN_AUDIO_GROUP
  );
}

const withHiddenAudioNativeSources = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const { projectRoot, platformProjectRoot } = config.modRequest;
      const appName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
      const sourceDir = getRepoSourceDir(projectRoot);

      const destinationDir = path.join(
        platformProjectRoot,
        appName,
        HIDDEN_AUDIO_GROUP
      );

      fs.mkdirSync(destinationDir, { recursive: true });

      for (const fileName of NATIVE_FILES) {
        fs.copyFileSync(
          path.join(sourceDir, fileName),
          path.join(destinationDir, fileName)
        );
      }

      return config;
    },
  ]);
};

const withHiddenAudioXcodeProject = (config) => {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    const appName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const targetUuid = xcodeProject.getFirstTarget().uuid;

    let groupKey = xcodeProject.findPBXGroupKey({ name: HIDDEN_AUDIO_GROUP });
    if (!groupKey) {
      groupKey = xcodeProject.pbxCreateGroup(
        HIDDEN_AUDIO_GROUP,
        `${appName}/${HIDDEN_AUDIO_GROUP}`
      );
      const mainGroup = xcodeProject.getFirstProject().firstProject.mainGroup;
      xcodeProject.addToPbxGroup(groupKey, mainGroup);
    }

    for (const fileName of NATIVE_FILES) {
      const filePath = fileName;

      if (!xcodeProject.hasFile(filePath)) {
        xcodeProject.addSourceFile(filePath, { target: targetUuid }, groupKey);
      }
    }

    return config;
  });
};



const ANDROID_FILES = [
  "HiddenAudioModule.kt",
  "HiddenAudioCore.kt",
  "HiddenAudioPlaybackService.kt",
  "HiddenAudioPackage.kt",
];

function getAndroidSourceDir(projectRoot) {
  return path.join(projectRoot, "plugins", "hidden-audio", "android");
}

const withHiddenAudioAndroidSources = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const { projectRoot, platformProjectRoot } = config.modRequest;
      const sourceDir = getAndroidSourceDir(projectRoot);
      const destinationDir = path.join(
        platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        "com",
        "hiddentunes",
        "app",
        "audio"
      );

      fs.mkdirSync(destinationDir, { recursive: true });

      for (const fileName of ANDROID_FILES) {
        fs.copyFileSync(
          path.join(sourceDir, fileName),
          path.join(destinationDir, fileName)
        );
      }

      return config;
    },
  ]);
};

const withHiddenAudioAndroidGradle = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const gradlePath = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "build.gradle"
      );
      let contents = fs.readFileSync(gradlePath, "utf8");
      const dep = 'implementation "androidx.media3:media3-exoplayer:1.4.1"';
      if (!contents.includes("media3-exoplayer")) {
        contents = contents.replace(
          /dependencies\s*\{/,
          `dependencies {\n    ${dep}\n    implementation "androidx.media3:media3-session:1.4.1"`
        );
        fs.writeFileSync(gradlePath, contents);
      }
      return config;
    },
  ]);
};

const withHiddenAudioAndroidManifest = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const manifestPath = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "AndroidManifest.xml"
      );
      let contents = fs.readFileSync(manifestPath, "utf8");
      const serviceTag =
        '<service android:name="com.hiddentunes.app.audio.HiddenAudioPlaybackService" android:exported="false" android:foregroundServiceType="mediaPlayback" />';
      if (!contents.includes("HiddenAudioPlaybackService")) {
        contents = contents.replace(
          "</application>",
          `    ${serviceTag}\n  </application>`
        );
        fs.writeFileSync(manifestPath, contents);
      }
      return config;
    },
  ]);
};

const withHiddenAudioAndroidMainApplication = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const mainAppPath = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        "com",
        "hiddentunes",
        "app",
        "MainApplication.kt"
      );
      let contents = fs.readFileSync(mainAppPath, "utf8");
      if (!contents.includes("HiddenAudioPackage")) {
        if (contents.includes("ExpoReactHostFactory")) {
          contents = contents.replace(
            "import expo.modules.ExpoReactHostFactory",
            "import com.hiddentunes.app.audio.HiddenAudioPackage\nimport expo.modules.ExpoReactHostFactory"
          );
        }
        contents = contents.replace(
          "// add(MyReactNativePackage())",
          "add(HiddenAudioPackage())"
        );
        fs.writeFileSync(mainAppPath, contents);
      }
      return config;
    },
  ]);
};

const withHiddenAudio = (config) => {
  config = withHiddenAudioNativeSources(config);
  config = withHiddenAudioXcodeProject(config);
  config = withHiddenAudioAndroidSources(config);
  config = withHiddenAudioAndroidGradle(config);
  config = withHiddenAudioAndroidManifest(config);
  config = withHiddenAudioAndroidMainApplication(config);

  console.log(
    "[hidden-audio] HiddenAudio native sources will be copied for iOS and Android during prebuild."
  );

  return config;
};

module.exports = withHiddenAudio;
