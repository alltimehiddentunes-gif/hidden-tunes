import Foundation

struct HiddenAudioCarPlayTrack {
  let mediaId: String
  let id: String
  let url: String
  let title: String
  let artist: String
  let album: String
  let artworkUrl: String
  let durationSeconds: Double

  func asTrackDictionary() -> [String: Any] {
    return [
      "id": id,
      "url": url,
      "title": title,
      "artist": artist,
      "album": album,
      "artworkUrl": artworkUrl,
      "durationSeconds": durationSeconds,
    ]
  }
}

struct HiddenAudioCarPlayBrowseNode {
  let mediaId: String
  let title: String
  let subtitle: String
  let playable: Bool
}

enum HiddenAudioCarPlayCatalog {
  static let rootId = "hidden_tunes_root"

  private static var childrenByParent: [String: [HiddenAudioCarPlayBrowseNode]] = [:]
  private static var tracksByMediaId: [String: HiddenAudioCarPlayTrack] = [:]
  private static var orderedPlayableMediaIds: [String] = []

  static func clear() {
    childrenByParent = [:]
    tracksByMediaId = [:]
    orderedPlayableMediaIds = []
  }

  static func applySnapshot(_ snapshot: [String: Any]) {
    clear()

    if let roots = snapshot["roots"] as? [[String: Any]] {
      childrenByParent[rootId] = ensureHiddenTunesRoot(parseBrowseNodes(roots))
    }

    if let sections = snapshot["sections"] as? [[String: Any]] {
      for section in sections {
        guard let parentId = section["parentId"] as? String, !parentId.isEmpty else { continue }
        let items = parseBrowseNodes(section["items"] as? [[String: Any]] ?? [])
        if !items.isEmpty {
          childrenByParent[parentId] = items
        }
      }
    }

    if let tracks = snapshot["tracks"] as? [[String: Any]] {
      for trackMap in tracks {
        guard
          let mediaId = trackMap["mediaId"] as? String,
          let url = trackMap["url"] as? String,
          !mediaId.isEmpty,
          !url.isEmpty
        else {
          continue
        }

        let track = HiddenAudioCarPlayTrack(
          mediaId: mediaId,
          id: (trackMap["id"] as? String) ?? mediaId,
          url: url,
          title: (trackMap["title"] as? String) ?? "Hidden Tunes",
          artist: (trackMap["artist"] as? String) ?? "Hidden Tunes",
          album: (trackMap["album"] as? String) ?? "",
          artworkUrl: (trackMap["artworkUrl"] as? String) ?? "",
          durationSeconds: (trackMap["durationSeconds"] as? Double) ?? 0
        )
        tracksByMediaId[mediaId] = track
        if !orderedPlayableMediaIds.contains(mediaId) {
          orderedPlayableMediaIds.append(mediaId)
        }
      }
    }

    if childrenByParent[rootId] == nil {
      childrenByParent[rootId] = defaultRootNodes()
    }
    ensureRecentlyAddedFallback()
  }

  static func ensureDefaultCatalog() {
    if childrenByParent[rootId] == nil {
      childrenByParent[rootId] = defaultRootNodes()
    }
    ensureRecentlyAddedFallback()
  }

  static func children(for parentId: String) -> [HiddenAudioCarPlayBrowseNode] {
    if parentId == rootId, childrenByParent[rootId] == nil {
      childrenByParent[rootId] = defaultRootNodes()
    }
    if parentId == "recently_added" {
      if let cached = childrenByParent["recently_added"], !cached.isEmpty {
        return cached
      }
      return playableBrowseNodes(limit: 24)
    }
    return childrenByParent[parentId] ?? []
  }

  static func track(for mediaId: String) -> HiddenAudioCarPlayTrack? {
    tracksByMediaId[mediaId]
  }

  static func firstPlayableMediaId() -> String? {
    orderedPlayableMediaIds.first
  }

  private static func defaultRootNodes() -> [HiddenAudioCarPlayBrowseNode] {
    [
      HiddenAudioCarPlayBrowseNode(
        mediaId: "now_playing",
        title: "Now Playing",
        subtitle: "Current playback",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "recently_added",
        title: "Recently Added",
        subtitle: "Latest songs",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "artists",
        title: "Artists",
        subtitle: "Browse by artist",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "albums",
        title: "Albums",
        subtitle: "Browse by album",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "playlists",
        title: "Playlists",
        subtitle: "Collections and rooms",
        playable: false
      ),
    ]
  }

  private static func ensureHiddenTunesRoot(
    _ nodes: [HiddenAudioCarPlayBrowseNode]
  ) -> [HiddenAudioCarPlayBrowseNode] {
    if nodes.contains(where: { $0.mediaId == "now_playing" }) {
      return nodes
    }
    return [
      HiddenAudioCarPlayBrowseNode(
        mediaId: "now_playing",
        title: "Now Playing",
        subtitle: "Current playback",
        playable: false
      ),
    ] + nodes
  }

  private static func parseBrowseNodes(_ items: [[String: Any]]) -> [HiddenAudioCarPlayBrowseNode] {
    var nodes: [HiddenAudioCarPlayBrowseNode] = []
    for item in items.prefix(48) {
      guard let mediaId = item["mediaId"] as? String, !mediaId.isEmpty else { continue }
      nodes.append(
        HiddenAudioCarPlayBrowseNode(
          mediaId: mediaId,
          title: (item["title"] as? String) ?? mediaId,
          subtitle: (item["subtitle"] as? String) ?? "",
          playable: (item["playable"] as? Bool) ?? false
        )
      )
    }
    return nodes
  }

  private static func playableBrowseNodes(limit: Int) -> [HiddenAudioCarPlayBrowseNode] {
    orderedPlayableMediaIds.prefix(limit).compactMap { mediaId in
      guard let track = tracksByMediaId[mediaId] else { return nil }
      return HiddenAudioCarPlayBrowseNode(
        mediaId: track.mediaId,
        title: track.title,
        subtitle: track.artist,
        playable: true
      )
    }
  }

  private static func ensureRecentlyAddedFallback() {
    if let existing = childrenByParent["recently_added"], !existing.isEmpty {
      return
    }
    let fallback = playableBrowseNodes(limit: 24)
    if !fallback.isEmpty {
      childrenByParent["recently_added"] = fallback
    }
  }
}
