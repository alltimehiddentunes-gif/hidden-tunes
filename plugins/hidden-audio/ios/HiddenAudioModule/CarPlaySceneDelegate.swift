import CarPlay
import UIKit

/// CarPlay template scene delegate for Audio entitlement apps.
/// Phone UI scene remains owned by PhoneSceneDelegate.
///
/// Uses only the audio-app connect API (2-arg). The 3-arg
/// `didConnect:to:` / `didDisconnect:from:` pair is for navigation apps;
/// implementing both can double-fire and race `setRootTemplate`, which
/// leaves a blank CarPlay screen.
///
/// Contract:
/// 1. Call `setRootTemplate` before `didConnect` returns (Apple audio requirement).
/// 2. Do not attach the manager / upgrade tabs until the first root completes successfully.
/// 3. On failure, retry a bounded number of times with a fresh safe list — never leave wallpaper.
@objc(CarPlaySceneDelegate)
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  /// Strong session ownership for the CarPlay UI connection.
  private var interfaceController: CPInterfaceController?

  /// Bounds wallpaper-guard retries for the initial root install.
  private static let maxRootInstallAttempts = 3

  override init() {
    super.init()
    NSLog("[HTCarPlay] CarPlaySceneDelegate initialized")
    NSLog("[HTCarPlay] scene_delegate_init")
    HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
      "carplay_scene_delegate_initialized",
      ["hasInterfaceController": false]
    )
  }

  /// Audio apps: Apple calls the two-argument connect method.
  /// Root template must be requested before this method returns.
  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    NSLog("[HTCarPlay] didConnect entered")
    NSLog("[HTCarPlay] scene_configuration_requested")
    NSLog("[HTCarPlay] scene_connection_start")
    HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
      "carplay_scene_did_connect_entered",
      ["hasInterfaceController": true]
    )

    self.interfaceController = interfaceController
    NSLog("[HTCarPlay] interfaceController received")
    NSLog("[HTCarPlay] interface_controller_attached")
    NSLog("[HTCarPlay] interface_controller_received")
    HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
      "carplay_interface_controller_received",
      ["hasInterfaceController": true]
    )

    let window = templateApplicationScene.carWindow
    if window != nil {
      NSLog("[HTCarPlay] window_received")
    } else {
      NSLog("[HTCarPlay] window_absent")
    }

    // Manager must be warm before attach, but must NOT install/upgrade yet.
    HiddenAudioCarPlayManager.shared.startIfNeeded()

    // Minimum safe root — request immediately (before this method returns).
    // Do not wait on Metro, network, catalog, auth, or JS readiness.
    // Do not call attachConnectedSession / tab upgrade until this install succeeds.
    NSLog("[HTCarPlay] root_template_creation_started type=CPListTemplate")
    let root = Self.makeImmediateFallbackRoot()
    NSLog("[HTCarPlay] root_created type=CPListTemplate item_count=1")
    NSLog("[HTCarPlay] root_type=CPListTemplate")
    NSLog("[HTCarPlay] setRootTemplate start")
    HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
      "carplay_scene_root_install_started",
      [
        "hasInterfaceController": true,
        "attempt": 1,
        "maxAttempts": Self.maxRootInstallAttempts,
      ]
    )

    installSafeRoot(
      on: interfaceController,
      root: root,
      attempt: 1,
      maxAttempts: Self.maxRootInstallAttempts
    ) { [weak self] success, installedRoot in
      guard let self else { return }

      if success, let installedRoot {
        NSLog("[HTCarPlay] root_retained")
        NSLog("[HTCarPlay] root_template_installed")
        HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
          "carplay_scene_root_install_succeeded",
          ["hasInterfaceController": true, "rootType": "CPListTemplate"]
        )
        NSLog("[HTCarPlay] attachConnectedSession starting")
        HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
          "carplay_attach_started",
          ["hasInterfaceController": true, "hasWindow": window != nil]
        )
        HiddenAudioCarPlayManager.shared.attachConnectedSession(
          interfaceController: interfaceController,
          window: window,
          preinstalledRoot: installedRoot,
          rootInstallConfirmed: true
        )
        NSLog("[HTCarPlay] attachConnectedSession completed")
        return
      }

      // Exhausted scene-level retries — manager owns a final bounded install path.
      NSLog("[HTCarPlay] setRootTemplate_failed message=exhausted_scene_retries")
      NSLog("[HTCarPlay] fallback_restored reason=setRoot_failed")
      HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
        "carplay_scene_root_install_exhausted",
        ["hasInterfaceController": true, "fallback": "manager_connect"]
      )
      HiddenAudioCarPlayManager.shared.connect(interfaceController, window: window)
    }
  }

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController
  ) {
    NSLog("[HTCarPlay] scene_disconnect")
    NSLog("[HTCarPlay] disconnect")
    HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
      "carplay_scene_did_disconnect",
      [
        "hasInterfaceController": self.interfaceController != nil,
        "reason": "didDisconnectInterfaceController",
      ]
    )
    // Release CarPlay UI only — never stop the shared HiddenAudio session.
    HiddenAudioCarPlayManager.shared.disconnect()
    self.interfaceController = nil
  }

  /// Bounded safe-root install. Single `setRootTemplate` call site; retries use a fresh list.
  private func installSafeRoot(
    on interfaceController: CPInterfaceController,
    root: CPListTemplate,
    attempt: Int,
    maxAttempts: Int,
    completion: @escaping (_ success: Bool, _ installedRoot: CPListTemplate?) -> Void
  ) {
    interfaceController.setRootTemplate(root, animated: false) { [weak self] success, error in
      NSLog(
        "[HTCarPlay] minimal root installed success=%d error=%@ attempt=%d",
        success ? 1 : 0,
        String(describing: error),
        attempt
      )
      NSLog("[HTCarPlay] setRootTemplate complete success=%d", success ? 1 : 0)
      NSLog("[HTCarPlay] setRootTemplate success=%d", success ? 1 : 0)

      if success {
        completion(true, root)
        return
      }

      let message = error?.localizedDescription ?? "unknown"
      NSLog("[HTCarPlay] setRootTemplate_failed message=%@", message)
      HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
        "carplay_scene_root_install_failed",
        [
          "attempt": attempt,
          "maxAttempts": maxAttempts,
          "message": message,
        ]
      )

      guard attempt < maxAttempts else {
        NSLog("[HTCarPlay] fallback_restored reason=setRoot_failed")
        completion(false, nil)
        return
      }

      let nextAttempt = attempt + 1
      NSLog("[HTCarPlay] root_install_retry attempt=%d", nextAttempt)
      HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
        "carplay_scene_root_install_retry",
        ["attempt": nextAttempt, "maxAttempts": maxAttempts]
      )
      let retryRoot = Self.makeImmediateFallbackRoot()
      self?.installSafeRoot(
        on: interfaceController,
        root: retryRoot,
        attempt: nextAttempt,
        maxAttempts: maxAttempts,
        completion: completion
      )
    }
  }

  /// Hardcoded visible list — independent of Metro, JS, network, and catalog.
  private static func makeImmediateFallbackRoot() -> CPListTemplate {
    let loadingItem = CPListItem(
      text: "Hidden Tunes",
      detailText: "Loading your audio…"
    )
    loadingItem.isEnabled = false
    let section = CPListSection(items: [loadingItem])
    return CPListTemplate(
      title: "Hidden Tunes",
      sections: [section]
    )
  }
}
