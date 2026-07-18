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
  let collection: String
  let isLiveStream: Bool

  func asTrackDictionary() -> [String: Any] {
    return [
      "id": id,
      "url": url,
      "title": title,
      "artist": artist,
      "album": album,
      "artworkUrl": artworkUrl,
      "durationSeconds": durationSeconds,
      "collection": collection,
      "isLiveStream": isLiveStream,
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
  static let emptyMessageTitle = "Nothing here yet"
  static let emptyMessageSubtitle = "Hidden Tunes"

  static let limits = (
    recentlyPlayed: 25,
    favorites: 25,
    playlists: 20,
    playlistTracks: 50,
    music: 50,
    radio: 25,
    search: 30,
    browseNodes: 48
  )

  private static var childrenByParent: [String: [HiddenAudioCarPlayBrowseNode]] = [:]
  private static var tracksByMediaId: [String: HiddenAudioCarPlayTrack] = [:]
  private static var orderedPlayableMediaIds: [String] = []
  private static var searchResults: [HiddenAudioCarPlayBrowseNode] = []

  static func clear() {
    childrenByParent = [:]
    tracksByMediaId = [:]
    orderedPlayableMediaIds = []
    searchResults = []
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
        childrenByParent[parentId] = items.isEmpty ? [emptyNode(for: parentId)] : items
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
          durationSeconds: (trackMap["durationSeconds"] as? Double) ?? 0,
          collection: (trackMap["collection"] as? String) ?? "",
          isLiveStream: (trackMap["isLiveStream"] as? Bool) ?? mediaId.hasPrefix("radio:")
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

    ensureSectionFallbacks()
  }

  static func ensureDefaultCatalog() {
    if childrenByParent[rootId] == nil {
      childrenByParent[rootId] = defaultRootNodes()
    }
    ensureSectionFallbacks()
  }

  static func children(for parentId: String) -> [HiddenAudioCarPlayBrowseNode] {
    if parentId == rootId, childrenByParent[rootId] == nil {
      childrenByParent[rootId] = defaultRootNodes()
    }

    if parentId == "search_results" {
      return searchResults.isEmpty ? [emptyNode(for: parentId)] : searchResults
    }

    if parentId == "recently_played" {
      if let cached = childrenByParent["recently_played"], !cached.isEmpty {
        return cached
      }
      let fallback = playableBrowseNodes(limit: limits.recentlyPlayed, excludingLive: true)
      return fallback.isEmpty ? [emptyNode(for: parentId)] : fallback
    }

    let nodes = childrenByParent[parentId] ?? []
    return nodes.isEmpty ? [emptyNode(for: parentId)] : nodes
  }

  static func track(for mediaId: String) -> HiddenAudioCarPlayTrack? {
    tracksByMediaId[mediaId]
  }

  static func firstPlayableMediaId() -> String? {
    orderedPlayableMediaIds.first
  }

  static func updateSearchResults(query: String) -> [HiddenAudioCarPlayBrowseNode] {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if trimmed.isEmpty {
      searchResults = []
      return []
    }

    var matches: [HiddenAudioCarPlayBrowseNode] = []
    for mediaId in orderedPlayableMediaIds {
      guard let track = tracksByMediaId[mediaId] else { continue }
      if track.isLiveStream { continue }
      let haystack = "\(track.title) \(track.artist) \(track.album)".lowercased()
      if haystack.contains(trimmed) {
        matches.append(
          HiddenAudioCarPlayBrowseNode(
            mediaId: track.mediaId,
            title: track.title,
            subtitle: track.artist,
            playable: true
          )
        )
      }
      if matches.count >= limits.search {
        break
      }
    }

    searchResults = matches
    return matches
  }

  static func defaultRootNodes() -> [HiddenAudioCarPlayBrowseNode] {
    [
      HiddenAudioCarPlayBrowseNode(
        mediaId: "now_playing",
        title: "Now Playing",
        subtitle: "Current Hidden Tunes session",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "recently_played",
        title: "Recently Played",
        subtitle: "Pick up where you left off",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "favorites",
        title: "Favorites",
        subtitle: "Your saved music",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "playlists",
        title: "Playlists",
        subtitle: "Collections",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "music",
        title: "Music",
        subtitle: "Recommended for you",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "radio",
        title: "Radio",
        subtitle: "Live stations",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "search",
        title: "Search",
        subtitle: "Find music",
        playable: false
      ),
    ]
  }

  private static func ensureHiddenTunesRoot(
    _ nodes: [HiddenAudioCarPlayBrowseNode]
  ) -> [HiddenAudioCarPlayBrowseNode] {
    let required = defaultRootNodes()
    if nodes.isEmpty {
      return required
    }

    var merged = nodes
    for node in required where !merged.contains(where: { $0.mediaId == node.mediaId }) {
      merged.append(node)
    }

    let order = required.map(\.mediaId)
    merged.sort { lhs, rhs in
      let li = order.firstIndex(of: lhs.mediaId) ?? Int.max
      let ri = order.firstIndex(of: rhs.mediaId) ?? Int.max
      if li != ri { return li < ri }
      return lhs.title < rhs.title
    }
    return merged
  }

  private static func parseBrowseNodes(_ items: [[String: Any]]) -> [HiddenAudioCarPlayBrowseNode] {
    var nodes: [HiddenAudioCarPlayBrowseNode] = []
    for item in items.prefix(limits.browseNodes) {
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

  private static func playableBrowseNodes(
    limit: Int,
    excludingLive: Bool
  ) -> [HiddenAudioCarPlayBrowseNode] {
    orderedPlayableMediaIds.prefix(limit * 2).compactMap { mediaId -> HiddenAudioCarPlayBrowseNode? in
      guard let track = tracksByMediaId[mediaId] else { return nil }
      if excludingLive && track.isLiveStream { return nil }
      return HiddenAudioCarPlayBrowseNode(
        mediaId: track.mediaId,
        title: track.title,
        subtitle: track.artist,
        playable: true
      )
    }
    .prefix(limit)
    .map { $0 }
  }

  private static func ensureSectionFallbacks() {
    let sectionIds = [
      "recently_played",
      "favorites",
      "playlists",
      "music",
      "radio",
    ]

    for sectionId in sectionIds {
      if let existing = childrenByParent[sectionId], !existing.isEmpty {
        continue
      }
      if sectionId == "recently_played" {
        let fallback = playableBrowseNodes(limit: limits.recentlyPlayed, excludingLive: true)
        childrenByParent[sectionId] = fallback.isEmpty ? [emptyNode(for: sectionId)] : fallback
      } else if sectionId == "music" {
        let fallback = playableBrowseNodes(limit: limits.music, excludingLive: true)
        childrenByParent[sectionId] = fallback.isEmpty ? [emptyNode(for: sectionId)] : fallback
      } else {
        childrenByParent[sectionId] = [emptyNode(for: sectionId)]
      }
    }

    if childrenByParent["radio"] == nil {
      childrenByParent["radio"] = defaultRadioNodes()
    } else if childrenByParent["radio"]?.isEmpty == true {
      childrenByParent["radio"] = defaultRadioNodes()
    }
  }

  private static func defaultRadioNodes() -> [HiddenAudioCarPlayBrowseNode] {
    [
      ("radio_recent", "Recently Played Radio", "Stations you opened recently"),
      ("radio_favorites", "Favorites", "Saved stations"),
      ("radio_country", "Country", "Country listening"),
      ("radio_gospel", "Gospel", "Gospel and worship"),
      ("radio_afrobeats", "Afrobeats", "Afrobeats energy"),
      ("radio_jazz", "Jazz", "Jazz stations"),
      ("radio_news", "News", "News and talk"),
      ("radio_global", "Global", "Around the world"),
      ("radio_focus", "Focus", "Focus and study"),
      ("radio_faith", "Faith", "Faith and worship"),
    ].map {
      HiddenAudioCarPlayBrowseNode(
        mediaId: $0.0,
        title: $0.1,
        subtitle: $0.2,
        playable: false
      )
    }
  }

  private static func emptyNode(for parentId: String) -> HiddenAudioCarPlayBrowseNode {
    HiddenAudioCarPlayBrowseNode(
      mediaId: "empty:\(parentId)",
      title: emptyMessageTitle,
      subtitle: emptyMessageSubtitle,
      playable: false
    )
  }
}
