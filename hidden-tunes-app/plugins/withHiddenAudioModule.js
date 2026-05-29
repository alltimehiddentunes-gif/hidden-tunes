const fs = require("fs");
const path = require("path");
const {
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require("@expo/config-plugins");

const IOS_FILES = ["HiddenAudioModule.swift", "HiddenAudioModule.m"];
const ANDROID_FILES = [
  "HiddenAudioCore.kt",
  "HiddenAudioModule.kt",
  "HiddenAudioPackage.kt",
  "HiddenAudioService.kt",
];

function copyIosHiddenAudioFiles(config) {
  return withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const projectName = modConfig.modRequest.projectName;
      const iosProjectDir = path.join(modConfig.modRequest.platformProjectRoot, projectName);
      const sourceDir = path.join(__dirname, "hidden-audio", "ios");

      fs.mkdirSync(iosProjectDir, { recursive: true });

      IOS_FILES.forEach((fileName) => {
        fs.copyFileSync(
          path.join(sourceDir, fileName),
          path.join(iosProjectDir, fileName)
        );
      });

      return modConfig;
    },
  ]);
}

function addIosHiddenAudioFilesToProject(config) {
  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const projectName = modConfig.modRequest.projectName;
    const group = project.pbxGroupByName(projectName);

    if (!group) return modConfig;

    IOS_FILES.forEach((fileName) => {
      const filePath = `${projectName}/${fileName}`;
      const alreadyAdded = Object.values(project.pbxFileReferenceSection()).some(
        (file) => file && file.path === fileName
      );

      if (!alreadyAdded) {
        project.addSourceFile(filePath, {}, group.uuid);
      }
    });

    return modConfig;
  });
}

function copyAndroidHiddenAudioFiles(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const sourceDir = path.join(__dirname, "hidden-audio", "android");
      const packageDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        "com",
        "hiddentunes",
        "app",
        "audio"
      );

      fs.mkdirSync(packageDir, { recursive: true });

      ANDROID_FILES.forEach((fileName) => {
        fs.copyFileSync(
          path.join(sourceDir, fileName),
          path.join(packageDir, fileName)
        );
      });

      return modConfig;
    },
  ]);
}

function patchAndroidMainApplication(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const mainApplicationPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        "com",
        "hiddentunes",
        "app",
        "MainApplication.kt"
      );

      let contents = fs.readFileSync(mainApplicationPath, "utf8");
      if (!contents.includes("com.hiddentunes.app.audio.HiddenAudioPackage")) {
        contents = contents.replace(
          "import com.facebook.react.defaults.DefaultReactNativeHost\n",
          "import com.facebook.react.defaults.DefaultReactNativeHost\n\nimport com.hiddentunes.app.audio.HiddenAudioPackage\n"
        );
      }

      if (!contents.includes("add(HiddenAudioPackage())")) {
        contents = contents.replace(
          "// add(MyReactNativePackage())",
          "// add(MyReactNativePackage())\n              add(HiddenAudioPackage())"
        );
      }

      fs.writeFileSync(mainApplicationPath, contents);
      return modConfig;
    },
  ]);
}

function patchAndroidBuildGradle(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const buildGradlePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "build.gradle"
      );
      let contents = fs.readFileSync(buildGradlePath, "utf8");

      if (!contents.includes("androidx.media3:media3-exoplayer")) {
        contents = contents.replace(
          'implementation("com.facebook.react:react-android")',
          'implementation("com.facebook.react:react-android")\n    implementation("androidx.media3:media3-exoplayer:1.4.1")\n    implementation("androidx.media3:media3-session:1.4.1")'
        );
      }

      fs.writeFileSync(buildGradlePath, contents);
      return modConfig;
    },
  ]);
}

function patchAndroidManifest(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const manifestPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "AndroidManifest.xml"
      );
      let contents = fs.readFileSync(manifestPath, "utf8");

      if (!contents.includes(".audio.HiddenAudioService")) {
        contents = contents.replace(
          "<activity ",
          '<service android:name=".audio.HiddenAudioService" android:exported="true" android:foregroundServiceType="mediaPlayback">\n      <intent-filter>\n        <action android:name="androidx.media3.session.MediaSessionService"/>\n      </intent-filter>\n    </service>\n    <activity '
        );
      }

      fs.writeFileSync(manifestPath, contents);
      return modConfig;
    },
  ]);
}

const withHiddenAudioModule = (config) => {
  config = withInfoPlist(config, (modConfig) => {
    const infoPlist = modConfig.modResults;
    const modes = new Set(infoPlist.UIBackgroundModes || []);
    modes.add("audio");
    infoPlist.UIBackgroundModes = Array.from(modes);
    return modConfig;
  });

  config = copyIosHiddenAudioFiles(config);
  config = addIosHiddenAudioFilesToProject(config);
  config = copyAndroidHiddenAudioFiles(config);
  config = patchAndroidMainApplication(config);
  config = patchAndroidBuildGradle(config);
  config = patchAndroidManifest(config);

  return config;
};

module.exports = withHiddenAudioModule;
