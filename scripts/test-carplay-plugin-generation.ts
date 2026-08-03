/**
 * Simulates the hidden-audio config plugin native generation (clean prebuild).
 * Confirms Favorites/tab validation sources AND AppDelegate scene router injection.
 *
 * Run: npx tsx scripts/test-carplay-plugin-generation.ts
 */
// @ts-nocheck
const fs = require("fs");
const path = require("path");
const os = require("os");
const { createRequire } = require("module");

const root = process.cwd();
// Plain-object module — survives tsx interop (unlike function default export + attached props).
const requireFromRoot = createRequire(path.join(root, "package.json"));
const plugin = requireFromRoot("./plugins/hidden-audio/carPlaySceneRouter.js");

function assertOk(condition, label) {
  if (!condition) throw new Error(label);
}

const BASE_APP_DELEGATE = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  private var pendingLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?
  private var didAttachReactNative = false

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    pendingLaunchOptions = launchOptions
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
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
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options)
  }
}
`;

function assertAppDelegateRouter(contents, label) {
  assertOk(
    plugin.hasCompleteCarPlaySceneRouter(contents),
    `${label}: complete CarPlay scene router`
  );
  assertOk(
    plugin.countConfigurationForConnectingMethods(contents) === 1,
    `${label}: exactly one configurationForConnecting`
  );
  assertOk(
    contents.includes("CPTemplateApplicationSceneSessionRoleApplication"),
    `${label}: CarPlay scene role check`
  );
  assertOk(
    contents.includes("reject_invalid_pairing"),
    `${label}: rejects UIWindowSceneSessionRoleCarPlay + template`
  );
  assertOk(
    contents.includes("@objc public func application("),
    `${label}: ObjC-visible configurationForConnecting`
  );
  assertOk(
    contents.includes("[HTCarPlayNative] configurationForConnecting.enter"),
    `${label}: HTCarPlayNative enter log`
  );
  assertOk(
    contents.includes("[HTCarPlayNative] configurationForConnecting.exit") ||
      contents.includes("reject_invalid_pairing"),
    `${label}: HTCarPlayNative exit/reject log`
  );
  assertOk(
    contents.includes("CarPlaySceneDelegate.self"),
    `${label}: CarPlaySceneDelegate.self`
  );
  assertOk(
    contents.includes("PhoneSceneDelegate.self"),
    `${label}: PhoneSceneDelegate.self preserved`
  );
  assertOk(
    !contents.includes("override func application(\n    _ application: UIApplication,\n    configurationForConnecting"),
    `${label}: does not incorrectly override ExpoAppDelegate`
  );
  assertOk(
    contents.includes("// Linking API"),
    `${label}: Linking API marker preserved`
  );
}

function main() {
  const pluginPath = path.join(root, "plugins/hidden-audio/index.js");
  const pluginSource = fs.readFileSync(pluginPath, "utf8");

  const nativeFilesMatch = pluginSource.match(/const NATIVE_FILES = \[([\s\S]*?)\];/);
  assertOk(nativeFilesMatch, "NATIVE_FILES present in plugin");

  const listed = [...nativeFilesMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assertOk(listed.includes("HiddenAudioCarPlayManager.swift"), "manager in NATIVE_FILES");
  assertOk(listed.includes("HiddenAudioCarPlayCatalog.swift"), "catalog in NATIVE_FILES");
  assertOk(listed.includes("HiddenAudioCarPlayTabValidation.swift"), "validation in NATIVE_FILES");
  assertOk(listed.includes("CarPlaySceneDelegate.swift"), "scene in NATIVE_FILES");

  const sourceDir = path.join(root, "plugins/hidden-audio/ios/HiddenAudioModule");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ht-carplay-prebuild-"));

  for (const fileName of listed) {
    const src = path.join(sourceDir, fileName);
    assertOk(fs.existsSync(src), `source exists: ${fileName}`);
    fs.copyFileSync(src, path.join(outDir, fileName));
  }

  // Also mirror into the local ios project copy (same as prebuild destination shape).
  const iosDest = path.join(root, "ios/HiddenTunes/HiddenAudioModule");
  fs.mkdirSync(iosDest, { recursive: true });
  for (const fileName of listed) {
    fs.copyFileSync(path.join(sourceDir, fileName), path.join(iosDest, fileName));
  }

  const generatedCatalog = fs.readFileSync(path.join(outDir, "HiddenAudioCarPlayCatalog.swift"), "utf8");
  const generatedManager = fs.readFileSync(path.join(outDir, "HiddenAudioCarPlayManager.swift"), "utf8");
  const generatedValidation = fs.readFileSync(
    path.join(outDir, "HiddenAudioCarPlayTabValidation.swift"),
    "utf8"
  );
  const generatedScene = fs.readFileSync(path.join(outDir, "CarPlaySceneDelegate.swift"), "utf8");
  const iosCatalog = fs.readFileSync(path.join(iosDest, "HiddenAudioCarPlayCatalog.swift"), "utf8");
  const iosValidation = fs.readFileSync(
    path.join(iosDest, "HiddenAudioCarPlayTabValidation.swift"),
    "utf8"
  );

  assertOk(generatedCatalog.includes("sanitizedFavoritesNodes"), "generated catalog sanitizer");
  assertOk(generatedCatalog.includes("No favorites yet"), "generated empty favorites copy");
  assertOk(generatedManager.includes("makeFavoritesSection"), "generated favorites section");
  assertOk(generatedManager.includes("validateCarPlayTabs"), "generated validates tabs");
  assertOk(generatedManager.includes("emitLifecycleDiagnostic"), "generated lifecycle diagnostic helper");
  assertOk(generatedValidation.includes("func validateCarPlayTabs"), "generated validator");
  assertOk(generatedScene.includes("didConnect entered"), "generated scene connect diagnostic");
  assertOk(generatedScene.includes("carplay_scene_delegate_initialized"), "generated scene init diagnostic");
  assertOk(generatedScene.includes("rootInstallConfirmed: true"), "generated confirmed-root attach");
  assertOk(generatedScene.includes("installSafeRoot"), "generated bounded root install");
  assertOk(generatedManager.includes("scheduleValidatedTabUpgrade"), "generated deferred tab upgrade");
  assertOk(generatedManager.includes("rootInstallConfirmed"), "generated root confirmation gate");
  assertOk(iosCatalog.includes("sanitizedFavoritesNodes"), "ios copy has sanitizer");
  assertOk(iosValidation.includes("func validateCarPlayTabs"), "ios copy has validator");

  assertOk(
    generatedManager.indexOf("HiddenAudioCarPlayTabValidation.validateCarPlayTabs(templates)") <
      generatedManager.indexOf("CPTabBarTemplate(templates: templates)"),
    "generated: validation before CPTabBarTemplate"
  );

  assertOk(
    pluginSource.includes("FATAL: AppDelegate CarPlay scene router not applied"),
    "plugin fails build when AppDelegate router missing"
  );

  // --- AppDelegate router injection (must not rely on hand-edited /ios) ---
  const first = plugin.ensureCarPlaySceneConfiguration(BASE_APP_DELEGATE);
  assertOk(first.changed, "first injection changes AppDelegate");
  assertAppDelegateRouter(first.contents, "first injection");

  const second = plugin.ensureCarPlaySceneConfiguration(first.contents);
  assertOk(!second.changed, "second injection is idempotent");
  assertOk(second.reason === "already_complete", "second injection reports already_complete");
  assertAppDelegateRouter(second.contents, "idempotent re-run");

  // Stale dual-role router must be repaired.
  const incomplete = first.contents.replace(
    "reject_invalid_pairing",
    "accept_invalid_pairing"
  );
  assertOk(!plugin.hasCompleteCarPlaySceneRouter(incomplete), "incomplete fixture detected");
  const repaired = plugin.ensureCarPlaySceneConfiguration(incomplete);
  assertOk(repaired.changed, "incomplete router repaired");
  assertAppDelegateRouter(repaired.contents, "repaired injection");

  // Preserve hand-edited AppDelegate evidence separately; do not treat it as pass criteria.
  const handEditEvidence = path.join(
    os.tmpdir(),
    "hidden-tunes-appdelegate-handedit-evidence.swift"
  );
  if (fs.existsSync(handEditEvidence)) {
    console.log(`hand-edit evidence present: ${handEditEvidence}`);
  }

  console.log("carplay-plugin-generation: ok");
  console.log(`temp generated dir: ${outDir}`);
  console.log(`ios synced: ${iosDest}`);
  console.log(`files copied: ${listed.join(", ")}`);
  console.log("appdelegate-router: injected + idempotent + repair-verified");
}

main();
