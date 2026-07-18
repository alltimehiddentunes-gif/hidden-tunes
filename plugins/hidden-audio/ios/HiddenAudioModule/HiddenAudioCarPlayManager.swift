import CarPlay
import Foundation
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
  private var tabBarTemplate: CPTabBarTemplate?
  private var isConnected = false
  private var hasInstalledRoot = false

  // Named distinctly from CPSearchTemplateDelegate.searchTemplate(_:...)
  // so Swift can witness the protocol methods correctly.
  private lazy var searchTabTemplate: CPSearchTemplate = {
    let template = CPSearchTemplate()
    template.delegate = self
    template.tabTitle = "Search"
    template.tabImage = UIImage(systemName: "magnifyingglass")
    return template
  }()

  func startIfNeeded() {
    HiddenAudioCarPlayCatalog.ensureDefaultCatalog()
    emitDiagnostic([
      "event": "carplay_manager_ready",
      "connected": isConnected,
    ])
  }

  func connect(_ interfaceController: CPInterfaceController) {
    self.interfaceController = interfaceController
    isConnected = true
    HiddenAudioCarPlayCatalog.ensureDefaultCatalog()
    installRootTemplates(force: true)
    emitDiagnostic([
      "event": "carplay_connected",
      "hasInterfaceController": true,
    ])
  }

  func disconnect() {
    isConnected = false
    hasInstalledRoot = false
    interfaceController = nil
    tabBarTemplate = nil
    emitDiagnostic([
      "event": "carplay_disconnected",
      "playbackPreserved": true,
    ])
  }

  func reloadTemplates() {
    guard isConnected, interfaceController != nil else { return }
    installRootTemplates(force: true)
  }

  func presentNowPlayingIfConnected() {
    guard isConnected, let interfaceController else { return }
    let nowPlaying = CPNowPlayingTemplate.shared
    if interfaceController.topTemplate !== nowPlaying {
      interfaceController.pushTemplate(nowPlaying, animated: true) { [weak self] success, error in
        if let error {
          self?.emitDiagnostic([
            "event": "carplay_now_playing_push_failed",
            "message": error.localizedDescription,
            "success": success,
          ])
        }
      }
    }
  }

  func applyCatalogSnapshot(_ snapshot: [String: Any]) {
    HiddenAudioCarPlayCatalog.applySnapshot(snapshot)
    emitDiagnostic([
      "event": "carplay_catalog_applied",
      "trackCount": (snapshot["tracks"] as? [Any])?.count ?? 0,
      "sectionCount": (snapshot["sections"] as? [Any])?.count ?? 0,
      "connected": isConnected,
    ])
    if isConnected {
      reloadTemplates()
    }
  }

  private func installRootTemplates(force: Bool) {
    guard let interfaceController else { return }
    if hasInstalledRoot && !force { return }

    let home = makeSectionListTemplate(
      title: "Hidden Tunes",
      sectionIds: ["now_playing", "recently_played", "favorites"]
    )
    let playlists = makeListTemplate(title: "Playlists", parentId: "playlists")
    let music = makeListTemplate(title: "Music", parentId: "music")
    let radio = makeListTemplate(title: "Radio", parentId: "radio")

    let tabs = [home, playlists, music, radio, searchTabTemplate]
    let tabBar = CPTabBarTemplate(templates: tabs)
    tabBarTemplate = tabBar
    hasInstalledRoot = true

    interfaceController.setRootTemplate(tabBar, animated: false) { [weak self] success, error in
      self?.emitDiagnostic([
        "event": "carplay_root_installed",
        "success": success,
        "message": error?.localizedDescription ?? "",
        "tabCount": tabs.count,
      ])
    }
  }

  private func makeSectionListTemplate(
    title: String,
    sectionIds: [String]
  ) -> CPListTemplate {
    var sections: [CPListSection] = []

    for sectionId in sectionIds {
      let nodes = nodesForSection(sectionId)
      let items = nodes.map { node in
        makeListItem(for: node, parentId: sectionId)
      }
      let header: String = {
        switch sectionId {
        case "now_playing": return "Now Playing"
        case "recently_played": return "Recently Played"
        case "favorites": return "Favorites"
        default: return "Hidden Tunes"
        }
      }()
      sections.append(CPListSection(items: items, header: header, sectionIndexTitle: nil))
    }

    let template = CPListTemplate(title: title, sections: sections)
    template.tabTitle = title
    template.tabImage = UIImage(systemName: "house.fill")
    return template
  }

  private func makeListTemplate(title: String, parentId: String) -> CPListTemplate {
    let nodes = HiddenAudioCarPlayCatalog.children(for: parentId)
    let items = nodes.map { makeListItem(for: $0, parentId: parentId) }
    let template = CPListTemplate(
      title: title,
      sections: [CPListSection(items: items)]
    )
    template.tabTitle = title
    template.tabImage = tabImage(for: parentId)
    return template
  }

  private func nodesForSection(_ sectionId: String) -> [HiddenAudioCarPlayBrowseNode] {
    if sectionId == "now_playing" {
      return [
        HiddenAudioCarPlayBrowseNode(
          mediaId: "now_playing",
          title: "Now Playing",
          subtitle: "Open current session",
          playable: false
        ),
      ]
    }
    return HiddenAudioCarPlayCatalog.children(for: sectionId)
  }

  private func tabImage(for parentId: String) -> UIImage? {
    switch parentId {
    case "playlists":
      return UIImage(systemName: "music.note.list")
    case "music":
      return UIImage(systemName: "music.note")
    case "radio":
      return UIImage(systemName: "radio")
    case "search":
      return UIImage(systemName: "magnifyingglass")
    default:
      return UIImage(systemName: "music.note")
    }
  }

  private func makeListItem(
    for node: HiddenAudioCarPlayBrowseNode,
    parentId: String
  ) -> CPListItem {
    let item = CPListItem(text: node.title, detailText: node.subtitle.isEmpty ? nil : node.subtitle)
    item.handler = { [weak self] _, completion in
      self?.handleSelection(node: node, parentId: parentId, completion: completion)
    }
    return item
  }

  private func handleSelection(
    node: HiddenAudioCarPlayBrowseNode,
    parentId: String,
    completion: @escaping () -> Void
  ) {
    defer { completion() }

    if node.mediaId.hasPrefix("empty:") {
      return
    }

    if node.mediaId == "now_playing" || parentId == "now_playing" {
      presentNowPlayingIfConnected()
      return
    }

    if node.mediaId == "search" {
      return
    }

    if node.playable {
      selectPlayable(mediaId: node.mediaId)
      return
    }

    pushChildList(for: node)
  }

  private func pushChildList(for node: HiddenAudioCarPlayBrowseNode) {
    guard let interfaceController else { return }
    let children = HiddenAudioCarPlayCatalog.children(for: node.mediaId)
    let items = children.map { makeListItem(for: $0, parentId: node.mediaId) }
    let template = CPListTemplate(
      title: node.title,
      sections: [CPListSection(items: items)]
    )
    interfaceController.pushTemplate(template, animated: true) { [weak self] success, error in
      if let error {
        self?.emitDiagnostic([
          "event": "carplay_push_failed",
          "mediaId": node.mediaId,
          "message": error.localizedDescription,
          "success": success,
        ])
      }
    }
  }

  private func selectPlayable(mediaId: String) {
    emitDiagnostic([
      "event": "carplay_item_selected",
      "mediaId": mediaId,
    ])
    // Route through the existing HiddenAudio + PlayerContext play path only.
    // Do not start a second player or replace queue ownership here.
    playbackHandler?.emitCarPlayMediaSelection(mediaId)
    presentNowPlayingIfConnected()
  }

  private func emitDiagnostic(_ data: [String: Any]) {
    onCarPlayDiagnostic?(data)
  }
}

extension HiddenAudioCarPlayManager: CPSearchTemplateDelegate {
  func searchTemplate(
    _ searchTemplate: CPSearchTemplate,
    updatedSearchText searchText: String,
    completionHandler: @escaping ([any CPListTemplateItem]) -> Void
  ) {
    let matches = HiddenAudioCarPlayCatalog.updateSearchResults(query: searchText)
    if matches.isEmpty {
      if searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        completionHandler([])
        return
      }
      let empty = CPListItem(
        text: HiddenAudioCarPlayCatalog.emptyMessageTitle,
        detailText: HiddenAudioCarPlayCatalog.emptyMessageSubtitle
      )
      completionHandler([empty])
      return
    }

    let items: [CPListItem] = matches.map { node in
      let item = CPListItem(text: node.title, detailText: node.subtitle)
      item.userInfo = ["mediaId": node.mediaId]
      return item
    }
    completionHandler(items)
  }

  func searchTemplate(
    _ searchTemplate: CPSearchTemplate,
    selectedResult item: CPListItem,
    completionHandler: @escaping () -> Void
  ) {
    defer { completionHandler() }
    if let info = item.userInfo as? [String: Any],
       let mediaId = info["mediaId"] as? String,
       !mediaId.isEmpty {
      selectPlayable(mediaId: mediaId)
    }
  }

  func searchTemplateSearchButtonPressed(_ searchTemplate: CPSearchTemplate) {
    emitDiagnostic(["event": "carplay_search_button_pressed"])
  }
}
