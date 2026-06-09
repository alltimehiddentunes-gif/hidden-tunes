import CarPlay
import MediaPlayer

final class HiddenAudioCarPlayManager: NSObject {
  static let shared = HiddenAudioCarPlayManager()

  private struct RootSection {
    let id: String
    let title: String
    let subtitle: String
  }

  private let rootSections: [RootSection] = [
    RootSection(id: "recently_added", title: "Recently Added", subtitle: "Latest songs"),
    RootSection(id: "artists", title: "Artists", subtitle: "Browse by artist"),
    RootSection(id: "albums", title: "Albums", subtitle: "Browse by album"),
    RootSection(id: "genres", title: "Genres", subtitle: "Browse by genre"),
    RootSection(id: "playlists", title: "Playlists", subtitle: "Collections and rooms"),
  ]

  private var started = false
  private weak var interfaceController: CPInterfaceController?

  func startIfNeeded() {
    guard !started else { return }
    started = true

    let manager = MPPlayableContentManager.shared()
    manager.dataSource = self
    manager.delegate = self
    manager.beginReceivingEndpoints(allowPlayback: true)
  }

  func connect(_ interfaceController: CPInterfaceController) {
    self.interfaceController = interfaceController
    interfaceController.setRootTemplate(buildRootListTemplate(), animated: true, completion: nil)
  }

  func disconnect() {
    interfaceController = nil
  }

  private func buildRootListTemplate() -> CPListTemplate {
    let items = rootSections.map { section -> CPListItem in
      let item = CPListItem(text: section.title, detailText: section.subtitle)
      item.userInfo = ["sectionId": section.id]
      item.handler = { [weak self] _, completion in
        self?.presentSectionPlaceholder(title: section.title)
        completion()
      }
      return item
    }
    return CPListTemplate(title: "Hidden Tunes", sections: [CPListSection(items: items)])
  }

  private func presentSectionPlaceholder(title: String) {
    guard let interfaceController = interfaceController else { return }
    let item = CPListItem(text: "Browse on iPhone", detailText: "Open Hidden Tunes to sync this section")
    item.handler = { _, completion in completion() }
    let template = CPListTemplate(title: title, sections: [CPListSection(items: [item])])
    interfaceController.pushTemplate(template, animated: true, completion: nil)
  }

  private func rootSection(at index: Int) -> RootSection? {
    guard index >= 0, index < rootSections.count else { return nil }
    return rootSections[index]
  }

  private func makeContentItem(for section: RootSection) -> MPContentItem {
    let item = MPContentItem(identifier: section.id)
    item.title = section.title
    item.subtitle = section.subtitle
    item.isContainer = true
    item.isPlayable = false
    return item
  }
}

extension HiddenAudioCarPlayManager: MPPlayableContentDataSource {
  func numberOfChildItems(at indexPath: IndexPath) -> Int {
    if indexPath.count == 0 {
      return rootSections.count
    }
    return 0
  }

  func contentItem(
    at indexPath: IndexPath,
    completionHandler: @escaping (MPContentItem?, Error?) -> Void
  ) {
    guard indexPath.count == 1 else {
      completionHandler(nil, nil)
      return
    }

    guard let section = rootSection(at: indexPath[0]) else {
      completionHandler(nil, nil)
      return
    }

    completionHandler(makeContentItem(for: section), nil)
  }
}

extension HiddenAudioCarPlayManager: MPPlayableContentDelegate {
  func playableContentManager(
    _ contentManager: MPPlayableContentManager,
    initiatePlaybackForContentItem contentItem: MPContentItem,
    completionHandler: @escaping (Error?) -> Void
  ) {
    completionHandler(nil)
  }
}
