import CarPlay
import Foundation
import UIKit

protocol HiddenAudioCarPlayPlaybackHandling: AnyObject {
  func playCarPlayTrack(_ track: [String: Any], completion: @escaping (Error?) -> Void)
  func emitCarPlayMediaSelection(_ mediaId: String)
}

/// Single native CarPlay UI owner.
/// Scene connect always gets a minimum CPListTemplate root first.
/// A validated Listen / Radio / Library CPTabBarTemplate may replace it later.
/// Invalid tab arrays never reach `CPTabBarTemplate(templates:)`.
final class HiddenAudioCarPlayManager: NSObject {
  static let shared = HiddenAudioCarPlayManager()

  weak var playbackHandler: HiddenAudioCarPlayPlaybackHandling?
  var onCarPlayDiagnostic: (([String: Any]) -> Void)?

  /// Strong retention for the CarPlay session (Apple guidance).
  private var interfaceController: CPInterfaceController?
  private var carWindow: CPWindow?
  private var rootListTemplate: CPListTemplate?
  private var tabBarTemplate: CPTabBarTemplate?
  private var listenTabTemplate: CPListTemplate?
  private var radioTabTemplate: CPListTemplate?
  private var libraryTabTemplate: CPListTemplate?
  private var presentedSearchTemplate: CPSearchTemplate?
  private var sessionConfiguration: CPSessionConfiguration?
  private var supportsVideoPlaybackCached = false
  private var isConnected = false
  private var hasInstalledRoot = false
  private var isInstallingRoot = false
  private var hasUpgradedToTabs = false
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

  /// Scene-lifecycle diagnostics for Metro (`ios_carplay_status`) when setup has wired the sink.
  func emitLifecycleDiagnostic(_ event: String, _ extra: [String: Any] = [:]) {
    var data = extra
    data["event"] = event
    data["connected"] = isConnected
    data["hasInterfaceController"] = interfaceController != nil
    emitDiagnostic(data)
  }

  /// Attach after the scene delegate has already installed the safe CPListTemplate root.
  func attachConnectedSession(
    interfaceController: CPInterfaceController,
    window: CPWindow? = nil,
    preinstalledRoot: CPListTemplate
  ) {
    let work = { [weak self] in
      guard let self else { return }

      if self.isConnected,
         self.interfaceController === interfaceController,
         self.rootListTemplate != nil || self.tabBarTemplate != nil,
         (self.hasInstalledRoot || self.isInstallingRoot) {
        if let window {
          self.carWindow = window
        }
        NSLog("[HTCarPlay] connect_idempotent_skip")
        return
      }

      self.connectionGeneration &+= 1
      let generation = self.connectionGeneration
      self.activeConnectionGeneration = generation
      self.interfaceController = interfaceController
      self.carWindow = window
      self.isConnected = true
      self.isInstallingRoot = false
      self.hasInstalledRoot = true
      self.hasUpgradedToTabs = false
      self.rootListTemplate = preinstalledRoot
      self.tabBarTemplate = nil
      self.listenTabTemplate = nil
      self.radioTabTemplate = nil
      self.libraryTabTemplate = nil
      self.presentedSearchTemplate = nil
      HiddenAudioCarPlayCatalog.ensureDefaultCatalog()
      self.ensureSessionConfiguration()
      self.refreshVideoCapability(reason: "connected")
      NSLog("[HTCarPlay] interface_controller_attached")
      NSLog("[HTCarPlay] connected hasWindow=%d preinstalled_root=1", window != nil ? 1 : 0)
      NSLog("[HTCarPlay] root_retained")

      // Populate the visible safe list, then attempt a validated tab upgrade.
      self.updateExistingRootListFromCatalog()
      self.tryUpgradeToValidatedTabRoot(generation: generation)

      self.emitDiagnostic([
        "event": "carplay_connected",
        "hasInterfaceController": true,
        "hasWindow": window != nil,
        "supportsVideoPlayback": self.supportsVideoPlaybackCached,
        "generation": generation,
        "preinstalledRoot": true,
      ])
    }

    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.sync(execute: work)
    }
  }

  /// Fallback only: prefer `attachConnectedSession` after the scene delegate installs the root.
  func connect(_ interfaceController: CPInterfaceController, window: CPWindow? = nil) {
    let work = { [weak self] in
      guard let self else { return }
      if self.isConnected,
         self.interfaceController === interfaceController,
         self.rootListTemplate != nil || self.tabBarTemplate != nil {
        NSLog("[HTCarPlay] connect_idempotent_skip")
        return
      }
      if let existing = interfaceController.rootTemplate as? CPListTemplate {
        self.attachConnectedSession(
          interfaceController: interfaceController,
          window: window,
          preinstalledRoot: existing
        )
        return
      }
      if let existingTabs = interfaceController.rootTemplate as? CPTabBarTemplate {
        self.connectionGeneration &+= 1
        let generation = self.connectionGeneration
        self.activeConnectionGeneration = generation
        self.interfaceController = interfaceController
        self.carWindow = window
        self.isConnected = true
        self.hasInstalledRoot = true
        self.hasUpgradedToTabs = true
        self.tabBarTemplate = existingTabs
        self.rootListTemplate = nil
        HiddenAudioCarPlayCatalog.ensureDefaultCatalog()
        self.ensureSessionConfiguration()
        self.refreshVideoCapability(reason: "connected")
        self.updateTabSectionsFromCatalog()
        return
      }

      self.connectionGeneration &+= 1
      let generation = self.connectionGeneration
      self.activeConnectionGeneration = generation
      self.interfaceController = interfaceController
      self.carWindow = window
      self.isConnected = true
      self.hasInstalledRoot = false
      self.isInstallingRoot = false
      self.hasUpgradedToTabs = false
      self.rootListTemplate = nil
      self.tabBarTemplate = nil
      self.presentedSearchTemplate = nil
      HiddenAudioCarPlayCatalog.ensureDefaultCatalog()
      self.ensureSessionConfiguration()
      self.refreshVideoCapability(reason: "connected")
      NSLog("[HTCarPlay] interface_controller_attached")
      NSLog("[HTCarPlay] connected hasWindow=%d", window != nil ? 1 : 0)
      self.installSafeFallbackRoot(generation: generation)
      self.emitDiagnostic([
        "event": "carplay_connected",
        "hasInterfaceController": true,
        "hasWindow": window != nil,
        "supportsVideoPlayback": self.supportsVideoPlaybackCached,
        "generation": generation,
        "preinstalledRoot": false,
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
      self.hasUpgradedToTabs = false
      self.activeConnectionGeneration = 0
      self.interfaceController = nil
      self.carWindow = nil
      self.rootListTemplate = nil
      self.tabBarTemplate = nil
      self.listenTabTemplate = nil
      self.radioTabTemplate = nil
      self.libraryTabTemplate = nil
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

  /// Catalog sync refreshes sections in place — never blanks the screen.
  func reloadTemplates() {
    performOnMain { [weak self] in
      guard let self else { return }
      if self.hasUpgradedToTabs {
        self.updateTabSectionsFromCatalog()
      } else {
        self.updateExistingRootListFromCatalog()
      }
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

  // MARK: - Safe fallback root

  private func installSafeFallbackRoot(generation: UInt64) {
    guard let interfaceController else {
      NSLog("[HTCarPlay] root_install_skipped no_interface_controller")
      return
    }
    guard generation == activeConnectionGeneration, isConnected else {
      NSLog("[HTCarPlay] stale_update_ignored reason=install_stale_generation")
      return
    }
    if hasInstalledRoot || rootListTemplate != nil || tabBarTemplate != nil {
      NSLog("[HTCarPlay] root_install_skipped already_installed")
      reloadTemplates()
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
    tabBarTemplate = nil
    hasUpgradedToTabs = false
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
        self.tryUpgradeToValidatedTabRoot(generation: generation)
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

  private func installSafeFallbackRoot(on interfaceController: CPInterfaceController) {
    let (list, itemCount) = makeVisibleFallbackListTemplate()
    rootListTemplate = list
    tabBarTemplate = nil
    listenTabTemplate = nil
    radioTabTemplate = nil
    libraryTabTemplate = nil
    hasUpgradedToTabs = false
    NSLog("[HTCarPlay] fallback_restored reason=invalid_tabs item_count=%d", itemCount)
    NSLog("[HTCarPlay] setRootTemplate start")
    interfaceController.setRootTemplate(list, animated: false) { [weak self] success, error in
      guard let self else { return }
      NSLog(
        "[HTCarPlay] minimal root installed success=%d error=%@",
        success ? 1 : 0,
        String(describing: error)
      )
      if success {
        self.hasInstalledRoot = true
        self.rootListTemplate = list
        self.updateExistingRootListFromCatalog()
      } else {
        self.hasInstalledRoot = false
        self.rootListTemplate = nil
        NSLog("[HTCarPlay] fallback_restored reason=setRoot_failed")
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

  // MARK: - Validated tab upgrade

  /// After the safe list root is live, attempt Listen / Radio / Library tabs.
  /// Never constructs CPTabBarTemplate unless validation succeeds.
  private func tryUpgradeToValidatedTabRoot(generation: UInt64) {
    guard let interfaceController else { return }
    guard generation == activeConnectionGeneration, isConnected, hasInstalledRoot else {
      NSLog("[HTCarPlay] stale_update_ignored reason=tab_upgrade_stale")
      return
    }
    guard !hasUpgradedToTabs, !isInstallingRoot else {
      NSLog("[HTCarPlay] tab_upgrade_skipped already_tabs_or_installing")
      return
    }

    HiddenAudioCarPlayCatalog.ensureDefaultCatalog()
    NSLog("[HTCarPlay] root_template_creation_started type=CPTabBarTemplate")

    let listen = makeListenTab()
    let radio = makeRadioTab()
    let library = makeLibraryTab()
    let templates: [CPTemplate] = [listen, radio, library]

    HiddenAudioCarPlayTabValidation.logTabDiagnostics(templates)

    guard HiddenAudioCarPlayTabValidation.validateCarPlayTabs(templates) else {
      NSLog("[HTCarPlay] tab_validation_failed keeping_safe_list_root")
      emitDiagnostic([
        "event": "carplay_tab_validation_failed",
        "fallback": "CPListTemplate",
      ])
      // Keep the already-visible safe list root — never blank the screen.
      return
    }

    isInstallingRoot = true
    let tabBar = CPTabBarTemplate(templates: templates)
    listenTabTemplate = listen
    radioTabTemplate = radio
    libraryTabTemplate = library
    tabBarTemplate = tabBar

    NSLog("[HTCarPlay] setRootTemplate start type=CPTabBarTemplate")
    interfaceController.setRootTemplate(tabBar, animated: false) { [weak self] success, error in
      guard let self else { return }
      self.isInstallingRoot = false
      guard generation == self.activeConnectionGeneration, self.isConnected else {
        NSLog("[HTCarPlay] stale_update_ignored reason=tab_setRoot_completion")
        return
      }
      NSLog(
        "[HTCarPlay] tab root installed success=%d error=%@",
        success ? 1 : 0,
        String(describing: error)
      )
      NSLog("[HTCarPlay] setRootTemplate complete success=%d", success ? 1 : 0)
      if success {
        self.hasUpgradedToTabs = true
        self.hasInstalledRoot = true
        self.rootListTemplate = nil
        NSLog("[HTCarPlay] root_retained")
        NSLog("[HTCarPlay] root_template_installed type=CPTabBarTemplate")
        self.emitDiagnostic([
          "event": "carplay_tab_root_installed",
          "success": true,
          "tabCount": 3,
          "rootType": "CPTabBarTemplate",
        ])
        self.updateTabSectionsFromCatalog()
      } else {
        self.hasUpgradedToTabs = false
        self.tabBarTemplate = nil
        self.listenTabTemplate = nil
        self.radioTabTemplate = nil
        self.libraryTabTemplate = nil
        NSLog("[HTCarPlay] fallback_restored reason=tab_setRoot_failed")
        self.installSafeFallbackRoot(on: interfaceController)
        self.emitDiagnostic([
          "event": "carplay_tab_root_install_failed",
          "success": false,
          "message": error?.localizedDescription ?? "",
        ])
      }
    }
  }

  private func makeListenTab() -> CPListTemplate {
    // Fresh instance every call — never reuse a template already in a hierarchy.
    let sections = makeListenSections()
    let template = CPListTemplate(title: "Listen", sections: sections)
    template.tabTitle = "Listen"
    template.tabImage = requiredTabImage(["headphones", "house.fill", "music.note"])
    return template
  }

  private func makeRadioTab() -> CPListTemplate {
    let sections = makeRadioSections()
    let template = CPListTemplate(title: "Radio", sections: sections)
    template.tabTitle = "Radio"
    template.tabImage = requiredTabImage([
      "radio",
      "antenna.radiowaves.left.and.right",
      "dot.radiowaves.left.and.right",
      "music.note",
    ])
    return template
  }

  private func makeLibraryTab() -> CPListTemplate {
    let sections = makeLibrarySections()
    let template = CPListTemplate(title: "Library", sections: sections)
    template.tabTitle = "Library"
    template.tabImage = requiredTabImage(["music.note.list", "books.vertical", "music.note"])
    return template
  }

  /// Guarantees a non-nil tab image so validation never rejects for missing artwork.
  private func requiredTabImage(_ systemNames: [String]) -> UIImage {
    for name in systemNames {
      if let image = UIImage(systemName: name) {
        return image
      }
    }
    // Last-resort solid image — still non-nil for CPTabBarTemplate validation.
    let size = CGSize(width: 30, height: 30)
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { context in
      UIColor.systemBlue.setFill()
      context.fill(CGRect(origin: .zero, size: size))
    }
  }

  private func makeListenSections() -> [CPListSection] {
    var sections: [CPListSection] = []

    let recent = nodesForSection("recently_played")
    sections.append(
      CPListSection(
        items: recent.map { makeListItem(for: $0, parentId: "recently_played") },
        header: "Recently Played",
        sectionIndexTitle: nil
      )
    )

    // Favorites helper: always a non-empty safe section (never blanks Listen).
    sections.append(makeFavoritesSection())

    let recommended = nodesForSection("made_for_you")
    sections.append(
      CPListSection(
        items: recommended.map { makeListItem(for: $0, parentId: "made_for_you") },
        header: "Recommended",
        sectionIndexTitle: nil
      )
    )

    // Always expose Search + Now Playing actions without using invalid tab classes.
    let actions: [HiddenAudioCarPlayBrowseNode] = [
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
    sections.append(
      CPListSection(
        items: actions.map { makeListItem(for: $0, parentId: "listen_actions") },
        header: "Controls",
        sectionIndexTitle: nil
      )
    )

    return ensureNonEmptySections(sections, header: "Listen")
  }

  /// Favorites section helper — never returns an empty section and never
  /// requires artwork. Empty/malformed catalog → "No favorites yet".
  private func makeFavoritesSection() -> CPListSection {
    let favorites = HiddenAudioCarPlayCatalog.sanitizedFavoritesNodes()
    let items = favorites.map { makeListItem(for: $0, parentId: "favorites") }
    if items.isEmpty {
      let empty = HiddenAudioCarPlayCatalog.emptyFavoritesNode()
      return CPListSection(
        items: [makeListItem(for: empty, parentId: "favorites")],
        header: "Favorites",
        sectionIndexTitle: nil
      )
    }
    return CPListSection(items: items, header: "Favorites", sectionIndexTitle: nil)
  }

  private func makeRadioSections() -> [CPListSection] {
    let nodes = nodesForSection("radio")
    let section = CPListSection(
      items: nodes.map { makeListItem(for: $0, parentId: "radio") },
      header: "Stations",
      sectionIndexTitle: nil
    )
    return ensureNonEmptySections([section], header: "Radio")
  }

  private func makeLibrarySections() -> [CPListSection] {
    let groups: [(String, String)] = [
      ("playlists", "Playlists"),
      ("music", "Saved Music"),
      ("podcasts", "Podcasts"),
      ("audiobooks", "Audiobooks"),
    ]
    var sections: [CPListSection] = []
    for (parentId, header) in groups {
      let nodes = nodesForSection(parentId)
      sections.append(
        CPListSection(
          items: nodes.map { makeListItem(for: $0, parentId: parentId) },
          header: header,
          sectionIndexTitle: nil
        )
      )
    }
    return ensureNonEmptySections(sections, header: "Library")
  }

  private func nodesForSection(_ sectionId: String) -> [HiddenAudioCarPlayBrowseNode] {
    if sectionId == "favorites" {
      return HiddenAudioCarPlayCatalog.sanitizedFavoritesNodes()
    }

    var nodes = HiddenAudioCarPlayCatalog.children(for: sectionId)
    if nodes.isEmpty {
      nodes = [
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

  private func ensureNonEmptySections(
    _ sections: [CPListSection],
    header: String
  ) -> [CPListSection] {
    let itemCount = sections.reduce(0) { $0 + $1.items.count }
    if itemCount > 0 {
      return sections
    }
    let placeholder = CPListItem(
      text: "Unable to load library",
      detailText: "Retry from your phone"
    )
    placeholder.isEnabled = false
    return [CPListSection(items: [placeholder], header: header, sectionIndexTitle: nil)]
  }

  private func updateExistingRootListFromCatalog() {
    guard isConnected, hasInstalledRoot, let rootListTemplate, !hasUpgradedToTabs else {
      NSLog("[HTCarPlay] stale_update_ignored reason=catalog_no_list_root")
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

  private func updateTabSectionsFromCatalog() {
    guard isConnected, hasUpgradedToTabs else {
      NSLog("[HTCarPlay] stale_update_ignored reason=catalog_no_tab_root")
      return
    }
    if isInstallingRoot {
      NSLog("[HTCarPlay] catalog_update_skipped install_in_progress")
      return
    }

    HiddenAudioCarPlayCatalog.ensureDefaultCatalog()
    listenTabTemplate?.updateSections(makeListenSections())
    radioTabTemplate?.updateSections(makeRadioSections())
    libraryTabTemplate?.updateSections(makeLibrarySections())

    let listenCount = listenTabTemplate?.sections.reduce(0) { $0 + $1.items.count } ?? 0
    let radioCount = radioTabTemplate?.sections.reduce(0) { $0 + $1.items.count } ?? 0
    let libraryCount = libraryTabTemplate?.sections.reduce(0) { $0 + $1.items.count } ?? 0
    NSLog(
      "[HTCarPlay] existing_root_updated section_count=3 item_count=%d",
      listenCount + radioCount + libraryCount
    )
    NSLog("[HTCarPlay] catalog_updated_existing_root")
    emitDiagnostic([
      "event": "carplay_catalog_updated_existing_root",
      "sectionCount": 3,
      "itemCount": listenCount + radioCount + libraryCount,
      "rootType": "CPTabBarTemplate",
      "supportsVideoPlayback": supportsVideoPlaybackCached,
    ])
  }

  // MARK: - Search / session / selection

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
    // Never expose a Videos tab — audio-only CarPlay UI only.
    NSLog("[HTCarPlayVideo] videos_tab_included=0 audio_only_ui=1")
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
      // Audio-safe transition: still route through shared HiddenAudio, never render video in CarPlay.
      NSLog("[HTCarPlayVideo] preferred_presentation=audio mediaId=%@", mediaId)
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
