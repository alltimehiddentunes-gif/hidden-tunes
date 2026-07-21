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

    // Install the visible root inline (Apple audio-app sample pattern).
    // Do not wait on Metro, network, catalog, or manager async work.
    let root = Self.makeImmediateFallbackRoot()
    NSLog("[HTCarPlay] root_created type=CPListTemplate item_count=4")
    NSLog("[HTCarPlay] root_type=CPListTemplate")
    NSLog("[HTCarPlay] fallback_item_count=4")
    NSLog("[HTCarPlay] setRootTemplate start")

    interfaceController.setRootTemplate(root, animated: false) { success, error in
      NSLog("[HTCarPlay] setRootTemplate complete success=%d", success ? 1 : 0)
      NSLog("[HTCarPlay] setRootTemplate success=%d", success ? 1 : 0)
      if success {
        NSLog("[HTCarPlay] root_retained")
      } else {
        let message = error?.localizedDescription ?? "unknown"
        NSLog("[HTCarPlay] setRootTemplate_failed message=%@", message)
        NSLog("[HTCarPlay] fallback_restored reason=setRoot_failed")
      }
    }

    // Manager retains the controller and wires handlers / catalog updates
    // onto this same root — it must not call setRootTemplate again.
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
    let items: [CPListItem] = [
      CPListItem(text: "Hidden Tunes is ready", detailText: "Native CarPlay interface"),
      CPListItem(text: "Browse Library", detailText: "Music, radio, and more"),
      CPListItem(text: "Now Playing", detailText: "Current session"),
      CPListItem(text: "Search", detailText: "Find tracks"),
    ]
    return CPListTemplate(
      title: "Hidden Tunes",
      sections: [CPListSection(items: items)]
    )
  }
}
