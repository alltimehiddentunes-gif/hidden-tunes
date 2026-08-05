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
  var artworkUrl: String = ""
  var contentType: String = ""
}

enum HiddenAudioCarPlayCatalog {
  static let rootId = "hidden_tunes_root"
  static let emptyMessageTitle = "No matching audio found."
  static let emptyMessageSubtitle = ""

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
      for trackMap in tracks.prefix(80) {
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

    // Favorites always go through sanitization so empty/malformed catalog
    // data can never produce a blank or invalid Listen-tab section.
    if parentId == "favorites" {
      return sanitizedFavoritesNodes()
    }

    if parentId == "recently_played" {
      if let cached = childrenByParent["recently_played"], !cached.isEmpty {
        return cached
      }
      return [emptyNode(for: parentId)]
    }

    if parentId == "made_for_you" {
      if let cached = childrenByParent["made_for_you"], !cached.isEmpty {
        return cached
      }
      return [emptyNode(for: parentId)]
    }

    let nodes = childrenByParent[parentId] ?? []
    return nodes.isEmpty ? [emptyNode(for: parentId)] : nodes
  }

  /// Favorites helper used by CarPlay Listen tab sections.
  ///
  /// Defect this closes: an empty or malformed favorites catalog previously
  /// fell through to a generic empty placeholder (or an empty item array),
  /// which could leave the Listen tab without a safe Favorites section and
  /// contribute to an invalid root hierarchy reaching `CPTabBarTemplate`.
  ///
  /// Contract:
  /// - never returns an empty array
  /// - ignores malformed rows (blank mediaId/title, empty: stubs)
  /// - deduplicates by mediaId
  /// - never requires artwork
  /// - empty catalog yields exactly one "No favorites yet" row
  static func sanitizedFavoritesNodes(
    from rawNodes: [HiddenAudioCarPlayBrowseNode]? = nil
  ) -> [HiddenAudioCarPlayBrowseNode] {
    let source = rawNodes ?? (childrenByParent["favorites"] ?? [])
    var seen = Set<String>()
    var sanitized: [HiddenAudioCarPlayBrowseNode] = []

    for node in source {
      let mediaId = node.mediaId.trimmingCharacters(in: .whitespacesAndNewlines)
      let title = node.title.trimmingCharacters(in: .whitespacesAndNewlines)

      if mediaId.isEmpty || title.isEmpty {
        continue
      }
      if mediaId.hasPrefix("empty:") {
        continue
      }
      if !seen.insert(mediaId).inserted {
        continue
      }

      sanitized.append(
        HiddenAudioCarPlayBrowseNode(
          mediaId: mediaId,
          title: title,
          subtitle: node.subtitle,
          playable: node.playable
        )
      )

      if sanitized.count >= limits.favorites {
        break
      }
    }

    if sanitized.isEmpty {
      return [emptyFavoritesNode()]
    }
    return sanitized
  }

  static func emptyFavoritesNode() -> HiddenAudioCarPlayBrowseNode {
    HiddenAudioCarPlayBrowseNode(
      mediaId: "empty:favorites",
      title: "Favorite music will appear here.",
      subtitle: "",
      playable: false
    )
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
      let haystack = "\(track.title) \(track.artist) \(track.album) \(track.collection)".lowercased()
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
        mediaId: "listen",
        title: "Listen",
        subtitle: "Your listening",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "radio",
        title: "Radio",
        subtitle: "Live stations",
        playable: false
      ),
      HiddenAudioCarPlayBrowseNode(
        mediaId: "library",
        title: "Library",
        subtitle: "Music, podcasts, and books",
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
          playable: (item["playable"] as? Bool) ?? false,
          artworkUrl: (item["artworkUrl"] as? String) ?? "",
          contentType: (item["contentType"] as? String) ?? ""
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
        playable: true,
        artworkUrl: track.artworkUrl,
        contentType: track.isLiveStream ? "radio" : "music"
      )
    }
    .prefix(limit)
    .map { $0 }
  }

  private static func ensureSectionFallbacks() {
    let sectionIds = [
      "recently_played",
      "continue_listening",
      "favorites",
      "made_for_you",
      "recommended_podcasts",
      "playlists",
      "music",
      "radio",
      "radio_favorites",
      "radio_recent",
      "radio_recommended",
      "radio_browse",
      "radio_country",
      "radio_genre",
      "radio_popular",
      "radio_recently_added",
      "podcasts",
      "podcast_saved",
      "podcast_recent",
      "audiobooks",
      "motivationals",
      "lectures",
      "videos",
    ]

    for sectionId in sectionIds {
      if let existing = childrenByParent[sectionId], !existing.isEmpty {
        continue
      }
      if sectionId == "recently_played" {
        let fallback = playableBrowseNodes(limit: limits.recentlyPlayed, excludingLive: true)
        childrenByParent[sectionId] = fallback.isEmpty ? [emptyNode(for: sectionId)] : fallback
      } else if sectionId == "made_for_you" || sectionId == "music" {
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
    let messages: [String: String] = [
      "continue_listening": "Your unfinished listening will appear here.",
      "recently_played": "Your recent listening will appear here.",
      "favorites": "Favorite music will appear here.",
      "made_for_you": "Recommendations will appear as you listen.",
      "recommended_podcasts": "Podcast recommendations will appear as you listen.",
      "radio_favorites": "Favorite stations will appear here.",
      "radio_recent": "Your recent stations will appear here.",
      "radio_recommended": "Station recommendations will appear as you listen.",
      "radio_browse": "Stations will appear here.",
      "radio_country": "Stations by country will appear here.",
      "radio_genre": "Stations by genre will appear here.",
      "radio_popular": "Popular stations will appear here.",
      "radio_recently_added": "Recently added stations will appear here.",
      "podcasts": "Your podcast shows will appear here.",
      "podcast_saved": "Saved episodes will appear here.",
      "audiobooks": "Your audiobooks will appear here.",
    ]
    return HiddenAudioCarPlayBrowseNode(
      mediaId: "empty:\(parentId)",
      title: messages[parentId] ?? "Audio will appear here.",
      subtitle: "",
      playable: false
    )
  }
}
