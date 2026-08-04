/**
 * Idempotent AppDelegate injection for CarPlay + phone scene routing.
 * Permanent source of truth — /ios is gitignored and may be regenerated.
 *
 * SDK role constant for template/audio CarPlay apps:
 *   CPTemplateApplicationSceneSessionRoleApplication
 *
 * Do NOT pair UIWindowSceneSessionRoleCarPlay with CPTemplateApplicationScene —
 * UIKit throws NSInternalInconsistencyException on that combination.
 */

const CARPLAY_TEMPLATE_ROLE = "CPTemplateApplicationSceneSessionRoleApplication";
const CARPLAY_WINDOW_ROLE = "UIWindowSceneSessionRoleCarPlay";
const CARPLAY_CONFIG_NAME = "HiddenTunesCarPlay";

const CARPLAY_SCENE_CONFIGURATION_METHOD = `
  // ExpoAppDelegate does not declare this UIApplicationDelegate method, so do not mark override.
  @objc public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let role = connectingSceneSession.role.rawValue
    let sessionId = connectingSceneSession.persistentIdentifier
    let mainThread = Thread.isMainThread ? 1 : 0
    NSLog(
      "[HTCarPlayNative] configurationForConnecting.enter role=%@ sessionId=%@ mainThread=%d",
      role,
      sessionId,
      mainThread
    )
    NSLog("[HTCarPlay] configurationForConnecting role=%@", role)

    // This audio-template app never presents a vehicle UIWindow. If a stale
    // entitlement/profile causes this role to arrive, a dedicated no-window
    // delegate destroys it before Expo/React can attach a root view.
    if role == "${CARPLAY_WINDOW_ROLE}" {
      NSLog(
        "[HTCarPlayNative] configurationForConnecting.reject_invalid_pairing role=%@ reason=window_role_requires_UIWindowScene sessionId=%@",
        role,
        sessionId
      )
      let configuration = UISceneConfiguration(
        name: "HiddenTunesRejectedCarPlayWindow",
        sessionRole: connectingSceneSession.role
      )
      configuration.sceneClass = UIWindowScene.self
      configuration.delegateClass = RejectedCarPlayWindowSceneDelegate.self
      return configuration
    }

    if role == "${CARPLAY_TEMPLATE_ROLE}" {
      let configuration = UISceneConfiguration(
        name: "${CARPLAY_CONFIG_NAME}",
        sessionRole: connectingSceneSession.role
      )
      configuration.delegateClass = CarPlaySceneDelegate.self
      let delegateName = NSStringFromClass(CarPlaySceneDelegate.self)
      let resolvedObjc = NSClassFromString("CarPlaySceneDelegate") != nil ? 1 : 0
      let resolvedModule = NSClassFromString("HiddenTunes.CarPlaySceneDelegate") != nil ? 1 : 0
      NSLog(
        "[HTCarPlayNative] configurationForConnecting.exit name=${CARPLAY_CONFIG_NAME} sceneClass=CPTemplateApplicationScene delegateClass=%@ nsClassObjc=%d nsClassModule=%d role=%@ sessionId=%@ mainThread=%d",
        delegateName,
        resolvedObjc,
        resolvedModule,
        role,
        sessionId,
        mainThread
      )
      NSLog("[HTCarPlay] configurationForConnecting selected=CarPlaySceneDelegate")
      return configuration
    }

    if connectingSceneSession.role == .windowApplication {
      let configuration = UISceneConfiguration(
        name: "HiddenTunesPhone",
        sessionRole: connectingSceneSession.role
      )
      configuration.delegateClass = PhoneSceneDelegate.self
      let delegateName = NSStringFromClass(PhoneSceneDelegate.self)
      NSLog(
        "[HTCarPlayNative] configurationForConnecting.exit name=HiddenTunesPhone sceneClass=UIWindowScene delegateClass=%@ role=%@ sessionId=%@ mainThread=%d",
        delegateName,
        role,
        sessionId,
        mainThread
      )
      return configuration
    }

    let fallbackName = connectingSceneSession.configuration.name ?? "<nil>"
    NSLog(
      "[HTCarPlayNative] configurationForConnecting.exit name=%@ sceneClass=<session-default> delegateClass=<unset> role=%@ sessionId=%@ mainThread=%d",
      fallbackName,
      role,
      sessionId,
      mainThread
    )
    return UISceneConfiguration(
      name: connectingSceneSession.configuration.name,
      sessionRole: connectingSceneSession.role
    )
  }
`;

function hasCompleteCarPlaySceneRouter(contents) {
  return (
    contents.includes("configurationForConnecting connectingSceneSession") &&
    contents.includes(CARPLAY_TEMPLATE_ROLE) &&
    contents.includes("reject_invalid_pairing") &&
    contents.includes(CARPLAY_WINDOW_ROLE) &&
    contents.includes("RejectedCarPlayWindowSceneDelegate.self") &&
    contents.includes("CarPlaySceneDelegate.self") &&
    contents.includes("PhoneSceneDelegate.self") &&
    contents.includes(".windowApplication") &&
    contents.includes("@objc public func application(") &&
    !contents.includes("let isCarPlayRole = isCarPlayTemplateRole || isCarPlayWindowRole")
  );
}

function countConfigurationForConnectingMethods(contents) {
  const matches = contents.match(
    /func application\(\s*_ application: UIApplication,\s*configurationForConnecting connectingSceneSession: UISceneSession/g
  );
  return matches ? matches.length : 0;
}

function ensureCarPlaySceneConfiguration(contents) {
  if (hasCompleteCarPlaySceneRouter(contents)) {
    const count = countConfigurationForConnectingMethods(contents);
    if (count > 1) {
      console.warn(
        `[hidden-audio] AppDelegate has ${count} configurationForConnecting methods; expected 1.`
      );
    }
    return { contents, changed: false, reason: "already_complete" };
  }

  // Incomplete/stale router present — remove prior configurationForConnecting bodies, then re-insert once.
  let next = contents;
  if (next.includes("configurationForConnecting connectingSceneSession")) {
    next = next.replace(
      /\n\s*\/\/[^\n]*configurationForConnecting[\s\S]*?(?:@objc\s+)?public func application\(\s*_ application: UIApplication,\s*configurationForConnecting connectingSceneSession: UISceneSession,\s*options: UIScene\.ConnectionOptions\s*\)\s*->\s*UISceneConfiguration\s*\{[\s\S]*?\n\s*\}\n/,
      "\n"
    );
    next = next.replace(
      /\n\s*(?:@objc\s+)?public func application\(\s*_ application: UIApplication,\s*configurationForConnecting connectingSceneSession: UISceneSession,\s*options: UIScene\.ConnectionOptions\s*\)\s*->\s*UISceneConfiguration\s*\{[\s\S]*?\n\s*\}\n/,
      "\n"
    );
    next = next.replace(
      /\n\s*override func application\(\s*_ application: UIApplication,\s*configurationForConnecting connectingSceneSession: UISceneSession,\s*options: UIScene\.ConnectionOptions\s*\)\s*->\s*UISceneConfiguration\s*\{[\s\S]*?\n\s*\}\n/,
      "\n"
    );
  }

  const anchors = [
    {
      name: "linking_api",
      find: "  // Linking API",
      replace: `${CARPLAY_SCENE_CONFIGURATION_METHOD}\n  // Linking API`,
    },
    {
      name: "open_url",
      find: "  public override func application(\n    _ app: UIApplication,\n    open url: URL,",
      replace: `${CARPLAY_SCENE_CONFIGURATION_METHOD}\n  public override func application(\n    _ app: UIApplication,\n    open url: URL,`,
    },
  ];

  for (const anchor of anchors) {
    if (next.includes(anchor.find)) {
      next = next.replace(anchor.find, anchor.replace);
      if (!hasCompleteCarPlaySceneRouter(next)) {
        console.warn(
          `[hidden-audio] configurationForConnecting insert via ${anchor.name} incomplete.`
        );
        return { contents, changed: false, reason: "incomplete_after_insert" };
      }
      return { contents: next, changed: true, reason: `inserted_${anchor.name}` };
    }
  }

  if (next.includes("func attachReactNative(to window: UIWindow)")) {
    const patched = next.replace(
      /func attachReactNative\(to window: UIWindow\) \{[\s\S]*?\n  \}\n/,
      (match) => `${match}\n${CARPLAY_SCENE_CONFIGURATION_METHOD}\n`
    );
    if (patched !== next && hasCompleteCarPlaySceneRouter(patched)) {
      return { contents: patched, changed: true, reason: "inserted_after_attachReactNative" };
    }
  }

  console.warn(
    "[hidden-audio] Could not insert configurationForConnecting; AppDelegate shape unexpected."
  );
  return { contents, changed: false, reason: "insert_failed" };
}

module.exports = {
  CARPLAY_SCENE_CONFIGURATION_METHOD,
  CARPLAY_TEMPLATE_ROLE,
  CARPLAY_WINDOW_ROLE,
  CARPLAY_CONFIG_NAME,
  hasCompleteCarPlaySceneRouter,
  countConfigurationForConnectingMethods,
  ensureCarPlaySceneConfiguration,
};
