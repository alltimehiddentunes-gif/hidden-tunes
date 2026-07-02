import Foundation

protocol HiddenAudioCarPlayPlaybackHandling: AnyObject {
  func playCarPlayTrack(_ track: [String: Any], completion: @escaping (Error?) -> Void)
  func emitCarPlayMediaSelection(_ mediaId: String)
}

final class HiddenAudioCarPlayManager: NSObject {
  static let shared = HiddenAudioCarPlayManager()

  weak var playbackHandler: HiddenAudioCarPlayPlaybackHandling?
  var onCarPlayDiagnostic: (([String: Any]) -> Void)?

  func startIfNeeded() {}
  func disconnect() {}
  func reloadTemplates() {}
  func presentNowPlayingIfConnected() {}
  func applyCatalogSnapshot(_ snapshot: [String: Any]) {}
}
