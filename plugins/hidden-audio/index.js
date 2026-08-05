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

const ANDROID_AUTO_MEDIA_BROWSER_SERVICE =
  "com.hiddentunes.app.audio.HiddenAudioMediaBrowserService";
const ANDROID_AUTO_CAR_APPLICATION_META =
  "com.google.android.gms.car.application";
const ANDROID_AUTO_DESCRIPTOR_RESOURCE = "@xml/automotive_app_desc";

function verifyAndroidAutoManifest(mainApplication) {
  const services = Array.isArray(mainApplication.service)
    ? mainApplication.service
    : mainApplication.service
      ? [mainApplication.service]
      : [];
  const browserService = services.find(
    (entry) => entry?.$?.["android:name"] === ANDROID_AUTO_MEDIA_BROWSER_SERVICE
  );
  const metaData = Array.isArray(mainApplication["meta-data"])
    ? mainApplication["meta-data"]
    : mainApplication["meta-data"]
      ? [mainApplication["meta-data"]]
      : [];
  const carMeta = metaData.find(
    (entry) => entry?.$?.["android:name"] === ANDROID_AUTO_CAR_APPLICATION_META
  );
  const ok =
    Boolean(browserService) &&
    browserService?.$?.["android:exported"] === "true" &&
    browserService?.$?.["android:enabled"] === "true" &&
    carMeta?.$?.["android:resource"] === ANDROID_AUTO_DESCRIPTOR_RESOURCE;
  console.log(
    `[hidden-audio] Android Auto manifest ${ok ? "verified" : "incomplete"}:`,
    {
      mediaBrowserService: browserService?.$?.["android:name"] || "missing",
      exported: browserService?.$?.["android:exported"] || "missing",
      enabled: browserService?.$?.["android:enabled"] || "missing",
      carApplicationMeta: carMeta?.$?.["android:resource"] || "missing",
      appCategory: mainApplication?.$?.["android:appCategory"] || "missing",
    }
  );
  return ok;
}

const HIDDEN_AUDIO_GROUP = "HiddenAudioModule";

const NATIVE_FILES = [
  "HiddenAudioModule.swift",
  "HiddenAudioModule.m",
  "HiddenAudioCarPlayManager.swift",
  "HiddenAudioCarPlayCatalog.swift",
  "HiddenAudioCarPlayArtworkLoader.swift",
  "HiddenAudioCarPlayTabValidation.swift",
  "CarPlaySceneDelegate.swift",
  "PhoneSceneDelegate.swift",
];

const CARPLAY_MANIFEST_VALIDATION_PHASE = "[HT] Validate CarPlay Scene Manifest";
const CARPLAY_MANIFEST_VALIDATION_SCRIPT =
  '/usr/bin/tr -d \'\\r\' < "${SRCROOT}/../plugins/hidden-audio/ios/validate-carplay-scene-manifest.sh" | /bin/sh';

const CARPLAY_SCENE_ROLE = "CPTemplateApplicationSceneSessionRoleApplication";
const CARPLAY_WINDOW_SCENE_ROLE = "UIWindowSceneSessionRoleCarPlay";
const PHONE_SCENE_ROLE = "UIWindowSceneSessionRoleApplication";

const CARPLAY_SCENE_CONFIG = {
  UISceneClassName: "CPTemplateApplicationScene",
  UISceneConfigurationName: "HiddenTunesCarPlay",
  UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).CarPlaySceneDelegate",
};

const PHONE_SCENE_CONFIG = {
  UISceneClassName: "UIWindowScene",
  UISceneConfigurationName: "HiddenTunesPhone",
  UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).PhoneSceneDelegate",
};

function assertCarPlaySceneManifest(manifest, label) {
  const configs = manifest && manifest.UISceneConfigurations;
  if (!configs || typeof configs !== "object") {
    throw new Error(`[hidden-audio] FATAL: ${label} missing UISceneConfigurations`);
  }

  // This audio-template app must not register the window-CarPlay role at all.
  const windowCarPlayEntries = configs[CARPLAY_WINDOW_SCENE_ROLE];
  if (Array.isArray(windowCarPlayEntries) && windowCarPlayEntries.length > 0) {
    throw new Error(
      `[hidden-audio] FATAL: ${label} must not contain ${CARPLAY_WINDOW_SCENE_ROLE}`
    );
  }

  const requiredRoles = [PHONE_SCENE_ROLE, CARPLAY_SCENE_ROLE];
  if (Object.keys(configs).length !== requiredRoles.length) {
    throw new Error(
      `[hidden-audio] FATAL: ${label} expected exactly ${requiredRoles.length} scene roles`
    );
  }
  for (const role of requiredRoles) {
    const entries = configs[role];
    if (!Array.isArray(entries) || entries.length !== 1) {
      throw new Error(
        `[hidden-audio] FATAL: ${label} expected exactly one scene configuration for ${role}`
      );
    }
  }

  const carPlay = (configs[CARPLAY_SCENE_ROLE] || [])[0] || {};
  if (carPlay.UISceneClassName !== "CPTemplateApplicationScene") {
    throw new Error(
      `[hidden-audio] FATAL: ${label} ${CARPLAY_SCENE_ROLE} must use CPTemplateApplicationScene (got ${carPlay.UISceneClassName})`
    );
  }
  const delegate = String(carPlay.UISceneDelegateClassName || "");
  if (!delegate.includes("CarPlaySceneDelegate")) {
    throw new Error(
      `[hidden-audio] FATAL: ${label} ${CARPLAY_SCENE_ROLE} must use CarPlaySceneDelegate (got ${delegate})`
    );
  }
  if (carPlay.UISceneConfigurationName !== "HiddenTunesCarPlay") {
    throw new Error(
      `[hidden-audio] FATAL: ${label} ${CARPLAY_SCENE_ROLE} must use HiddenTunesCarPlay (got ${carPlay.UISceneConfigurationName})`
    );
  }

  const phone = (configs[PHONE_SCENE_ROLE] || [])[0] || {};
  if (phone.UISceneClassName !== "UIWindowScene") {
    throw new Error(`[hidden-audio] FATAL: ${label} phone scene must remain UIWindowScene`);
  }
  if (phone.UISceneConfigurationName !== "HiddenTunesPhone") {
    throw new Error(
      `[hidden-audio] FATAL: ${label} phone scene must use HiddenTunesPhone`
    );
  }
  if (!String(phone.UISceneDelegateClassName || "").includes("PhoneSceneDelegate")) {
    throw new Error(
      `[hidden-audio] FATAL: ${label} phone role must use PhoneSceneDelegate`
    );
  }
}

function getRepoSourceDir(projectRoot) {
  return path.join(
    projectRoot,
    "plugins",
    "hidden-audio",
    "ios",
    HIDDEN_AUDIO_GROUP
  );
}

const withHiddenAudioEntitlements = (config) => {
  return withEntitlementsPlist(config, (config) => {
    // Audio-template CarPlay only. A video entitlement allows iOS to request a
    // UIWindowSceneSessionRoleCarPlay scene that Expo Development Client can own.
    config.modResults["com.apple.developer.carplay-audio"] = true;
    delete config.modResults["com.apple.developer.carplay-video"];
    delete config.modResults["com.apple.developer.playable-content"];
    return config;
  });
};

const withHiddenAudioInfoPlist = (config) => {
  return withInfoPlist(config, (config) => {
    config.modResults.UIBackgroundModes = Array.isArray(config.modResults.UIBackgroundModes)
      ? Array.from(new Set([...config.modResults.UIBackgroundModes, "audio"]))
      : ["audio"];

    // Dual-scene manifesto: phone UIWindowScene + CarPlay template scene.
    // Do NOT register UIWindowSceneSessionRoleCarPlay with CPTemplateApplicationScene —
    // that pairing crashes UIKit (NSInternalInconsistencyException).
    // CarPlay-only manifesto blanks the iPhone UI on modern iOS SDKs.
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: true,
      UISceneConfigurations: {
        [PHONE_SCENE_ROLE]: [PHONE_SCENE_CONFIG],
        [CARPLAY_SCENE_ROLE]: [CARPLAY_SCENE_CONFIG],
      },
    };

    // Strip any prior invalid window-CarPlay + template pairing.
    if (
      config.modResults.UIApplicationSceneManifest.UISceneConfigurations[
        CARPLAY_WINDOW_SCENE_ROLE
      ]
    ) {
      delete config.modResults.UIApplicationSceneManifest.UISceneConfigurations[
        CARPLAY_WINDOW_SCENE_ROLE
      ];
    }

    assertCarPlaySceneManifest(
      config.modResults.UIApplicationSceneManifest,
      "withInfoPlist UIApplicationSceneManifest"
    );

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

    try {
      xcodeProject.addFramework("CarPlay.framework", {
        weak: false,
        target: targetUuid,
      });
    } catch (error) {
      console.warn(
        "[hidden-audio] CarPlay.framework link skipped:",
        error && error.message ? error.message : error
      );
    }

    const shellPhases = xcodeProject.hash.project.objects.PBXShellScriptBuildPhase || {};
    const hasValidationPhase = Object.values(shellPhases).some(
      (phase) =>
        phase &&
        typeof phase === "object" &&
        String(phase.name || "").includes(CARPLAY_MANIFEST_VALIDATION_PHASE)
    );
    if (!hasValidationPhase) {
      xcodeProject.addBuildPhase(
        [],
        "PBXShellScriptBuildPhase",
        CARPLAY_MANIFEST_VALIDATION_PHASE,
        targetUuid,
        {
          shellPath: "/bin/sh",
          shellScript: CARPLAY_MANIFEST_VALIDATION_SCRIPT,
          inputPaths: ['"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)"'],
          outputPaths: [],
        }
      );
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
  "HiddenAudioPlaybackTransaction.kt",
  "HiddenAudioPendingCommandQueue.kt",
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

function ensureAndroidManifestReceiver(mainApplication, receiver) {
  const receivers = Array.isArray(mainApplication.receiver)
    ? mainApplication.receiver
    : mainApplication.receiver
      ? [mainApplication.receiver]
      : [];

  const existingIndex = receivers.findIndex(
    (entry) => entry?.$?.["android:name"] === receiver.name
  );
  const receiverEntry = {
    $: {
      "android:name": receiver.name,
      "android:exported": receiver.exported,
      "android:enabled": receiver.enabled ?? "true",
    },
  };
  if (receiver.intentFilterActions?.length) {
    receiverEntry["intent-filter"] = [
      {
        action: receiver.intentFilterActions.map((actionName) => ({
          $: { "android:name": actionName },
        })),
      },
    ];
  }
  if (existingIndex >= 0) {
    receivers[existingIndex] = receiverEntry;
  } else {
    receivers.push(receiverEntry);
  }
  mainApplication.receiver = receivers;
  return mainApplication;
}

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

    // MediaBrowserService must be exported for Android Auto discovery.
    // Do NOT mark it as a foreground-service type — playback FGS is separate.
    ensureAndroidManifestService(mainApplication, {
      name: ANDROID_AUTO_MEDIA_BROWSER_SERVICE,
      exported: "true",
      enabled: "true",
      label: "@string/app_name",
      intentFilterActions: ["android.media.browse.MediaBrowserService"],
      intentFilterCategory: "android.intent.category.DEFAULT",
    });

    // Do NOT register a second MEDIA_BUTTON BroadcastReceiver.
    // expo-media-control already declares androidx.media.session.MediaButtonReceiver.
    // Duplicate receivers break Expo Video / Media3 (Expected 1, found 2).

    addMetaDataItemToMainApplication(
      mainApplication,
      ANDROID_AUTO_CAR_APPLICATION_META,
      ANDROID_AUTO_DESCRIPTOR_RESOURCE,
      "resource"
    );

    verifyAndroidAutoManifest(mainApplication);

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
      const originalContents = fs.readFileSync(mainAppPath, "utf8");
      let contents = originalContents;
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
      }
      if (contents !== originalContents) {
        fs.writeFileSync(mainAppPath, contents);
        console.log("[hidden-audio] MainApplication updated for Android Auto warm-up.");
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
      if (!fs.existsSync(sourceXml)) {
        throw new Error(
          `[hidden-audio] Missing Android Auto descriptor: ${sourceXml}`
        );
      }
      fs.mkdirSync(destinationXmlDir, { recursive: true });
      const destinationXml = path.join(destinationXmlDir, "automotive_app_desc.xml");
      fs.copyFileSync(sourceXml, destinationXml);
      console.log(
        `[hidden-audio] Copied Android Auto descriptor to ${destinationXml}`
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
        contents += "-keep class com.hiddentunes.app.audio.HiddenAudioPlaybackTransaction { *; }\n";
        contents += "-keep class com.hiddentunes.app.audio.HiddenAudioPendingCommandQueue { *; }\n";
        fs.writeFileSync(proguardPath, contents);
      }
      return config;
    },
  ]);
};

const {
  CARPLAY_SCENE_CONFIGURATION_METHOD,
  hasCompleteCarPlaySceneRouter,
  countConfigurationForConnectingMethods,
  ensureCarPlaySceneConfiguration,
} = require("./carPlaySceneRouter");

const withHiddenAudioAppDelegate = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const { platformProjectRoot, projectRoot } = config.modRequest;
      const appName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
      const appDelegatePath = path.join(
        platformProjectRoot,
        appName,
        "AppDelegate.swift"
      );

      if (!fs.existsSync(appDelegatePath)) {
        console.warn(
          `[hidden-audio] AppDelegate.swift not found at ${appDelegatePath}; phone scene attach skipped.`
        );
        return config;
      }

      let contents = fs.readFileSync(appDelegatePath, "utf8");
      let wrote = false;

      if (contents.includes("func attachReactNative(to window: UIWindow)")) {
        console.log("[hidden-audio] AppDelegate already supports scene-based RN attach.");
      } else if (!contents.includes("factory.startReactNative(")) {
        console.warn(
          "[hidden-audio] Unexpected AppDelegate.swift shape; skipping scene attach patch."
        );
      } else {
        // Move RN window attach out of didFinishLaunching so PhoneSceneDelegate owns the UIWindow.
        contents = contents.replace(
          /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\(\s*\n\s*withModuleName: "main",\s*\n\s*in: window,\s*\n\s*launchOptions: launchOptions\)\s*\n#endif/,
          `pendingLaunchOptions = launchOptions

    // Phone UIWindow is created by PhoneSceneDelegate under UIApplicationSceneManifest.
    // Keep the factory ready here so CarPlay can still connect without a phone window.`
        );

        if (!contents.includes("private var pendingLaunchOptions")) {
          contents = contents.replace(
            "var reactNativeFactory: RCTReactNativeFactory?",
            `var reactNativeFactory: RCTReactNativeFactory?
  private var pendingLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?
  private var didAttachReactNative = false`
          );
        }

        if (!contents.includes("func attachReactNative(to window: UIWindow)")) {
          contents = contents.replace(
            /return super\.application\(application, didFinishLaunchingWithOptions: launchOptions\)\n  \}/,
            `return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func attachReactNative(to window: UIWindow) {
    self.window = window
    guard !didAttachReactNative, let factory = reactNativeFactory else { return }
    didAttachReactNative = true
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: pendingLaunchOptions
    )
    pendingLaunchOptions = nil
  }`
          );
        }

        wrote = true;
        console.log("[hidden-audio] AppDelegate patched for PhoneSceneDelegate RN attach.");
      }

      const sceneConfig = ensureCarPlaySceneConfiguration(contents);
      contents = sceneConfig.contents;
      if (sceneConfig.changed) {
        wrote = true;
        console.log(
          `[hidden-audio] AppDelegate patched with CarPlay configurationForConnecting (${sceneConfig.reason}).`
        );
      } else if (sceneConfig.reason === "already_complete") {
        console.log(
          "[hidden-audio] AppDelegate already has complete CarPlay configurationForConnecting."
        );
      } else {
        // Fail the native build rather than ship a binary that shows CarPlay wallpaper
        // because configurationForConnecting never selects CarPlaySceneDelegate.
        throw new Error(
          `[hidden-audio] FATAL: AppDelegate CarPlay scene router not applied (${sceneConfig.reason}). ` +
            "CarPlay blank wallpaper would result without CarPlaySceneDelegate routing."
        );
      }

      if (wrote) {
        fs.writeFileSync(appDelegatePath, contents);
      }
      return config;
    },
  ]);
};

const withHiddenAudio = (config) => {
  config = withHiddenAudioEntitlements(config);
  config = withHiddenAudioInfoPlist(config);
  config = withHiddenAudioNativeSources(config);
  config = withHiddenAudioXcodeProject(config);
  config = withHiddenAudioAppDelegate(config);
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

module.exports = Object.assign(withHiddenAudio, {
  ensureCarPlaySceneConfiguration,
  hasCompleteCarPlaySceneRouter,
  countConfigurationForConnectingMethods,
  CARPLAY_SCENE_CONFIGURATION_METHOD,
});
// Prefer requiring ./carPlaySceneRouter directly in tests (plain object export).
