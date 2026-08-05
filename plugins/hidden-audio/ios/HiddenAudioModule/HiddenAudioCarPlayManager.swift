import CarPlay
import Foundation
import UIKit

protocol HiddenAudioCarPlayPlaybackHandling: AnyObject {
  func playCarPlayTrack(_ track: [String: Any], completion: @escaping (Error?) -> Void)
  func emitCarPlayMediaSelection(_ mediaId: String, parentId: String)
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
  private var sessionConfiguration: CPSessionConfiguration?
  private var supportsVideoPlaybackCached = false
  private var isConnected = false
  private var hasInstalledRoot = false
  private var isInstallingRoot = false
  private var isNavigationTransitionInProgress = false
  private var hasPendingCatalogRefresh = false
  private var hasUpgradedToTabs = false
  private var templateMediaIds: [ObjectIdentifier: String] = [:]
  private var lastSelectionMediaId = ""
  private var lastSelectionAt: CFAbsoluteTime = 0
  private var listItemMediaIds: [ObjectIdentifier: String] = [:]
  private var lastCatalogSnapshotData: Data?
  private var fallbackArtworkCache: [String: UIImage] = [:]
  /// Increments on each connect; stale async callbacks must ignore older generations.
  private var connectionGeneration: UInt64 = 0
  private var activeConnectionGeneration: UInt64 = 0

  func startIfNeeded() {
    NSLog(
      "[HTCarPlayNative] manager.init.enter generation=%llu connected=%d mainThread=%d",
      activeConnectionGeneration,
      isConnected ? 1 : 0,
      Thread.isMainThread ? 1 : 0
    )
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
    NSLog(
      "[HTCarPlayNative] manager.init.exit generation=%llu connected=%d mainThread=%d",
      activeConnectionGeneration,
      isConnected ? 1 : 0,
      Thread.isMainThread ? 1 : 0
    )
  }

  /// Scene-lifecycle diagnostics for Metro (`ios_carplay_status`) when setup has wired the sink.
  func emitLifecycleDiagnostic(_ event: String, _ extra: [String: Any] = [:]) {
    var data = extra
    data["event"] = event
    data["connected"] = isConnected
    data["hasInterfaceController"] = interfaceController != nil
    emitDiagnostic(data)
  }

  /// Attach after the scene delegate has successfully installed the safe CPListTemplate root.
  /// Never upgrades to tabs in the same turn as an in-flight `setRootTemplate`.
  func attachConnectedSession(
    interfaceController: CPInterfaceController,
    window: CPWindow? = nil,
    preinstalledRoot: CPListTemplate,
    rootInstallConfirmed: Bool = true
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
        self.emitLifecycleDiagnostic(
          "carplay_attach_idempotent_skip",
          ["hasInterfaceController": true]
        )
        return
      }

      self.connectionGeneration &+= 1
      let generation = self.connectionGeneration
      self.activeConnectionGeneration = generation
      self.interfaceController = interfaceController
      interfaceController.delegate = self
      self.carWindow = window
      self.isConnected = true
      self.isInstallingRoot = false
      self.isNavigationTransitionInProgress = false
      // Only treat the root as installed when the scene (or manager) confirmed setRoot success.
      self.hasInstalledRoot = rootInstallConfirmed
      self.hasUpgradedToTabs = false
      self.rootListTemplate = preinstalledRoot
      self.tabBarTemplate = nil
      self.listenTabTemplate = nil
      self.radioTabTemplate = nil
      self.libraryTabTemplate = nil
      HiddenAudioCarPlayCatalog.ensureDefaultCatalog()
      self.ensureSessionConfiguration()
      self.refreshVideoCapability(reason: "connected")
      NSLog("[HTCarPlay] interface_controller_attached")
      NSLog(
        "[HTCarPlay] connected hasWindow=%d preinstalled_root=1 confirmed=%d",
        window != nil ? 1 : 0,
        rootInstallConfirmed ? 1 : 0
      )
      NSLog("[HTCarPlay] root_retained")
      self.emitLifecycleDiagnostic(
        "carplay_interface_attached",
        [
          "hasInterfaceController": true,
          "hasWindow": window != nil,
          "rootInstallConfirmed": rootInstallConfirmed,
          "generation": generation,
        ]
      )

      if rootInstallConfirmed {
        // Replay any catalog that arrived before CarPlay connected (in-place; never blanks).
        self.updateExistingRootListFromCatalog()
        self.emitLifecycleDiagnostic(
          "carplay_catalog_replayed_after_connect",
          ["generation": generation]
        )
        // Defer tab upgrade so it cannot race the scene's completed setRootTemplate.
        self.scheduleValidatedTabUpgrade(generation: generation)
      } else {
        self.installSafeFallbackRoot(generation: generation, attempt: 1)
      }

      self.emitDiagnostic([
        "event": "carplay_connected",
        "hasInterfaceController": true,
        "hasWindow": window != nil,
        "supportsVideoPlayback": self.supportsVideoPlaybackCached,
        "generation": generation,
        "preinstalledRoot": true,
        "rootInstallConfirmed": rootInstallConfirmed,
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
        interfaceController.delegate = self
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
      interfaceController.delegate = self
      self.carWindow = window
      self.isConnected = true
      self.hasInstalledRoot = false
      self.isInstallingRoot = false
      self.isNavigationTransitionInProgress = false
      self.hasPendingCatalogRefresh = false
      self.hasUpgradedToTabs = false
      self.rootListTemplate = nil
      self.tabBarTemplate = nil
      HiddenAudioCarPlayCatalog.ensureDefaultCatalog()
      self.ensureSessionConfiguration()
      self.refreshVideoCapability(reason: "connected")
      NSLog("[HTCarPlay] interface_controller_attached")
      NSLog("[HTCarPlay] connected hasWindow=%d", window != nil ? 1 : 0)
      self.emitLifecycleDiagnostic(
        "carplay_manager_connect_installing_root",
        ["hasInterfaceController": true, "generation": generation]
      )
      self.installSafeFallbackRoot(generation: generation, attempt: 1)
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
      self.isNavigationTransitionInProgress = false
      self.hasPendingCatalogRefresh = false
      self.hasUpgradedToTabs = false
      self.templateMediaIds.removeAll(keepingCapacity: false)
      self.lastSelectionMediaId = ""
      self.lastSelectionAt = 0
      self.listItemMediaIds.removeAll(keepingCapacity: false)
      HiddenAudioCarPlayArtworkLoader.shared.cancelOutstandingRequests()
      self.activeConnectionGeneration = 0
      self.interfaceController = nil
      self.carWindow = nil
      self.rootListTemplate = nil
      self.tabBarTemplate = nil
      self.listenTabTemplate = nil
      self.radioTabTemplate = nil
      self.libraryTabTemplate = nil
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
  /// When CarPlay is not connected yet, the snapshot is retained for replay after attach.
  func reloadTemplates() {
    performOnMain { [weak self] in
      guard let self else { return }
      guard self.canApplyCatalogRefreshNow() else {
        self.hasPendingCatalogRefresh = self.isConnected
        self.emitLifecycleDiagnostic("carplay_catalog_refresh_queued")
        return
      }
      self.applyCatalogRefreshNow()
    }
  }

  private func canApplyCatalogRefreshNow() -> Bool {
    guard isConnected, let interfaceController else { return false }
    return !isInstallingRoot && !isNavigationTransitionInProgress
      && interfaceController.presentedTemplate == nil
      && interfaceController.templates.count == 1
  }

  private func applyCatalogRefreshNow() {
    guard canApplyCatalogRefreshNow() else { return }
    hasPendingCatalogRefresh = false
    if hasUpgradedToTabs {
      updateTabSectionsFromCatalog()
    } else {
      updateExistingRootListFromCatalog()
    }
    emitLifecycleDiagnostic("carplay_catalog_refresh_applied")
  }

  private func applyPendingCatalogRefreshIfSafe() {
    guard hasPendingCatalogRefresh, canApplyCatalogRefreshNow() else { return }
    applyCatalogRefreshNow()
  }

  func presentNowPlayingIfConnected() {
    performOnMain { [weak self] in
      guard let self, self.isConnected, let interfaceController = self.interfaceController else { return }
      let nowPlaying = CPNowPlayingTemplate.shared
      if interfaceController.topTemplate === nowPlaying {
        NSLog("[HTCarPlay] now_playing_opened")
      } else if interfaceController.templates.contains(where: { $0 === nowPlaying }) {
        self.popToTemplateSafely(nowPlaying, operation: "now_playing")
      } else {
        self.pushTemplateSafely(nowPlaying, operation: "now_playing")
      }
    }
  }

  func applyCatalogSnapshot(_ snapshot: [String: Any]) {
    let snapshotData = canonicalCatalogSnapshotData(snapshot)
    if let snapshotData, snapshotData == lastCatalogSnapshotData {
      return
    }
    HiddenAudioCarPlayCatalog.applySnapshot(snapshot)
    lastCatalogSnapshotData = snapshotData
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
      "pendingReplay": !isConnected,
    ])
    if isConnected {
      reloadTemplates()
    } else {
      NSLog("[HTCarPlay] catalog_cached_pending_carplay_connect")
      emitLifecycleDiagnostic(
        "carplay_catalog_cached_pending_connect",
        ["trackCount": trackCount, "sectionCount": sectionCount]
      )
    }
  }

  private func canonicalCatalogSnapshotData(_ snapshot: [String: Any]) -> Data? {
    guard JSONSerialization.isValidJSONObject(snapshot) else { return nil }
    return try? JSONSerialization.data(withJSONObject: snapshot, options: [.sortedKeys])
  }

  // MARK: - Safe fallback root

  private static let maxRootInstallAttempts = 3

  /// Defer tab upgrade so it cannot race a just-completed scene `setRootTemplate`.
  private func scheduleValidatedTabUpgrade(generation: UInt64) {
    NSLog("[HTCarPlay] tab_upgrade_scheduled generation=%llu", generation)
    emitLifecycleDiagnostic("carplay_tab_upgrade_scheduled", ["generation": generation])
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      guard generation == self.activeConnectionGeneration, self.isConnected else {
        NSLog("[HTCarPlay] stale_update_ignored reason=tab_upgrade_schedule_stale")
        return
      }
      guard self.hasInstalledRoot, !self.isInstallingRoot, !self.hasUpgradedToTabs else {
        NSLog("[HTCarPlay] tab_upgrade_skipped already_tabs_or_installing")
        return
      }
      self.tryUpgradeToValidatedTabRoot(generation: generation)
    }
  }

  private func installSafeFallbackRoot(generation: UInt64, attempt: Int = 1) {
    guard let interfaceController else {
      NSLog("[HTCarPlay] root_install_skipped no_interface_controller")
      emitLifecycleDiagnostic("carplay_root_install_skipped", ["reason": "no_interface_controller"])
      return
    }
    guard generation == activeConnectionGeneration, isConnected else {
      NSLog("[HTCarPlay] stale_update_ignored reason=install_stale_generation")
      return
    }
    if hasInstalledRoot || tabBarTemplate != nil {
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
    NSLog(
      "[HTCarPlayNative] root.build.exit generation=%llu rootClass=%@ nonNil=%d itemCount=%d",
      generation,
      String(describing: type(of: list)),
      1,
      itemCount
    )
    NSLog(
      "[HTCarPlayNative] setRootTemplate.enter generation=%llu rootClass=%@ attempt=%d mainThread=%d",
      generation,
      String(describing: type(of: list)),
      attempt,
      Thread.isMainThread ? 1 : 0
    )
    emitLifecycleDiagnostic(
      "carplay_manager_root_install_started",
      ["attempt": attempt, "maxAttempts": Self.maxRootInstallAttempts, "generation": generation]
    )

    interfaceController.setRootTemplate(list, animated: false) { [weak self] success, error in
      guard let self else { return }
      self.isInstallingRoot = false
      guard generation == self.activeConnectionGeneration, self.isConnected else {
        NSLog("[HTCarPlay] stale_update_ignored reason=setRoot_completion")
        return
      }
      let message = error?.localizedDescription ?? ""
      NSLog(
        "[HTCarPlayNative] setRootTemplate.completion generation=%llu success=%d error=%@ attempt=%d mainThread=%d",
        generation,
        success ? 1 : 0,
        message.isEmpty ? "<none>" : message,
        attempt,
        Thread.isMainThread ? 1 : 0
      )
      NSLog("[HTCarPlay] setRootTemplate complete success=%d", success ? 1 : 0)
      NSLog("[HTCarPlay] setRootTemplate success=%d", success ? 1 : 0)
      if success {
        self.hasInstalledRoot = true
        NSLog("[HTCarPlay] root_retained")
        NSLog("[HTCarPlay] root_template_installed")
        self.emitDiagnostic([
          "event": "carplay_root_installed",
          "success": true,
          "message": "",
          "rootType": "CPListTemplate",
          "itemCount": itemCount,
          "attempt": attempt,
        ])
        self.updateExistingRootListFromCatalog()
        self.scheduleValidatedTabUpgrade(generation: generation)
      } else {
        self.hasInstalledRoot = false
        self.rootListTemplate = nil
        NSLog("[HTCarPlay] fallback_restored reason=setRoot_failed")
        self.emitDiagnostic([
          "event": "carplay_root_install_failed",
          "success": false,
          "message": message,
          "rootType": "CPListTemplate",
          "attempt": attempt,
        ])
        if attempt < Self.maxRootInstallAttempts {
          let next = attempt + 1
          NSLog("[HTCarPlay] root_install_retry attempt=%d", next)
          self.emitLifecycleDiagnostic(
            "carplay_manager_root_install_retry",
            ["attempt": next, "maxAttempts": Self.maxRootInstallAttempts]
          )
          self.installSafeFallbackRoot(generation: generation, attempt: next)
        } else {
          NSLog("[HTCarPlay] root_install_exhausted attempts=%d", attempt)
          self.emitLifecycleDiagnostic(
            "carplay_manager_root_install_exhausted",
            ["attempt": attempt, "message": message]
          )
        }
      }
    }
  }

  private func installSafeFallbackRoot(on interfaceController: CPInterfaceController, attempt: Int = 1) {
    let (list, itemCount) = makeVisibleFallbackListTemplate()
    rootListTemplate = list
    tabBarTemplate = nil
    listenTabTemplate = nil
    radioTabTemplate = nil
    libraryTabTemplate = nil
    hasUpgradedToTabs = false
    isInstallingRoot = true
    NSLog("[HTCarPlay] fallback_restored reason=invalid_tabs item_count=%d", itemCount)
    NSLog("[HTCarPlay] setRootTemplate start")
    interfaceController.setRootTemplate(list, animated: false) { [weak self] success, error in
      guard let self else { return }
      self.isInstallingRoot = false
      NSLog(
        "[HTCarPlay] minimal root installed success=%d error=%@",
        success ? 1 : 0,
        String(describing: error)
      )
      if success {
        self.hasInstalledRoot = true
        self.rootListTemplate = list
        NSLog("[HTCarPlay] root_template_installed")
        self.updateExistingRootListFromCatalog()
      } else {
        self.hasInstalledRoot = false
        self.rootListTemplate = nil
        NSLog("[HTCarPlay] fallback_restored reason=setRoot_failed")
        if attempt < Self.maxRootInstallAttempts {
          let next = attempt + 1
          NSLog("[HTCarPlay] root_install_retry attempt=%d", next)
          self.installSafeFallbackRoot(on: interfaceController, attempt: next)
        }
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
        mediaId: "listen",
        title: "Listen",
        subtitle: "Your recent listening will appear here.",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "radio",
        title: "Radio",
        subtitle: "Stations will appear here.",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "library",
        title: "Library",
        subtitle: "Your saved audio will appear here.",
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
    guard !isNavigationTransitionInProgress,
          interfaceController.presentedTemplate == nil,
          interfaceController.templates.count == 1 else {
      NSLog("[HTCarPlay] tab_upgrade_skipped navigation_active")
      emitDiagnostic([
        "event": "carplay_tab_upgrade_skipped",
        "reason": "navigation_active",
      ])
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
        self.installSafeFallbackRoot(on: interfaceController, attempt: 1)
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
    let ordered: [(String, String)] = [
      ("continue_listening", "Continue Listening"),
      ("recently_played", "Recently Played"),
      ("favorites", "Favorites"),
      ("made_for_you", "Recommended"),
      ("recommended_podcasts", "Recommended Podcasts"),
    ]
    var sections = ordered.map { parentId, header in
      CPListSection(
        items: nodesForSection(parentId).map { makeListItem(for: $0, parentId: parentId) },
        header: header,
        sectionIndexTitle: nil
      )
    }
    let actions: [(HiddenAudioCarPlayBrowseNode, String)] = [
      (HiddenAudioCarPlayBrowseNode(mediaId: "now_playing", title: "Now Playing",
        subtitle: "Current session", playable: false), "Now Playing"),
      (HiddenAudioCarPlayBrowseNode(mediaId: "search", title: "Search",
        subtitle: "Find your audio", playable: false), "Search"),
    ]
    sections.append(contentsOf: actions.map { node, header in
      CPListSection(items: [makeListItem(for: node, parentId: "listen_actions")],
        header: header, sectionIndexTitle: nil)
    })
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
    let ordered: [(String, String)] = [
      ("radio_favorites", "Favorite Stations"),
      ("radio_recent", "Recent Stations"),
      ("radio_recommended", "Recommended Stations"),
      ("radio_browse", "Browse Stations"),
    ]
    return ensureNonEmptySections(ordered.map { parentId, header in
      CPListSection(items: nodesForSection(parentId).map {
        makeListItem(for: $0, parentId: parentId)
      }, header: header, sectionIndexTitle: nil)
    }, header: "Radio")
  }

  private func makeLibrarySections() -> [CPListSection] {
    let groups: [(String, String)] = [
      ("artists", "Artists"),
      ("albums", "Albums"),
      ("genres", "Genres"),
      ("playlists", "Playlists"),
      ("podcasts", "Podcasts"),
      ("audiobooks", "Audiobooks"),
      ("music", "Saved Music"),
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
    // Invalidate callbacks for rows replaced by this snapshot before creating
    // the next bounded set of list items.
    listItemMediaIds.removeAll(keepingCapacity: true)
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
      guard let self, self.isConnected, let interfaceController = self.interfaceController else {
        self?.emitDiagnostic(["event": "carplay_navigation_rejected", "reason": "disconnected", "operation": "search"])
        return
      }
      if interfaceController.templates.contains(where: {
        self.templateMediaIds[ObjectIdentifier($0)] == "search"
      }) {
        self.emitDiagnostic(["event": "carplay_navigation_rejected", "reason": "already_visible", "operation": "search"])
        return
      }

      var nodes = HiddenAudioCarPlayCatalog.boundedAudioSearchBrowseNodes()
      if nodes.isEmpty {
        nodes = [HiddenAudioCarPlayBrowseNode(
          mediaId: "empty:search",
          title: HiddenAudioCarPlayCatalog.emptyMessageTitle,
          subtitle: HiddenAudioCarPlayCatalog.emptyMessageSubtitle,
          playable: false
        )]
      }
      let items = nodes.prefix(HiddenAudioCarPlayCatalog.limits.search).map {
        self.makeListItem(for: $0, parentId: "search_results")
      }
      let search = CPListTemplate(
        title: "Search",
        sections: [CPListSection(items: items)]
      )
      self.templateMediaIds[ObjectIdentifier(search)] = "search"
      self.pushTemplateSafely(search, operation: "search", mediaId: "search")
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
    let source = node.artworkUrl.isEmpty
      ? HiddenAudioCarPlayCatalog.track(for: node.mediaId)?.artworkUrl ?? ""
      : node.artworkUrl
    let scale = max(1, interfaceController?.carTraitCollection.displayScale ?? 1)
    let cachedArtwork = HiddenAudioCarPlayArtworkLoader.shared.cachedImage(
      source: source,
      targetPointSize: CPListItem.maximumImageSize,
      displayScale: scale
    )
    let immediateArtwork = cachedArtwork ?? fallbackArtwork(for: node, parentId: parentId)
    let item = CPListItem(
      text: node.title,
      detailText: node.subtitle.isEmpty ? nil : node.subtitle,
      image: immediateArtwork
    )
    let identity = ObjectIdentifier(item)
    listItemMediaIds[identity] = node.mediaId
    let generation = activeConnectionGeneration
    if cachedArtwork == nil, !source.isEmpty, isConnected, interfaceController != nil {
      HiddenAudioCarPlayArtworkLoader.shared.image(
        source: source,
        targetPointSize: CPListItem.maximumImageSize,
        displayScale: scale
      ) { [weak self, weak item] image in
        guard let self, let item, let image, self.isConnected,
          self.activeConnectionGeneration == generation,
          self.listItemMediaIds[ObjectIdentifier(item)] == node.mediaId else { return }
        item.setImage(image)
      }
    }
    item.handler = { [weak self] _, completion in
      self?.handleSelection(node: node, parentId: parentId, completion: completion)
    }
    return item
  }

  private func fallbackArtwork(for node: HiddenAudioCarPlayBrowseNode, parentId: String) -> UIImage? {
    let key = "\(node.contentType) \(node.mediaId) \(parentId)".lowercased()
    let symbol: String
    if key.contains("artist") { symbol = "person.crop.square" }
    else if key.contains("album") { symbol = "square.stack" }
    else if key.contains("playlist") { symbol = "music.note.list" }
    else if key.contains("radio") || key.contains("station") { symbol = "dot.radiowaves.left.and.right" }
    else if key.contains("podcast") || key.contains("episode") { symbol = "mic" }
    else if key.contains("audiobook") || key.contains("book") || key.contains("chapter") { symbol = "book" }
    else if key.contains("empty:") { symbol = "sparkles" }
    else { symbol = "music.note" }
    if let cached = fallbackArtworkCache[symbol] {
      return cached
    }
    let image = (UIImage(systemName: symbol) ?? UIImage(systemName: "music.note"))?
      .withRenderingMode(.alwaysTemplate)
    if let image {
      fallbackArtworkCache[symbol] = image
    }
    return image
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
      presentSearchTemplate()
      return
    }

    if node.playable {
      selectPlayable(mediaId: node.mediaId, parentId: parentId)
      scheduleNowPlayingAfterSelectionCompletion()
      return
    }

    pushChildList(for: node)
  }

  private func pushChildList(for node: HiddenAudioCarPlayBrowseNode) {
    performOnMain { [weak self] in
      guard let self, self.isConnected, self.interfaceController != nil else {
        self?.emitDiagnostic(["event": "carplay_navigation_rejected", "reason": "disconnected", "operation": "child_list"])
        return
      }
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
      let items = children.prefix(HiddenAudioCarPlayCatalog.limits.browseNodes).map {
        self.makeListItem(for: $0, parentId: node.mediaId)
      }
      let template = CPListTemplate(
        title: node.title,
        sections: [CPListSection(items: items)]
      )
      self.templateMediaIds[ObjectIdentifier(template)] = node.mediaId
      self.pushTemplateSafely(template, operation: "child_list", mediaId: node.mediaId)
    }
  }

  @discardableResult
  private func pushTemplateSafely(
    _ template: CPTemplate,
    operation: String,
    mediaId: String? = nil,
    completion: ((Bool) -> Void)? = nil
  ) -> Bool {
    dispatchPrecondition(condition: .onQueue(.main))
    guard isConnected, let interfaceController else {
      emitDiagnostic(["event": "carplay_navigation_rejected", "reason": "disconnected", "operation": operation])
      completion?(false)
      return false
    }
    guard !isNavigationTransitionInProgress else {
      emitDiagnostic(["event": "carplay_navigation_rejected", "reason": "transition_in_progress", "operation": operation])
      completion?(false)
      return false
    }
    if let mediaId, interfaceController.templates.contains(where: {
      templateMediaIds[ObjectIdentifier($0)] == mediaId
    }) {
      emitDiagnostic(["event": "carplay_navigation_rejected", "reason": "logical_template_already_in_stack", "operation": operation])
      completion?(false)
      return false
    }
    guard interfaceController.presentedTemplate == nil else {
      emitDiagnostic(["event": "carplay_navigation_rejected", "reason": "modal_active", "operation": operation])
      completion?(false)
      return false
    }
    guard !interfaceController.templates.contains(where: { $0 === template }) else {
      emitDiagnostic(["event": "carplay_navigation_rejected", "reason": "template_already_in_stack", "operation": operation])
      completion?(false)
      return false
    }
    let generation = activeConnectionGeneration
    let controllerIdentity = ObjectIdentifier(interfaceController)
    let navigationStartedAt = CFAbsoluteTimeGetCurrent()
    isNavigationTransitionInProgress = true
    interfaceController.pushTemplate(template, animated: true) { [weak self] success, error in
      guard let self else {
        completion?(false)
        return
      }
      let isCurrentController = self.interfaceController.map(ObjectIdentifier.init) == controllerIdentity
      let isCurrentGeneration = generation == self.activeConnectionGeneration
      self.isNavigationTransitionInProgress = false
      guard self.isConnected, isCurrentController, isCurrentGeneration else {
        self.emitDiagnostic([
          "event": "carplay_navigation_rejected",
          "reason": "stale_push_completion",
          "operation": operation,
        ])
        completion?(false)
        return
      }
      if success, operation == "now_playing" {
        NSLog("[HTCarPlay] now_playing_opened")
      }
      if let error {
        NSLog("[HTCarPlay] navigation_push_failed operation=%@ success=%d", operation, success ? 1 : 0)
        self.emitDiagnostic([
          "event": "carplay_navigation_push_failed",
          "operation": operation,
          "mediaId": mediaId ?? "",
          "message": error.localizedDescription,
          "success": success,
        ])
      }
      #if DEBUG
      self.emitLifecycleDiagnostic("carplay_navigation_latency", [
        "operation": operation,
        "elapsedMs": Int((CFAbsoluteTimeGetCurrent() - navigationStartedAt) * 1000),
        "stackDepth": interfaceController.templates.count,
      ])
      #endif
      completion?(success && error == nil)
    }
    return true
  }

  private func popToTemplateSafely(_ template: CPTemplate, operation: String) {
    dispatchPrecondition(condition: .onQueue(.main))
    guard isConnected, let interfaceController,
          !isNavigationTransitionInProgress,
          interfaceController.presentedTemplate == nil,
          interfaceController.templates.contains(where: { $0 === template }) else {
      emitDiagnostic(["event": "carplay_navigation_rejected", "reason": "invalid_pop_target_or_transition", "operation": operation])
      return
    }
    let generation = activeConnectionGeneration
    isNavigationTransitionInProgress = true
    interfaceController.pop(to: template, animated: true) { [weak self] success, error in
      guard let self else { return }
      if generation == self.activeConnectionGeneration {
        self.isNavigationTransitionInProgress = false
      }
      if success {
        NSLog("[HTCarPlay] now_playing_opened")
      } else if let error {
        self.emitDiagnostic(["event": "carplay_navigation_pop_failed", "operation": operation, "message": error.localizedDescription])
      }
    }
  }

  private func selectPlayable(mediaId: String, parentId: String) {
    guard HiddenAudioCarPlayCatalog.track(for: mediaId) != nil else {
      emitDiagnostic([
        "event": "carplay_selection_rejected",
        "reason": "not_in_current_catalog",
      ])
      return
    }
    let now = CFAbsoluteTimeGetCurrent()
    guard mediaId != lastSelectionMediaId || now - lastSelectionAt >= 0.75 else {
      emitDiagnostic(["event": "carplay_selection_rejected", "reason": "duplicate_tap"])
      return
    }
    lastSelectionMediaId = mediaId
    lastSelectionAt = now
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
      "parentId": parentId,
      "supportsVideoPlayback": supportsVideoPlaybackCached,
    ])
    playbackHandler?.emitCarPlayMediaSelection(mediaId, parentId: parentId)
  }

  /// Selection completion runs on return from the list/search delegate. Defer
  /// navigation one main-queue turn so CarPlay never receives a push while it
  /// is still completing the selection callback.
  private func scheduleNowPlayingAfterSelectionCompletion() {
    DispatchQueue.main.async { [weak self] in
      self?.presentNowPlayingIfConnected()
    }
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

extension HiddenAudioCarPlayManager: CPInterfaceControllerDelegate {
  func templateDidAppear(_ aTemplate: CPTemplate, animated: Bool) {
    performOnMain { [weak self] in
      self?.applyPendingCatalogRefreshIfSafe()
    }
  }
}
