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
  /// Visible list kept when tab upgrade fails or is deferred.
  private var fallbackListTemplate: CPListTemplate?
  private var pendingCatalogReload = false

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
      self.installRootTemplates(force: true, reason: "connect")
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
      self.fallbackListTemplate = nil
      self.pendingCatalogReload = false
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
      // Never race a root replacement while one is already installing — that blanks CarPlay.
      if self.isInstallingRoot {
        self.pendingCatalogReload = true
        NSLog("[HTCarPlay] root_replacement deferred reason=install_in_progress")
        return
      }
      self.installRootTemplates(force: true, reason: "catalog_reload")
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
    let itemCount = HiddenAudioCarPlayCatalog.children(for: HiddenAudioCarPlayCatalog.rootId).count
    NSLog(
      "[HTCarPlay] catalog_applied section_count=%d item_count=%d",
      sectionCount,
      itemCount
    )
    emitDiagnostic([
      "event": "carplay_catalog_applied",
      "trackCount": trackCount,
      "sectionCount": sectionCount,
      "itemCount": itemCount,
      "connected": isConnected,
    ])
    if isConnected {
      reloadTemplates()
    }
  }

  private func installRootTemplates(force: Bool, reason: String = "connect") {
    guard let interfaceController else {
      NSLog("[HTCarPlay] root_install_skipped no_interface_controller")
      return
    }
    if hasInstalledRoot && !force { return }
    if isInstallingRoot {
      // Even force reloads must wait — concurrent setRootTemplate blanks the display.
      pendingCatalogReload = true
      NSLog("[HTCarPlay] root_install_skipped already_in_progress reason=%@", reason)
      return
    }

    isInstallingRoot = true
    NSLog("[HTCarPlay] root_replacement reason=%@", reason)
    NSLog("[HTCarPlay] root_template_creation_start")

    // Seed catalog for later browse, but first root never depends on it.
    HiddenAudioCarPlayCatalog.ensureDefaultCatalog()

    let (fallback, itemCount) = makeVisibleFallbackListTemplate()
    fallbackListTemplate = fallback
    rootListTemplate = fallback
    tabBarTemplate = nil
    searchTabTemplate = nil
    NSLog("[HTCarPlay] fallback_template_created item_count=%d", itemCount)
    NSLog("[HTCarPlay] setRootTemplate start type=CPListTemplate")

    interfaceController.setRootTemplate(fallback, animated: false) { [weak self] success, error in
      guard let self else { return }
      let message = error?.localizedDescription ?? ""
      NSLog(
        "[HTCarPlay] setRootTemplate complete success=%d type=CPListTemplate",
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
          "itemCount": itemCount,
        ])
        // Upgrade only after a visibly non-empty list root is confirmed.
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
        self.flushPendingCatalogReloadIfNeeded()
      }
    }
  }

  /// Hardcoded visible list — independent of Metro, JS, network, and catalog APIs.
  private func makeVisibleFallbackListTemplate() -> (CPListTemplate, Int) {
    let nodes: [HiddenAudioCarPlayBrowseNode] = [
      HiddenAudioCarPlayBrowseNode(
        mediaId: "now_playing",
        title: "Hidden Tunes is ready",
        subtitle: "Native CarPlay interface",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "now_playing",
        title: "Open Now Playing",
        subtitle: "Current session",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "browse_home",
        title: "Browse Library",
        subtitle: "Music, radio, and more",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "metro_hint",
        title: "Connect to Metro for full catalog",
        subtitle: "Development client",
        playable: false
      ),
    ]
    let items = nodes.map { makeListItem(for: $0, parentId: HiddenAudioCarPlayCatalog.rootId) }
    let template = CPListTemplate(
      title: "Hidden Tunes",
      sections: [CPListSection(items: items)]
    )
    template.tabTitle = "Hidden Tunes"
    template.tabImage = UIImage(systemName: "house.fill")
    return (template, items.count)
  }

  /// Prefer Home + Search tabs once the safe list root is live.
  /// Videos tab is included only when CPSessionConfiguration.supportsVideoPlayback is true.
  private func upgradeToTabBarRoot(on interfaceController: CPInterfaceController) {
    refreshVideoCapability(reason: "root_upgrade")
    HiddenAudioCarPlayCatalog.ensureDefaultCatalog()

    // Fresh templates every install — never re-parent an existing template instance.
    let home = makeNonEmptyListTemplate(title: "Home", parentId: HiddenAudioCarPlayCatalog.rootId)
    home.tabImage = UIImage(systemName: "house.fill")
    home.tabTitle = "Home"

    let search = CPSearchTemplate()
    search.delegate = self
    search.tabTitle = "Search"
    search.tabImage = UIImage(systemName: "magnifyingglass")

    var tabs: [CPTemplate] = [home, search]
    if supportsVideoPlaybackCached {
      let videos = makeNonEmptyListTemplate(title: "Videos", parentId: "videos")
      videos.tabImage = UIImage(systemName: "play.rectangle.fill")
      videos.tabTitle = "Videos"
      tabs.insert(videos, at: 1)
      NSLog("[HTCarPlayVideo] videos_tab_included=1")
    } else {
      NSLog("[HTCarPlayVideo] videos_tab_included=0 audio_only_ui=1")
    }

    guard tabs.count >= 1 else {
      NSLog("[HTCarPlay] tab_upgrade_failed keeping_list_root message=zero_tabs")
      isInstallingRoot = false
      flushPendingCatalogReloadIfNeeded()
      return
    }

    NSLog("[HTCarPlay] tab_template_created tab_count=%d", tabs.count)
    NSLog("[HTCarPlay] setRootTemplate start type=CPTabBarTemplate")

    let tabBar = CPTabBarTemplate(templates: tabs)
    interfaceController.setRootTemplate(tabBar, animated: false) { [weak self] success, error in
      guard let self else { return }
      self.isInstallingRoot = false
      let message = error?.localizedDescription ?? ""
      NSLog(
        "[HTCarPlay] tab_upgrade_complete success=%d",
        success ? 1 : 0
      )
      NSLog(
        "[HTCarPlay] setRootTemplate complete success=%d type=CPTabBarTemplate",
        success ? 1 : 0
      )
      if success {
        self.hasInstalledRoot = true
        self.tabBarTemplate = tabBar
        self.rootListTemplate = home
        self.searchTabTemplate = search
        self.emitDiagnostic([
          "event": "carplay_root_installed",
          "success": true,
          "message": "",
          "tabCount": tabs.count,
          "rootType": "CPTabBarTemplate",
          "supportsVideoPlayback": self.supportsVideoPlaybackCached,
        ])
        self.flushPendingCatalogReloadIfNeeded()
        return
      }

      // Keep a visibly non-empty list — never leave blank after a rejected tab root.
      NSLog("[HTCarPlay] tab_upgrade_failed keeping_list_root message=%@", message)
      self.searchTabTemplate = nil
      self.tabBarTemplate = nil
      let (freshFallback, restoreCount) = self.makeVisibleFallbackListTemplate()
      self.fallbackListTemplate = freshFallback
      self.rootListTemplate = freshFallback
      NSLog("[HTCarPlay] fallback_template_created item_count=%d", restoreCount)
      NSLog("[HTCarPlay] setRootTemplate start type=CPListTemplate reason=restore_fallback")
      interfaceController.setRootTemplate(freshFallback, animated: false) { restoreSuccess, _ in
        NSLog(
          "[HTCarPlay] setRootTemplate complete success=%d type=CPListTemplate",
          restoreSuccess ? 1 : 0
        )
        self.hasInstalledRoot = restoreSuccess
      }
      self.emitDiagnostic([
        "event": "carplay_tab_upgrade_failed",
        "success": false,
        "message": message,
        "tabCount": tabs.count,
      ])
      self.flushPendingCatalogReloadIfNeeded()
    }
  }

  private func flushPendingCatalogReloadIfNeeded() {
    guard pendingCatalogReload, isConnected, !isInstallingRoot else { return }
    pendingCatalogReload = false
    NSLog("[HTCarPlay] root_replacement reason=pending_catalog_flush")
    installRootTemplates(force: true, reason: "pending_catalog_flush")
  }

  /// List template that can never install with zero visible items.
  private func makeNonEmptyListTemplate(title: String, parentId: String) -> CPListTemplate {
    var nodes = HiddenAudioCarPlayCatalog.children(for: parentId)
    if nodes.isEmpty {
      nodes = [
        HiddenAudioCarPlayBrowseNode(
          mediaId: "empty:\(parentId)",
          title: "No items available",
          subtitle: "Hidden Tunes",
          playable: false
        ),
      ]
    }
    let items = nodes.map { makeListItem(for: $0, parentId: parentId) }
    let template = CPListTemplate(
      title: title,
      sections: [CPListSection(items: items.isEmpty ? [
        CPListItem(text: "No items available", detailText: "Hidden Tunes")
      ] : items)]
    )
    template.tabTitle = title
    template.tabImage = tabImage(for: parentId)
    return template
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

    if node.mediaId == "metro_hint" {
      return
    }

    if node.mediaId == "browse_home" {
      pushChildList(
        for: HiddenAudioCarPlayBrowseNode(
          mediaId: HiddenAudioCarPlayCatalog.rootId,
          title: "Browse Library",
          subtitle: "Music, radio, and more",
          playable: false
        )
      )
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
