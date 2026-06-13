import CarPlay
import MediaPlayer

protocol HiddenAudioCarPlayPlaybackHandling: AnyObject {
  func playCarPlayTrack(_ track: [String: Any], completion: @escaping (Error?) -> Void)
  func emitCarPlayMediaSelection(_ mediaId: String)
}

final class HiddenAudioCarPlayManager: NSObject {
  static let shared = HiddenAudioCarPlayManager()

  weak var playbackHandler: HiddenAudioCarPlayPlaybackHandling?
  var onCarPlayDiagnostic: (([String: Any]) -> Void)?

  private var started = false
  private weak var interfaceController: CPInterfaceController?

  func startIfNeeded() {
    guard !started else { return }
    started = true
    HiddenAudioCarPlayCatalog.ensureDefaultCatalog()

    let manager = MPPlayableContentManager.shared()
    manager.dataSource = self
    manager.delegate = self
    manager.beginUpdates()
    manager.reloadData()
    manager.endUpdates()
  }

  func connect(_ interfaceController: CPInterfaceController) {
    self.interfaceController = interfaceController
    emitEntitlementDiagnostic()
    interfaceController.setRootTemplate(buildRootListTemplate(), animated: true, completion: nil)
  }

  func disconnect() {
    interfaceController = nil
  }

  func reloadTemplates() {
    guard let interfaceController = interfaceController else { return }
    interfaceController.setRootTemplate(buildRootListTemplate(), animated: false, completion: nil)
    MPPlayableContentManager.shared().reloadData()
  }

  func presentNowPlayingIfConnected() {
    guard let interfaceController = interfaceController else { return }
    interfaceController.pushTemplate(CPNowPlayingTemplate.shared, animated: true, completion: nil)
  }

  func applyCatalogSnapshot(_ snapshot: [String: Any]) {
    HiddenAudioCarPlayCatalog.applySnapshot(snapshot)
    reloadTemplates()
  }

  private func emitEntitlementDiagnostic() {
    onCarPlayDiagnostic?([
      "event": "ios_carplay_scene_connected",
      "entitlementMode": "playable-content",
      "hasCarPlayAudioEntitlement": false,
      "carplayAudioEntitlementRequiredForRealCar":
        "com.apple.developer.carplay-audio must be approved by Apple before the app can appear as a CarPlay audio app on a real vehicle.",
    ])
  }

  private func buildRootListTemplate() -> CPListTemplate {
    let sections = HiddenAudioCarPlayCatalog.children(for: HiddenAudioCarPlayCatalog.rootId)
    let items = sections.map { section -> CPListItem in
      let item = CPListItem(text: section.title, detailText: section.subtitle)
      item.userInfo = ["sectionId": section.mediaId]
      item.handler = { [weak self] _, completion in
        self?.handleSectionSelection(sectionId: section.mediaId)
        completion()
      }
      return item
    }
    return CPListTemplate(title: "Hidden Tunes", sections: [CPListSection(items: items)])
  }

  private func handleSectionSelection(sectionId: String) {
    if sectionId == "now_playing" {
      presentNowPlayingIfConnected()
      return
    }
    presentSectionTemplate(sectionId: sectionId)
  }

  private func presentSectionTemplate(sectionId: String) {
    guard let interfaceController = interfaceController else { return }
    let children = HiddenAudioCarPlayCatalog.children(for: sectionId)
    let title = children.first?.title ?? sectionId

    if children.isEmpty {
      let placeholder = CPListItem(
        text: "Open Hidden Tunes on iPhone",
        detailText: "Sync your library, then return to CarPlay"
      )
      placeholder.handler = { _, completion in completion() }
      let template = CPListTemplate(
        title: title,
        sections: [CPListSection(items: [placeholder])]
      )
      interfaceController.pushTemplate(template, animated: true, completion: nil)
      return
    }

    let items = children.map { node -> CPListItem in
      let item = CPListItem(text: node.title, detailText: node.subtitle)
      item.userInfo = ["mediaId": node.mediaId, "playable": node.playable]
      item.handler = { [weak self] _, completion in
        if node.playable {
          self?.playMediaId(node.mediaId)
        } else {
          self?.presentSectionTemplate(sectionId: node.mediaId)
        }
        completion()
      }
      return item
    }

    let template = CPListTemplate(
      title: sectionTitle(for: sectionId),
      sections: [CPListSection(items: items)]
    )
    interfaceController.pushTemplate(template, animated: true, completion: nil)
  }

  private func sectionTitle(for sectionId: String) -> String {
    switch sectionId {
    case "recently_added": return "Recently Added"
    case "artists": return "Artists"
    case "albums": return "Albums"
    case "playlists": return "Playlists"
    default:
      return HiddenAudioCarPlayCatalog.children(for: sectionId).first?.title ?? "Hidden Tunes"
    }
  }

  private func playMediaId(_ mediaId: String) {
    guard let track = HiddenAudioCarPlayCatalog.track(for: mediaId) else {
      playbackHandler?.emitCarPlayMediaSelection(mediaId)
      return
    }

    playbackHandler?.playCarPlayTrack(track.asTrackDictionary()) { [weak self] error in
      if error == nil {
        self?.presentNowPlayingIfConnected()
      }
      self?.playbackHandler?.emitCarPlayMediaSelection(mediaId)
    }
  }

  private func rootSectionIndex(for sectionId: String) -> Int? {
    let sections = HiddenAudioCarPlayCatalog.children(for: HiddenAudioCarPlayCatalog.rootId)
    return sections.firstIndex(where: { $0.mediaId == sectionId })
  }
}

extension HiddenAudioCarPlayManager: MPPlayableContentDataSource {
  func numberOfChildItems(at indexPath: IndexPath) -> Int {
    if indexPath.count == 0 {
      return 1
    }
    if indexPath.count == 1 && indexPath[0] == 0 {
      return HiddenAudioCarPlayCatalog.children(for: HiddenAudioCarPlayCatalog.rootId).count
    }
    if indexPath.count == 2 && indexPath[0] == 0 {
      let sections = HiddenAudioCarPlayCatalog.children(for: HiddenAudioCarPlayCatalog.rootId)
      guard indexPath[1] >= 0, indexPath[1] < sections.count else { return 0 }
      let section = sections[indexPath[1]]
      if section.mediaId == "now_playing" {
        return 0
      }
      return HiddenAudioCarPlayCatalog.children(for: section.mediaId).count
    }
    return 0
  }

  func contentItem(
    at indexPath: IndexPath,
    completionHandler: @escaping (MPContentItem?, Error?) -> Void
  ) {
    if indexPath.count == 1 && indexPath[0] == 0 {
      let item = MPContentItem(identifier: HiddenAudioCarPlayCatalog.rootId)
      item.title = "Hidden Tunes"
      item.subtitle = "Browse your library"
      item.isContainer = true
      item.isPlayable = false
      completionHandler(item, nil)
      return
    }

    if indexPath.count == 2 && indexPath[0] == 0 {
      let sections = HiddenAudioCarPlayCatalog.children(for: HiddenAudioCarPlayCatalog.rootId)
      guard indexPath[1] >= 0, indexPath[1] < sections.count else {
        completionHandler(nil, nil)
        return
      }
      let section = sections[indexPath[1]]
      let item = MPContentItem(identifier: section.mediaId)
      item.title = section.title
      item.subtitle = section.subtitle
      item.isContainer = section.mediaId != "now_playing"
      item.isPlayable = false
      completionHandler(item, nil)
      return
    }

    if indexPath.count == 3 && indexPath[0] == 0 {
      let sections = HiddenAudioCarPlayCatalog.children(for: HiddenAudioCarPlayCatalog.rootId)
      guard indexPath[1] >= 0, indexPath[1] < sections.count else {
        completionHandler(nil, nil)
        return
      }
      let section = sections[indexPath[1]]
      let children = HiddenAudioCarPlayCatalog.children(for: section.mediaId)
      guard indexPath[2] >= 0, indexPath[2] < children.count else {
        completionHandler(nil, nil)
        return
      }
      let node = children[indexPath[2]]
      let item = MPContentItem(identifier: node.mediaId)
      item.title = node.title
      item.subtitle = node.subtitle
      item.isContainer = !node.playable
      item.isPlayable = node.playable
      completionHandler(item, nil)
      return
    }

    completionHandler(nil, nil)
  }
}

extension HiddenAudioCarPlayManager: MPPlayableContentDelegate {
  func playableContentManager(
    _ contentManager: MPPlayableContentManager,
    initiatePlaybackForContentItem contentItem: MPContentItem,
    completionHandler: @escaping (Error?) -> Void
  ) {
    guard contentItem.isPlayable else {
      completionHandler(nil)
      return
    }
    playMediaId(contentItem.identifier)
    completionHandler(nil)
  }
}
