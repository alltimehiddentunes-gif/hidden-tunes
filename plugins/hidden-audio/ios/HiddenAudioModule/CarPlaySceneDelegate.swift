import CarPlay
import UIKit

/// CarPlay template scene delegate for Audio entitlement apps.
/// Phone UI scene remains owned by PhoneSceneDelegate.
///
/// Uses only the audio-app connect API (2-arg). The 3-arg
/// `didConnect:to:` / `didDisconnect:from:` pair is for navigation apps;
/// implementing both can double-fire and race `setRootTemplate`, which
/// leaves a blank CarPlay screen.
@objc(CarPlaySceneDelegate)
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  /// Strong session ownership for the CarPlay UI connection.
  private var interfaceController: CPInterfaceController?

  override init() {
    super.init()
    NSLog("[HTCarPlay] scene_delegate_init")
  }

  /// Audio apps: Apple calls the two-argument connect method.
  /// Root template must be installed before this method returns.
  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    NSLog("[HTCarPlay] scene_configuration_requested")
    NSLog("[HTCarPlay] scene_connection_start")

    self.interfaceController = interfaceController
    NSLog("[HTCarPlay] interface_controller_attached")
    NSLog("[HTCarPlay] interface_controller_received")

    let window = templateApplicationScene.carWindow
    if window != nil {
      NSLog("[HTCarPlay] window_received")
    } else {
      NSLog("[HTCarPlay] window_absent")
    }

    // Minimum safe root — install immediately.
    // Do not wait on Metro, network, catalog, auth, or JS readiness.
    NSLog("[HTCarPlay] root_template_creation_started type=CPListTemplate")
    let root = Self.makeImmediateFallbackRoot()
    NSLog("[HTCarPlay] root_created type=CPListTemplate item_count=1")
    NSLog("[HTCarPlay] root_type=CPListTemplate")
    NSLog("[HTCarPlay] setRootTemplate start")

    interfaceController.setRootTemplate(root, animated: false) { success, error in
      NSLog(
        "[HTCarPlay] minimal root installed success=%d error=%@",
        success ? 1 : 0,
        String(describing: error)
      )
      NSLog("[HTCarPlay] setRootTemplate complete success=%d", success ? 1 : 0)
      NSLog("[HTCarPlay] setRootTemplate success=%d", success ? 1 : 0)
      if success {
        NSLog("[HTCarPlay] root_retained")
        NSLog("[HTCarPlay] root_template_installed")
      } else {
        let message = error?.localizedDescription ?? "unknown"
        NSLog("[HTCarPlay] setRootTemplate_failed message=%@", message)
        NSLog("[HTCarPlay] fallback_restored reason=setRoot_failed")
      }
    }

    // Manager may upgrade to a validated tab bar after this safe root is live.
    // It must never leave the car screen blank.
    HiddenAudioCarPlayManager.shared.startIfNeeded()
    HiddenAudioCarPlayManager.shared.attachConnectedSession(
      interfaceController: interfaceController,
      window: window,
      preinstalledRoot: root
    )
  }

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController
  ) {
    NSLog("[HTCarPlay] scene_disconnect")
    NSLog("[HTCarPlay] disconnect")
    // Release CarPlay UI only — never stop the shared HiddenAudio session.
    HiddenAudioCarPlayManager.shared.disconnect()
    self.interfaceController = nil
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
