"use strict";

const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  IOSConfig,
  withAndroidManifest,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require("@expo/config-plugins");

const { getMainApplicationOrThrow, addMetaDataItemToMainApplication } =
  AndroidConfig.Manifest;

function buildAndroidManifestServiceEntry(service) {
  const serviceEntry = {
    $: {
      "android:name": service.name,
      "android:exported": service.exported,
      "android:enabled": service.enabled ?? "true",
    },
  };

  if (service.label) {
    serviceEntry.$["android:label"] = service.label;
  }

  if (service.foregroundServiceType) {
    serviceEntry.$["android:foregroundServiceType"] = service.foregroundServiceType;
  }

  const intentActions = service.intentFilterActions
    ? service.intentFilterActions
    : service.intentFilterAction
      ? [service.intentFilterAction]
      : [];

  if (intentActions.length > 0) {
    const intentFilter = {
      action: intentActions.map((actionName) => ({
        $: { "android:name": actionName },
      })),
    };

    if (service.intentFilterCategory) {
      intentFilter.category = [{ $: { "android:name": service.intentFilterCategory } }];
    }

    serviceEntry["intent-filter"] = [intentFilter];
  }

  return serviceEntry;
}

function ensureAndroidManifestService(mainApplication, service) {
  const services = Array.isArray(mainApplication.service)
    ? mainApplication.service
    : mainApplication.service
      ? [mainApplication.service]
      : [];

  const existingIndex = services.findIndex(
    (entry) => entry?.$?.["android:name"] === service.name
  );
  const serviceEntry = buildAndroidManifestServiceEntry(service);

  if (existingIndex >= 0) {
    services[existingIndex] = serviceEntry;
  } else {
    services.push(serviceEntry);
  }

  mainApplication.service = services;
  return mainApplication;
}

function ensureAndroidAutoApplicationCategory(mainApplication) {
  mainApplication.$ = mainApplication.$ ?? {};
  mainApplication.$["android:appCategory"] = "audio";
  return mainApplication;
}

const HIDDEN_AUDIO_GROUP = "HiddenAudioModule";

const NATIVE_FILES = [
  "HiddenAudioModule.swift",
  "HiddenAudioModule.m",
  "CarPlaySceneDelegate.swift",
  "HiddenAudioCarPlayManager.swift",
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



const withCarPlayEntitlements = (config) => {
  return withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.developer.playable-content"] = true;
    return config;
  });
};

const withCarPlayInfoPlist = (config) => {
  return withInfoPlist(config, (config) => {
    config.modResults.UIBackgroundModes = Array.isArray(config.modResults.UIBackgroundModes)
      ? Array.from(new Set([...config.modResults.UIBackgroundModes, "audio"]))
      : ["audio"];

    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: true,
      UISceneConfigurations: {
        CPTemplateApplicationSceneSessionRoleApplication: [
          {
            UISceneClassName: "CPTemplateApplicationScene",
            UISceneConfigurationName: "CarPlay",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).CarPlaySceneDelegate",
          },
        ],
      },
    };

    return config;
  });
};

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
  "HiddenAudioAutoCatalog.kt",
  "HiddenAudioMediaSessionManager.kt",
  "HiddenAudioMediaBrowserService.kt",
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

// Android Auto manifest: MediaBrowserService + automotive_app_desc media
const withHiddenAudioAndroidManifest = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const mainApplication = getMainApplicationOrThrow(manifest);

    ensureAndroidAutoApplicationCategory(mainApplication);

    ensureAndroidManifestService(mainApplication, {
      name: "com.hiddentunes.app.audio.HiddenAudioPlaybackService",
      exported: "false",
      foregroundServiceType: "mediaPlayback",
    });

    ensureAndroidManifestService(mainApplication, {
      name: "com.hiddentunes.app.audio.HiddenAudioMediaBrowserService",
      exported: "true",
      enabled: "true",
      label: "@string/app_name",
      intentFilterActions: ["android.media.browse.MediaBrowserService"],
      intentFilterCategory: "android.intent.category.DEFAULT",
    });

    addMetaDataItemToMainApplication(
      mainApplication,
      "com.google.android.gms.car.application",
      "@xml/automotive_app_desc",
      "resource"
    );

    return config;
  });
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
      }
      if (!contents.includes("HiddenAudioMediaSessionManager")) {
        contents = contents.replace(
          "import com.hiddentunes.app.audio.HiddenAudioPackage",
          "import com.hiddentunes.app.audio.HiddenAudioPackage\nimport com.hiddentunes.app.audio.HiddenAudioMediaSessionManager"
        );
      }
      if (!contents.includes("warmUpForAndroidAuto")) {
        contents = contents.replace(
          "ApplicationLifecycleDispatcher.onApplicationCreate(this)",
          "ApplicationLifecycleDispatcher.onApplicationCreate(this)\n    HiddenAudioMediaSessionManager.warmUpForAndroidAuto(this)"
        );
        fs.writeFileSync(mainAppPath, contents);
      } else if (!contents.includes("HiddenAudioPackage")) {
        fs.writeFileSync(mainAppPath, contents);
      }
      return config;
    },
  ]);
};


const withHiddenAudioAndroidAutoResources = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const { projectRoot, platformProjectRoot } = config.modRequest;
      const sourceXml = path.join(
        projectRoot,
        "plugins",
        "hidden-audio",
        "android",
        "res",
        "xml",
        "automotive_app_desc.xml"
      );
      const destinationXmlDir = path.join(
        platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml"
      );
      fs.mkdirSync(destinationXmlDir, { recursive: true });
      fs.copyFileSync(
        sourceXml,
        path.join(destinationXmlDir, "automotive_app_desc.xml")
      );
      return config;
    },
  ]);
};

const withHiddenAudioAndroidMediaDep = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const gradlePath = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "build.gradle"
      );
      let contents = fs.readFileSync(gradlePath, "utf8");
      const mediaDep = 'implementation "androidx.media:media:1.7.0"';
      if (!contents.includes("androidx.media:media")) {
        contents = contents.replace(
          /dependencies\s*\{/,
          `dependencies {\n    ${mediaDep}`
        );
        fs.writeFileSync(gradlePath, contents);
      }
      return config;
    },
  ]);
};


const withHiddenAudioAndroidProguard = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const proguardPath = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "proguard-rules.pro"
      );
      let contents = fs.readFileSync(proguardPath, "utf8");
      const marker = "# hidden-audio android auto";
      if (!contents.includes(marker)) {
        contents += `\n${marker}\n`;
        contents += "-keep class com.hiddentunes.app.audio.HiddenAudioMediaBrowserService { *; }\n";
        contents += "-keep class com.hiddentunes.app.audio.HiddenAudioMediaSessionManager { *; }\n";
        contents += "-keep class com.hiddentunes.app.audio.HiddenAudioAutoCatalog { *; }\n";
        fs.writeFileSync(proguardPath, contents);
      }
      return config;
    },
  ]);
};

const withHiddenAudio = (config) => {
  config = withCarPlayEntitlements(config);
  config = withCarPlayInfoPlist(config);
  config = withHiddenAudioNativeSources(config);
  config = withHiddenAudioXcodeProject(config);
  config = withHiddenAudioAndroidSources(config);
  config = withHiddenAudioAndroidGradle(config);
  config = withHiddenAudioAndroidManifest(config);
  config = withHiddenAudioAndroidMainApplication(config);
  config = withHiddenAudioAndroidAutoResources(config);
  config = withHiddenAudioAndroidMediaDep(config);
  config = withHiddenAudioAndroidProguard(config);

  console.log(
    "[hidden-audio] HiddenAudio native sources will be copied for iOS and Android during prebuild."
  );

  return config;
};

module.exports = withHiddenAudio;
