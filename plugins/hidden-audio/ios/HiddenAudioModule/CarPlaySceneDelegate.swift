import CarPlay
import UIKit

/// CarPlay template scene delegate for Audio entitlement apps.
/// Phone UI scene remains owned by PhoneSceneDelegate.
///
/// Accepts both SDK callback variants and funnels them through one idempotent
/// connection handler. Physical iOS 26.6 logs can select the window-bearing
/// variant even while using the template-application scene role.
///
/// Contract:
/// 1. Call `setRootTemplate` before `didConnect` returns (Apple audio requirement).
/// 2. Do not attach the manager / upgrade tabs until the first root completes successfully.
/// 3. On failure, retry a bounded number of times with a fresh safe list — never leave wallpaper.
@objc(CarPlaySceneDelegate)
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  /// Strong session ownership for the CarPlay UI connection.
  private var interfaceController: CPInterfaceController?
  private var templateApplicationScene: CPTemplateApplicationScene?
  private var rootTemplate: CPListTemplate?

  /// Bounds wallpaper-guard retries for the initial root install.
  private static let maxRootInstallAttempts = 3

  /// Connection generation for diagnostic correlation (observe-only).
  private var diagnosticConnectionGeneration: UInt64 = 0

  override init() {
    super.init()
    NSLog("[HTCarPlayNative] delegate_init")
    NSLog(
      "[HTCarPlayNative] CarPlaySceneDelegate.init mainThread=%d",
      Thread.isMainThread ? 1 : 0
    )
    NSLog("[HTCarPlay] CarPlaySceneDelegate initialized")
    NSLog("[HTCarPlay] scene_delegate_init")
    HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
      "carplay_scene_delegate_initialized",
      ["hasInterfaceController": false]
    )
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    NSLog(
      "[HTCarPlayNative] scene.willConnect sceneClass=%@ role=%@ sessionId=%@ mainThread=%d",
      String(describing: type(of: scene)),
      session.role.rawValue,
      session.persistentIdentifier,
      Thread.isMainThread ? 1 : 0
    )
  }

  /// Audio apps: Apple calls the two-argument connect method.
  /// Root template must be requested before this method returns.
  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    NSLog("[HTCarPlayNative] did_connect_callback variant=interface_controller_only")
    if !Thread.isMainThread {
      NSLog("[HTCarPlayNative] didConnect.dispatch_to_main reason=template_operations_require_main")
      DispatchQueue.main.sync {
        self.handleDidConnect(
          templateApplicationScene: templateApplicationScene,
          interfaceController: interfaceController,
          suppliedWindow: nil,
          callbackVariant: "interface_controller_only"
        )
      }
      return
    }

    handleDidConnect(
      templateApplicationScene: templateApplicationScene,
      interfaceController: interfaceController,
      suppliedWindow: nil,
      callbackVariant: "interface_controller_only"
    )
  }

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController,
    to window: CPWindow
  ) {
    NSLog("[HTCarPlayNative] did_connect_callback variant=with_window")
    if !Thread.isMainThread {
      NSLog("[HTCarPlayNative] didConnect.dispatch_to_main reason=template_operations_require_main variant=with_window")
      DispatchQueue.main.sync {
        self.handleDidConnect(
          templateApplicationScene: templateApplicationScene,
          interfaceController: interfaceController,
          suppliedWindow: window,
          callbackVariant: "with_window"
        )
      }
      return
    }
    handleDidConnect(
      templateApplicationScene: templateApplicationScene,
      interfaceController: interfaceController,
      suppliedWindow: window,
      callbackVariant: "with_window"
    )
  }

  private func handleDidConnect(
    templateApplicationScene: CPTemplateApplicationScene,
    interfaceController: CPInterfaceController,
    suppliedWindow: CPWindow?,
    callbackVariant: String
  ) {
    if self.interfaceController === interfaceController, self.rootTemplate != nil {
      NSLog(
        "[HTCarPlayNative] did_connect_early_return reason=duplicate_callback variant=%@",
        callbackVariant
      )
      return
    }
    NSLog("[HTCarPlayNative] did_connect_enter")
    diagnosticConnectionGeneration &+= 1
    let generation = diagnosticConnectionGeneration
    let sessionId = templateApplicationScene.session.persistentIdentifier
    let role = templateApplicationScene.session.role.rawValue
    let mainThread = Thread.isMainThread ? 1 : 0

    NSLog(
      "[HTCarPlayNative] didConnect.enter generation=%llu sessionId=%@ role=%@ sceneClass=%@ controller=%d window=%d mainThread=%d",
      generation,
      sessionId,
      role,
      String(describing: type(of: templateApplicationScene)),
      1,
      templateApplicationScene.carWindow != nil ? 1 : 0,
      mainThread
    )
    NSLog("[HTCarPlay] didConnect entered")
    NSLog("[HTCarPlay] scene_configuration_requested")
    NSLog("[HTCarPlay] scene_connection_start")
    HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
      "carplay_scene_did_connect_entered",
      ["hasInterfaceController": true]
    )

    self.templateApplicationScene = templateApplicationScene
    self.interfaceController = interfaceController
    NSLog("[HTCarPlayNative] interface_controller_received")
    NSLog("[HTCarPlay] interfaceController received")
    NSLog("[HTCarPlay] interface_controller_attached")
    NSLog("[HTCarPlay] interface_controller_received")
    HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
      "carplay_interface_controller_received",
      ["hasInterfaceController": true]
    )

    let window = suppliedWindow ?? templateApplicationScene.carWindow
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
    NSLog(
      "[HTCarPlayNative] root.build.enter generation=%llu sessionId=%@",
      generation,
      sessionId
    )
    let root = Self.makeImmediateFallbackRoot()
    self.rootTemplate = root
    NSLog("[HTCarPlayNative] root_template_created title=Hidden Tunes item=CarPlay Connected sections=1 items=1")
    NSLog(
      "[HTCarPlayNative] root.build.exit generation=%llu sessionId=%@ rootClass=%@ nonNil=%d",
      generation,
      sessionId,
      String(describing: type(of: root)),
      1
    )
    NSLog("[HTCarPlay] root_created type=CPListTemplate item_count=1")
    NSLog("[HTCarPlay] root_type=CPListTemplate")
    NSLog("[HTCarPlay] setRootTemplate start")
    NSLog(
      "[HTCarPlayNative] setRootTemplate.enter generation=%llu sessionId=%@ rootClass=%@ mainThread=%d",
      generation,
      sessionId,
      String(describing: type(of: root)),
      Thread.isMainThread ? 1 : 0
    )
    HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
      "carplay_scene_root_install_started",
      [
        "hasInterfaceController": true,
        "attempt": 1,
        "maxAttempts": Self.maxRootInstallAttempts,
      ]
    )
    NSLog("[HTCarPlayNative] set_root_template_called")

    installSafeRoot(
      on: interfaceController,
      root: root,
      attempt: 1,
      maxAttempts: Self.maxRootInstallAttempts,
      generation: generation,
      sessionId: sessionId
    ) { [weak self] success, installedRoot in
      guard let self else {
        NSLog("[HTCarPlayNative] root.install.completion_ignored reason=delegate_released")
        return
      }

      if success, let installedRoot {
        NSLog("[HTCarPlay] root_retained")
        NSLog("[HTCarPlay] root_template_installed")
        HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
          "carplay_scene_root_install_succeeded",
          ["hasInterfaceController": true, "rootType": "CPListTemplate"]
        )
        NSLog("[HTCarPlayNative] diagnostic_root.visible_window_started delaySeconds=3")
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
          guard let self else {
            NSLog("[HTCarPlayNative] catalog_replay.skipped reason=delegate_released")
            return
          }
          guard self.interfaceController === interfaceController else {
            NSLog("[HTCarPlayNative] catalog_replay.skipped reason=stale_interface_controller")
            return
          }
          NSLog("[HTCarPlayNative] cached_catalog_replay_started")
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
          NSLog("[HTCarPlayNative] cached_catalog_replay_completed")
        }
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
    NSLog("[HTCarPlayNative] did_disconnect")
    NSLog(
      "[HTCarPlayNative] didDisconnect generation=%llu sessionId=%@ mainThread=%d",
      diagnosticConnectionGeneration,
      templateApplicationScene.session.persistentIdentifier,
      Thread.isMainThread ? 1 : 0
    )
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
    self.templateApplicationScene = nil
    self.rootTemplate = nil
  }

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnect interfaceController: CPInterfaceController,
    from window: CPWindow
  ) {
    NSLog("[HTCarPlayNative] did_disconnect_callback variant=with_window")
    guard self.interfaceController != nil else {
      NSLog("[HTCarPlayNative] did_disconnect_early_return reason=already_disconnected variant=with_window")
      return
    }
    self.templateApplicationScene(
      templateApplicationScene,
      didDisconnectInterfaceController: interfaceController
    )
  }

  /// Bounded safe-root install. Single `setRootTemplate` call site; retries use a fresh list.
  private func installSafeRoot(
    on interfaceController: CPInterfaceController,
    root: CPListTemplate,
    attempt: Int,
    maxAttempts: Int,
    generation: UInt64,
    sessionId: String,
    completion: @escaping (_ success: Bool, _ installedRoot: CPListTemplate?) -> Void
  ) {
    interfaceController.setRootTemplate(root, animated: false) { [weak self] success, error in
      let message = error?.localizedDescription ?? ""
      NSLog(
        "[HTCarPlayNative] setRootTemplate.completion generation=%llu sessionId=%@ success=%d error=%@ attempt=%d mainThread=%d",
        generation,
        sessionId,
        success ? 1 : 0,
        message.isEmpty ? "<none>" : message,
        attempt,
        Thread.isMainThread ? 1 : 0
      )
      NSLog(
        "[HTCarPlayNative] set_root_template_result success=%@ error=%@",
        String(success),
        message.isEmpty ? "<none>" : message
      )
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

      NSLog("[HTCarPlay] setRootTemplate_failed message=%@", message.isEmpty ? "unknown" : message)
      HiddenAudioCarPlayManager.shared.emitLifecycleDiagnostic(
        "carplay_scene_root_install_failed",
        [
          "attempt": attempt,
          "maxAttempts": maxAttempts,
          "message": message.isEmpty ? "unknown" : message,
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
      NSLog(
        "[HTCarPlayNative] setRootTemplate.enter generation=%llu sessionId=%@ rootClass=%@ attempt=%d mainThread=%d",
        generation,
        sessionId,
        String(describing: type(of: retryRoot)),
        nextAttempt,
        Thread.isMainThread ? 1 : 0
      )
      self?.installSafeRoot(
        on: interfaceController,
        root: retryRoot,
        attempt: nextAttempt,
        maxAttempts: maxAttempts,
        generation: generation,
        sessionId: sessionId,
        completion: completion
      )
    }
  }

  /// Hardcoded visible list — independent of Metro, JS, network, and catalog.
  private static func makeImmediateFallbackRoot() -> CPListTemplate {
    let loadingItem = CPListItem(
      text: "CarPlay Connected",
      detailText: "Native runtime active"
    )
    loadingItem.isEnabled = false
    let section = CPListSection(items: [loadingItem])
    return CPListTemplate(
      title: "Hidden Tunes",
      sections: [section]
    )
  }
}
