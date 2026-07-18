import CarPlay
import UIKit

/// CarPlay template scene delegate. Phone UI scene remains unchanged.
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    HiddenAudioCarPlayManager.shared.startIfNeeded()
    HiddenAudioCarPlayManager.shared.connect(interfaceController)
  }

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnect interfaceController: CPInterfaceController
  ) {
    // Release CarPlay UI only — never stop the shared HiddenAudio session.
    HiddenAudioCarPlayManager.shared.disconnect()
  }
}
