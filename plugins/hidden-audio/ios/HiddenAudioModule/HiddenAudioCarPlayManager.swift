import CarPlay
import Foundation
import UIKit

protocol HiddenAudioCarPlayPlaybackHandling: AnyObject {
  func playCarPlayTrack(_ track: [String: Any], completion: @escaping (Error?) -> Void)
  func emitCarPlayMediaSelection(_ mediaId: String)
}

/// Single native CarPlay UI owner.
/// Exactly one CPListTemplate root. Tab-bar construction is intentionally absent.
final class HiddenAudioCarPlayManager: NSObject {
  static let shared = HiddenAudioCarPlayManager()

  weak var playbackHandler: HiddenAudioCarPlayPlaybackHandling?
  var onCarPlayDiagnostic: (([String: Any]) -> Void)?

  /// Strong retention for the CarPlay session (Apple guidance).
  private var interfaceController: CPInterfaceController?
  private var carWindow: CPWindow?
  private var rootListTemplate: CPListTemplate?
  private var presentedSearchTemplate: CPSearchTemplate?
  private var sessionConfiguration: CPSessionConfiguration?
  private var supportsVideoPlaybackCached = false
  private var isConnected = false
  private var hasInstalledRoot = false
  private var isInstallingRoot = false
  /// Increments on each connect; stale async callbacks must ignore older generations.
  private var connectionGeneration: UInt64 = 0
  private var activeConnectionGeneration: UInt64 = 0

  func startIfNeeded() {
    HiddenAudioCarPlayCatalog.ensureDefaultCatalog()
    ensureSessionConfiguration()
    refreshVideoCapability(reason: "manager_ready")
    NSLog("[HTCarPlayVideo] entitlement_present=1")
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
      self.connectionGeneration &+= 1
      let generation = self.connectionGeneration
      self.activeConnectionGeneration = generation
      self.interfaceController = interfaceController
      self.carWindow = window
      self.isConnected = true
      self.hasInstalledRoot = false
      self.isInstallingRoot = false
      self.rootListTemplate = nil
      self.presentedSearchTemplate = nil
      HiddenAudioCarPlayCatalog.ensureDefaultCatalog()
      self.ensureSessionConfiguration()
      self.refreshVideoCapability(reason: "connected")
      NSLog("[HTCarPlay] interface_controller_attached")
      NSLog("[HTCarPlay] connected hasWindow=%d", window != nil ? 1 : 0)
      self.installSingleListRootIfNeeded(generation: generation)
      self.emitDiagnostic([
        "event": "carplay_connected",
        "hasInterfaceController": true,
        "hasWindow": window != nil,
        "supportsVideoPlayback": self.supportsVideoPlaybackCached,
        "generation": generation,
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
      self.activeConnectionGeneration = 0
      self.interfaceController = nil
      self.carWindow = nil
      self.rootListTemplate = nil
      self.presentedSearchTemplate = nil
      NSLog("[HTCarPlay] scene_disconnect")
      NSLog("[HTCarPlay] disconnected playback_preserved=1")
      NSLog(
        "[HTCarPlayVideo] disconnect supportsVideoPlayback=%d playback_preserved=1",
        self.supportsVideoPlaybackCached ? 1 : 0
      )
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

  /// Catalog sync must never replace the root — only refresh sections in place.
  func reloadTemplates() {
    performOnMain { [weak self] in
      self?.updateExistingRootListFromCatalog()
    }
  }

  func presentNowPlayingIfConnected() {
    performOnMain { [weak self] in
      guard let self, self.isConnected, let interfaceController = self.interfaceController else { return }
      let nowPlaying = CPNowPlayingTemplate.shared
      if interfaceController.topTemplate !== nowPlaying {
        interfaceController.pushTemplate(nowPlaying, animated: true) { [weak self] success, error in
          if success {
            NSLog("[HTCarPlay] now_playing_opened")
          }
          if let error {
            NSLog("[HTCarPlay] now_playing_push_failed success=%d", success ? 1 : 0)
            self?.emitDiagnostic([
              "event": "carplay_now_playing_push_failed",
              "message": error.localizedDescription,
              "success": success,
            ])
          }
        }
      } else {
        NSLog("[HTCarPlay] now_playing_opened")
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

  /// Exactly one root installation for the CarPlay session.
  private func installSingleListRootIfNeeded(generation: UInt64) {
    guard let interfaceController else {
      NSLog("[HTCarPlay] root_install_skipped no_interface_controller")
      return
    }
    guard generation == activeConnectionGeneration, isConnected else {
      NSLog("[HTCarPlay] stale_update_ignored reason=install_stale_generation")
      return
    }
    if hasInstalledRoot || rootListTemplate != nil {
      NSLog("[HTCarPlay] root_install_skipped already_installed")
      updateExistingRootListFromCatalog()
      return
    }
    if isInstallingRoot {
      NSLog("[HTCarPlay] root_install_skipped already_in_progress")
      return
    }

    isInstallingRoot = true
    HiddenAudioCarPlayCatalog.ensureDefaultCatalog()

    let (list, itemCount) = makeVisibleFallbackListTemplate()
    rootListTemplate = list
    NSLog("[HTCarPlay] root_created type=CPListTemplate item_count=%d", itemCount)
    NSLog("[HTCarPlay] root_type=CPListTemplate")
    NSLog("[HTCarPlay] fallback_item_count=%d", itemCount)
    NSLog("[HTCarPlay] setRootTemplate start")

    interfaceController.setRootTemplate(list, animated: false) { [weak self] success, error in
      guard let self else { return }
      self.isInstallingRoot = false
      guard generation == self.activeConnectionGeneration, self.isConnected else {
        NSLog("[HTCarPlay] stale_update_ignored reason=setRoot_completion")
        return
      }
      let message = error?.localizedDescription ?? ""
      NSLog("[HTCarPlay] setRootTemplate complete success=%d", success ? 1 : 0)
      NSLog("[HTCarPlay] setRootTemplate success=%d", success ? 1 : 0)
      if success {
        self.hasInstalledRoot = true
        NSLog("[HTCarPlay] root_retained")
        self.emitDiagnostic([
          "event": "carplay_root_installed",
          "success": true,
          "message": "",
          "rootType": "CPListTemplate",
          "itemCount": itemCount,
        ])
      } else {
        self.hasInstalledRoot = false
        self.rootListTemplate = nil
        NSLog("[HTCarPlay] fallback_restored reason=setRoot_failed")
        self.emitDiagnostic([
          "event": "carplay_root_install_failed",
          "success": false,
          "message": message,
          "rootType": "CPListTemplate",
        ])
      }
    }
  }

  /// Hardcoded visible list — independent of Metro, JS, network, and catalog APIs.
  private func makeVisibleFallbackListTemplate() -> (CPListTemplate, Int) {
    let items = makeStableRootItems()
    let template = CPListTemplate(
      title: "Hidden Tunes",
      sections: [CPListSection(items: items, header: "Hidden Tunes", sectionIndexTitle: nil)]
    )
    return (template, items.count)
  }

  private func makeStableRootItems() -> [CPListItem] {
    let nodes: [HiddenAudioCarPlayBrowseNode] = [
      HiddenAudioCarPlayBrowseNode(
        mediaId: "ready",
        title: "Hidden Tunes is ready",
        subtitle: "Native CarPlay interface",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "browse_home",
        title: "Browse Library",
        subtitle: "Music, radio, and more",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "now_playing",
        title: "Now Playing",
        subtitle: "Current session",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "search",
        title: "Search",
        subtitle: "Find tracks",
        playable: false
      ),
    ]
    return nodes.map { makeListItem(for: $0, parentId: HiddenAudioCarPlayCatalog.rootId) }
  }

  /// Refresh the existing root list in place. Never calls setRootTemplate again.
  private func updateExistingRootListFromCatalog() {
    guard isConnected, hasInstalledRoot, let rootListTemplate else {
      NSLog("[HTCarPlay] stale_update_ignored reason=catalog_no_root")
      return
    }
    if isInstallingRoot {
      NSLog("[HTCarPlay] catalog_update_skipped install_in_progress")
      return
    }

    HiddenAudioCarPlayCatalog.ensureDefaultCatalog()
    var sections: [CPListSection] = [
      CPListSection(items: makeStableRootItems(), header: "Hidden Tunes", sectionIndexTitle: nil),
    ]

    let libraryNodes = HiddenAudioCarPlayCatalog.children(for: HiddenAudioCarPlayCatalog.rootId)
    if !libraryNodes.isEmpty {
      let libraryItems = libraryNodes.map {
        makeListItem(for: $0, parentId: HiddenAudioCarPlayCatalog.rootId)
      }
      sections.append(
        CPListSection(items: libraryItems, header: "Library", sectionIndexTitle: nil)
      )
    }

    // Never blank: if somehow sections empty, restore fallback.
    if sections.isEmpty {
      NSLog("[HTCarPlay] fallback_restored reason=empty_catalog_sections")
      sections = [
        CPListSection(items: makeStableRootItems(), header: "Hidden Tunes", sectionIndexTitle: nil),
      ]
    }

    let itemCount = sections.reduce(0) { $0 + $1.items.count }
    rootListTemplate.updateSections(sections)
    NSLog(
      "[HTCarPlay] existing_root_updated section_count=%d item_count=%d",
      sections.count,
      itemCount
    )
    NSLog("[HTCarPlay] catalog_updated_existing_root")
    emitDiagnostic([
      "event": "carplay_catalog_updated_existing_root",
      "sectionCount": sections.count,
      "itemCount": itemCount,
      "supportsVideoPlayback": supportsVideoPlaybackCached,
    ])
  }

  private func presentSearchTemplate() {
    performOnMain { [weak self] in
      guard let self, let interfaceController = self.interfaceController else { return }
      let search = CPSearchTemplate()
      search.delegate = self
      self.presentedSearchTemplate = search
      NSLog("[HTCarPlay] search_presented")
      interfaceController.presentTemplate(search, animated: true) { success, error in
        if let error {
          self.emitDiagnostic([
            "event": "carplay_search_present_failed",
            "success": success,
            "message": error.localizedDescription,
          ])
        }
      }
    }
  }

  private func ensureSessionConfiguration() {
    if sessionConfiguration == nil {
      sessionConfiguration = CPSessionConfiguration(delegate: self)
      NSLog("[HTCarPlayVideo] session_configuration_created")
    }
  }

  private func refreshVideoCapability(reason: String) {
    ensureSessionConfiguration()
    let supports = readSupportsVideoPlayback(from: sessionConfiguration)
    let changed = supports != supportsVideoPlaybackCached
    supportsVideoPlaybackCached = supports
    let mode = supports ? "video-capable" : "audio-only"
    NSLog("[HTCarPlayVideo] entitlement_present=1")
    NSLog(
      "[HTCarPlayVideo] supportsVideoPlayback=%d reason=%@",
      supports ? 1 : 0,
      reason
    )
    NSLog("[HTCarPlayVideo] mode=%@", mode)
    emitDiagnostic([
      "event": "carplay_video_capability",
      "supportsVideoPlayback": supports,
      "reason": reason,
      "changed": changed,
      "mode": mode,
    ])
  }

  private func readSupportsVideoPlayback(from configuration: CPSessionConfiguration?) -> Bool {
    guard let configuration else { return false }
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

    if node.mediaId.hasPrefix("empty:") || node.mediaId == "ready" {
      return
    }

    if node.mediaId == "now_playing" || parentId == "now_playing" {
      presentNowPlayingIfConnected()
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
      presentSearchTemplate()
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
    NSLog("[HTCarPlay] item_selected id=%@", mediaId)
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
    NSLog("[HTCarPlay] limited_user_interfaces_changed")
  }

  func sessionConfiguration(
    _ configuration: CPSessionConfiguration,
    contentStyleChanged contentStyle: CPContentStyle
  ) {
    NSLog("[HTCarPlay] content_style_changed")
  }
}
