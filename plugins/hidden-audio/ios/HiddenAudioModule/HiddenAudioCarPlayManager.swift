import CarPlay
import UIKit

protocol HiddenAudioCarPlayPlaybackHandling: AnyObject {
  func playCarPlayTrack(_ track: [String: Any], completion: @escaping (Error?) -> Void)
  func emitCarPlayMediaSelection(_ mediaId: String)
}

final class HiddenAudioCarPlayManager: NSObject {
  static let shared = HiddenAudioCarPlayManager()

  weak var playbackHandler: HiddenAudioCarPlayPlaybackHandling?
  var onCarPlayDiagnostic: (([String: Any]) -> Void)?

  private weak var interfaceController: CPInterfaceController?

  func startIfNeeded() {}

  func connect(_ interfaceController: CPInterfaceController) {
    self.interfaceController = interfaceController
    onCarPlayDiagnostic?([
      "event": "ios_carplay_scene_connected",
      "entitlementMode": "carplay-audio",
      "hasCarPlayAudioEntitlement": true,
    ])
    setStaticRootTemplate(animated: true)
  }

  func disconnect() {
    interfaceController = nil
  }

  func reloadTemplates() {
    setStaticRootTemplate(animated: false)
  }

  func presentNowPlayingIfConnected() {}

  func applyCatalogSnapshot(_ snapshot: [String: Any]) {}

  private func setStaticRootTemplate(animated: Bool) {
    guard let interfaceController = interfaceController else { return }
    let item = CPListItem(
      text: "Hidden Tunes is connected",
      detailText: nil
    )
    let section = CPListSection(items: [item])
    let template = CPListTemplate(
      title: "Hidden Tunes",
      sections: [section]
    )

    interfaceController.setRootTemplate(template, animated: animated, completion: nil)
  }
}
