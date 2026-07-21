import CarPlay
import UIKit

/// CarPlay template scene delegate for Audio entitlement apps.
/// Phone UI scene remains owned by PhoneSceneDelegate.
@objc(CarPlaySceneDelegate)
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  /// Strong session ownership for the CarPlay UI connection.
  private var interfaceController: CPInterfaceController?
  private var carWindow: CPWindow?

  override init() {
    super.init()
    NSLog("[HTCarPlay] scene_delegate_init")
  }

  /// Audio apps: Apple calls the two-argument connect method.
  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    connectCarPlay(
      scene: templateApplicationScene,
      interfaceController: interfaceController,
      window: templateApplicationScene.carWindow
    )
  }

  /// Safety net: some runtimes may deliver the window-bearing connect API.
  /// Audio apps still install templates only — no map/root view controller.
  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController,
    to window: CPWindow
  ) {
    connectCarPlay(
      scene: templateApplicationScene,
      interfaceController: interfaceController,
      window: window
    )
  }

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController
  ) {
    disconnectCarPlay()
  }

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnect interfaceController: CPInterfaceController,
    from window: CPWindow
  ) {
    disconnectCarPlay()
  }

  private func connectCarPlay(
    scene: CPTemplateApplicationScene,
    interfaceController: CPInterfaceController,
    window: CPWindow?
  ) {
    let install = { [weak self] in
      guard let self else { return }
      NSLog("[HTCarPlay] scene_configuration_requested")
      NSLog("[HTCarPlay] scene_connection_start")
      self.interfaceController = interfaceController
      NSLog("[HTCarPlay] interface_controller_attached")
      NSLog("[HTCarPlay] interface_controller_received")
      if let window {
        self.carWindow = window
        NSLog("[HTCarPlay] window_received")
      } else {
        NSLog("[HTCarPlay] window_absent")
      }

      // Install root immediately via the single CarPlay UI owner.
      // Must complete before this method returns (Apple requirement).
      HiddenAudioCarPlayManager.shared.startIfNeeded()
      HiddenAudioCarPlayManager.shared.connect(interfaceController, window: window)
    }

    if Thread.isMainThread {
      install()
    } else {
      DispatchQueue.main.sync(execute: install)
    }
  }

  private func disconnectCarPlay() {
    let teardown = { [weak self] in
      NSLog("[HTCarPlay] scene_disconnect")
      NSLog("[HTCarPlay] disconnect")
      // Release CarPlay UI only — never stop the shared HiddenAudio session.
      HiddenAudioCarPlayManager.shared.disconnect()
      self?.interfaceController = nil
      self?.carWindow = nil
    }

    if Thread.isMainThread {
      teardown()
    } else {
      DispatchQueue.main.async(execute: teardown)
    }
  }
}
