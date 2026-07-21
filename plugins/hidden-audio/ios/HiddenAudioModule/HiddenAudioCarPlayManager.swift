import CarPlay
import Foundation
import UIKit

protocol HiddenAudioCarPlayPlaybackHandling: AnyObject {
  func playCarPlayTrack(_ track: [String: Any], completion: @escaping (Error?) -> Void)
  func emitCarPlayMediaSelection(_ mediaId: String)
}

/// Single native CarPlay UI owner. Does not create a second playback engine.
final class HiddenAudioCarPlayManager: NSObject {
  static let shared = HiddenAudioCarPlayManager()

  weak var playbackHandler: HiddenAudioCarPlayPlaybackHandling?
  var onCarPlayDiagnostic: (([String: Any]) -> Void)?

  /// Strong retention for the CarPlay session (Apple guidance).
  private var interfaceController: CPInterfaceController?
  private var carWindow: CPWindow?
  private var tabBarTemplate: CPTabBarTemplate?
  private var rootListTemplate: CPListTemplate?
  private var searchTabTemplate: CPSearchTemplate?
  private var sessionConfiguration: CPSessionConfiguration?
  private var supportsVideoPlaybackCached = false
  private var isConnected = false
  private var hasInstalledRoot = false
  private var isInstallingRoot = false

  func startIfNeeded() {
    HiddenAudioCarPlayCatalog.ensureDefaultCatalog()
    ensureSessionConfiguration()
    refreshVideoCapability(reason: "manager_ready")
    emitDiagnostic([
      "event": "carplay_manager_ready",
      "connected": isConnected,
      "supportsVideoPlayback": supportsVideoPlaybackCached,
    ])
    NSLog("[HTCarPlay] manager_ready connected=%d", isConnected ? 1 : 0)
  }

  func connect(_ interfaceController: CPInterfaceController, window: CPWindow? = nil) {
    let work = { [weak self] in
      guard let self else { return }
      self.interfaceController = interfaceController
      self.carWindow = window
      self.isConnected = true
      HiddenAudioCarPlayCatalog.ensureDefaultCatalog()
      self.ensureSessionConfiguration()
      self.refreshVideoCapability(reason: "connected")
      NSLog("[HTCarPlay] connected hasWindow=%d", window != nil ? 1 : 0)
      self.installRootTemplates(force: true)
      self.emitDiagnostic([
        "event": "carplay_connected",
        "hasInterfaceController": true,
        "hasWindow": window != nil,
        "supportsVideoPlayback": self.supportsVideoPlaybackCached,
      ])
    }

    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.sync(execute: work)
    }
  }

  func disconnect() {
    let work = { [weak self] in
      guard let self else { return }
      self.isConnected = false
      self.hasInstalledRoot = false
      self.isInstallingRoot = false
      self.interfaceController = nil
      self.carWindow = nil
      self.tabBarTemplate = nil
      self.rootListTemplate = nil
      self.searchTabTemplate = nil
      // Keep sessionConfiguration for subsequent connects; do not stop HiddenAudio.
      NSLog("[HTCarPlay] disconnected playback_preserved=1")
      NSLog("[HTCarPlayVideo] disconnect supportsVideoPlayback=%d playback_preserved=1", self.supportsVideoPlaybackCached ? 1 : 0)
      self.emitDiagnostic([
        "event": "carplay_disconnected",
        "playbackPreserved": true,
        "supportsVideoPlayback": self.supportsVideoPlaybackCached,
      ])
    }

    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }

  func reloadTemplates() {
    performOnMain { [weak self] in
      guard let self, self.isConnected, self.interfaceController != nil else { return }
      self.installRootTemplates(force: true)
    }
  }

  func presentNowPlayingIfConnected() {
    performOnMain { [weak self] in
      guard let self, self.isConnected, let interfaceController = self.interfaceController else { return }
      let nowPlaying = CPNowPlayingTemplate.shared
      if interfaceController.topTemplate !== nowPlaying {
        interfaceController.pushTemplate(nowPlaying, animated: true) { [weak self] success, error in
          if let error {
            NSLog("[HTCarPlay] now_playing_push_failed success=%d", success ? 1 : 0)
            self?.emitDiagnostic([
              "event": "carplay_now_playing_push_failed",
              "message": error.localizedDescription,
              "success": success,
            ])
          }
        }
      }
    }
  }

  func applyCatalogSnapshot(_ snapshot: [String: Any]) {
    HiddenAudioCarPlayCatalog.applySnapshot(snapshot)
    let trackCount = (snapshot["tracks"] as? [Any])?.count ?? 0
    let sectionCount = (snapshot["sections"] as? [Any])?.count ?? 0
    NSLog(
      "[HTCarPlay] catalog_applied tracks=%d sections=%d connected=%d",
      trackCount,
      sectionCount,
      isConnected ? 1 : 0
    )
    emitDiagnostic([
      "event": "carplay_catalog_applied",
      "trackCount": trackCount,
      "sectionCount": sectionCount,
      "connected": isConnected,
    ])
    if isConnected {
      reloadTemplates()
    }
  }

  private func installRootTemplates(force: Bool) {
    guard let interfaceController else {
      NSLog("[HTCarPlay] root_install_skipped no_interface_controller")
      return
    }
    if hasInstalledRoot && !force { return }
    if isInstallingRoot && !force {
      NSLog("[HTCarPlay] root_install_skipped already_in_progress")
      return
    }

    isInstallingRoot = true
    NSLog("[HTCarPlay] root_template_creation_start")

    // Always seed a native fallback catalog so opening never waits on JS.
    HiddenAudioCarPlayCatalog.ensureDefaultCatalog()

    // Immediate guaranteed root before connect returns (Apple requirement).
    // Never leave CPInterfaceController without a root template.
    let immediateList = makeListTemplate(
      title: "Hidden Tunes",
      parentId: HiddenAudioCarPlayCatalog.rootId
    )
    rootListTemplate = immediateList
    tabBarTemplate = nil
    searchTabTemplate = nil
    NSLog("[HTCarPlay] template_count=1 root_type=CPListTemplate")

    interfaceController.setRootTemplate(immediateList, animated: false) { [weak self] success, error in
      guard let self else { return }
      let message = error?.localizedDescription ?? ""
      NSLog(
        "[HTCarPlay] setRootTemplate success=%d type=CPListTemplate",
        success ? 1 : 0
      )
      if success {
        self.hasInstalledRoot = true
        self.emitDiagnostic([
          "event": "carplay_root_installed",
          "success": true,
          "message": "",
          "tabCount": 1,
          "rootType": "CPListTemplate",
        ])
        // Upgrade to tab bar after a visible root is confirmed.
        self.upgradeToTabBarRoot(on: interfaceController)
      } else {
        self.isInstallingRoot = false
        self.hasInstalledRoot = false
        self.emitDiagnostic([
          "event": "carplay_root_install_failed",
          "success": false,
          "message": message,
          "tabCount": 1,
          "rootType": "CPListTemplate",
        ])
      }
    }
  }

  /// Prefer Home + Search tabs once the safe list root is live.
  /// Videos tab is included only when CPSessionConfiguration.supportsVideoPlayback is true.
  private func upgradeToTabBarRoot(on interfaceController: CPInterfaceController) {
    refreshVideoCapability(reason: "root_upgrade")

    // Fresh templates every install — never re-parent an existing template instance.
    let home = makeListTemplate(title: "Home", parentId: HiddenAudioCarPlayCatalog.rootId)
    home.tabImage = UIImage(systemName: "house.fill")

    let search = CPSearchTemplate()
    search.delegate = self
    search.tabTitle = "Search"
    search.tabImage = UIImage(systemName: "magnifyingglass")

    var tabs: [CPTemplate] = [home, search]
    if supportsVideoPlaybackCached {
      let videos = makeListTemplate(title: "Videos", parentId: "videos")
      videos.tabImage = UIImage(systemName: "play.rectangle.fill")
      tabs.insert(videos, at: 1)
      NSLog("[HTCarPlayVideo] videos_tab_included=1")
    } else {
      NSLog("[HTCarPlayVideo] videos_tab_included=0 audio_only_ui=1")
    }

    NSLog("[HTCarPlay] template_count=%d root_type=CPTabBarTemplate", tabs.count)

    let tabBar = CPTabBarTemplate(templates: tabs)
    interfaceController.setRootTemplate(tabBar, animated: false) { [weak self] success, error in
      guard let self else { return }
      self.isInstallingRoot = false
      if success {
        self.hasInstalledRoot = true
        self.tabBarTemplate = tabBar
        self.rootListTemplate = home
        self.searchTabTemplate = search
        NSLog("[HTCarPlay] setRootTemplate success=1 type=CPTabBarTemplate")
        self.emitDiagnostic([
          "event": "carplay_root_installed",
          "success": true,
          "message": "",
          "tabCount": tabs.count,
          "rootType": "CPTabBarTemplate",
          "supportsVideoPlayback": self.supportsVideoPlaybackCached,
        ])
        return
      }

      let message = error?.localizedDescription ?? "unknown"
      NSLog("[HTCarPlay] tab_upgrade_failed keeping_list_root message=%@", message)
      self.searchTabTemplate = nil
      self.tabBarTemplate = nil
      self.emitDiagnostic([
        "event": "carplay_tab_upgrade_failed",
        "success": false,
        "message": message,
        "tabCount": tabs.count,
      ])
    }
  }

  private func ensureSessionConfiguration() {
    if sessionConfiguration == nil {
      sessionConfiguration = CPSessionConfiguration(delegate: self)
      NSLog("[HTCarPlayVideo] session_configuration_created")
    }
  }

  /// Gates video browsing UI. Uses a runtime-safe probe so older SDKs still compile,
  /// and never invents custom driving-state logic when video becomes unavailable.
  private func refreshVideoCapability(reason: String) {
    ensureSessionConfiguration()
    let supports = readSupportsVideoPlayback(from: sessionConfiguration)
    let changed = supports != supportsVideoPlaybackCached
    supportsVideoPlaybackCached = supports
    NSLog(
      "[HTCarPlayVideo] supportsVideoPlayback=%d reason=%@",
      supports ? 1 : 0,
      reason
    )
    emitDiagnostic([
      "event": "carplay_video_capability",
      "supportsVideoPlayback": supports,
      "reason": reason,
      "changed": changed,
    ])
  }

  private func readSupportsVideoPlayback(from configuration: CPSessionConfiguration?) -> Bool {
    guard let configuration else { return false }
    // Runtime-safe: property is declared on newer CarPlay SDKs (video-in-car).
    let key = "supportsVideoPlayback"
    guard configuration.responds(to: NSSelectorFromString(key)) else {
      NSLog("[HTCarPlayVideo] supportsVideoPlayback selector_missing")
      return false
    }
    if let value = configuration.value(forKey: key) as? Bool {
      return value
    }
    return false
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

    if sections.isEmpty {
      let empty = CPListItem(
        text: HiddenAudioCarPlayCatalog.emptyMessageTitle,
        detailText: HiddenAudioCarPlayCatalog.emptyMessageSubtitle
      )
      sections = [CPListSection(items: [empty])]
    }

    let template = CPListTemplate(title: title, sections: sections)
    template.tabTitle = title
    template.tabImage = UIImage(systemName: "house.fill")
    return template
  }

  private func makeListTemplate(title: String, parentId: String) -> CPListTemplate {
    var nodes = HiddenAudioCarPlayCatalog.children(for: parentId)
    if nodes.isEmpty {
      nodes = [
        HiddenAudioCarPlayBrowseNode(
          mediaId: "empty:\(parentId)",
          title: HiddenAudioCarPlayCatalog.emptyMessageTitle,
          subtitle: HiddenAudioCarPlayCatalog.emptyMessageSubtitle,
          playable: false
        ),
      ]
    }
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
    let nodes = HiddenAudioCarPlayCatalog.children(for: sectionId)
    if nodes.isEmpty {
      return [
        HiddenAudioCarPlayBrowseNode(
          mediaId: "empty:\(sectionId)",
          title: HiddenAudioCarPlayCatalog.emptyMessageTitle,
          subtitle: HiddenAudioCarPlayCatalog.emptyMessageSubtitle,
          playable: false
        ),
      ]
    }
    return nodes
  }

  private func tabImage(for parentId: String) -> UIImage? {
    switch parentId {
    case HiddenAudioCarPlayCatalog.rootId:
      return UIImage(systemName: "house.fill")
    case "playlists":
      return UIImage(systemName: "music.note.list")
    case "made_for_you", "music":
      return UIImage(systemName: "sparkles")
    case "radio":
      return UIImage(systemName: "radio")
    case "podcasts":
      return UIImage(systemName: "mic.fill")
    case "audiobooks":
      return UIImage(systemName: "book.fill")
    case "motivationals":
      return UIImage(systemName: "bolt.fill")
    case "lectures":
      return UIImage(systemName: "graduationcap.fill")
    case "videos":
      return UIImage(systemName: "play.rectangle.fill")
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
    performOnMain { [weak self] in
      guard let self, let interfaceController = self.interfaceController else { return }
      var children = HiddenAudioCarPlayCatalog.children(for: node.mediaId)
      if children.isEmpty {
        children = [
          HiddenAudioCarPlayBrowseNode(
            mediaId: "empty:\(node.mediaId)",
            title: HiddenAudioCarPlayCatalog.emptyMessageTitle,
            subtitle: HiddenAudioCarPlayCatalog.emptyMessageSubtitle,
            playable: false
          ),
        ]
      }
      let items = children.map { self.makeListItem(for: $0, parentId: node.mediaId) }
      let template = CPListTemplate(
        title: node.title,
        sections: [CPListSection(items: items)]
      )
      interfaceController.pushTemplate(template, animated: true) { [weak self] success, error in
        if let error {
          NSLog("[HTCarPlay] push_failed mediaId=%@ success=%d", node.mediaId, success ? 1 : 0)
          self?.emitDiagnostic([
            "event": "carplay_push_failed",
            "mediaId": node.mediaId,
            "message": error.localizedDescription,
            "success": success,
          ])
        }
      }
    }
  }

  private func selectPlayable(mediaId: String) {
    NSLog("[HTCarPlay] item_selected mediaId=%@", mediaId)
    if supportsVideoPlaybackCached && mediaId.hasPrefix("video:") {
      NSLog("[HTCarPlayVideo] preferred_presentation=video mediaId=%@", mediaId)
    } else {
      NSLog("[HTCarPlayVideo] preferred_presentation=audio mediaId=%@", mediaId)
    }
    emitDiagnostic([
      "event": "carplay_item_selected",
      "mediaId": mediaId,
      "supportsVideoPlayback": supportsVideoPlaybackCached,
    ])
    // Route through the existing HiddenAudio + PlayerContext play path only.
    // Do not start a second player or replace audio ownership here.
    // When video becomes unavailable mid-session, CarPlay continues compatible
    // content as audio-only — we do not stop the media session here.
    playbackHandler?.emitCarPlayMediaSelection(mediaId)
    presentNowPlayingIfConnected()
  }

  private func performOnMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }

  private func emitDiagnostic(_ data: [String: Any]) {
    onCarPlayDiagnostic?(data)
  }
}

extension HiddenAudioCarPlayManager: CPSearchTemplateDelegate {
  func searchTemplate(
    _ searchTemplate: CPSearchTemplate,
    updatedSearchText searchText: String,
    completionHandler: @escaping ([CPListItem]) -> Void
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

extension HiddenAudioCarPlayManager: CPSessionConfigurationDelegate {
  func sessionConfiguration(
    _ configuration: CPSessionConfiguration,
    limitedUserInterfacesChanged limitedUserInterfaces: CPLimitableUserInterface
  ) {
    // Limits changed — keep current playback; only refresh capability/UI if needed.
    NSLog("[HTCarPlay] limited_user_interfaces_changed")
  }

  func sessionConfiguration(
    _ configuration: CPSessionConfiguration,
    contentStyleChanged contentStyle: CPContentStyle
  ) {
    NSLog("[HTCarPlay] content_style_changed")
  }
}
