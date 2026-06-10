package com.hiddentunes.app.audio

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import java.util.concurrent.ConcurrentHashMap

object HiddenAudioAutoCatalog {
  const val ROOT_ID = "hidden_tunes_root"
  const val HIDDEN_TUNES_ID = "hidden_tunes"

  data class AutoTrack(
    val mediaId: String,
    val id: String,
    val url: String,
    val title: String,
    val artist: String,
    val album: String,
    val artworkUrl: String,
    val durationSeconds: Double
  )

  data class BrowseNode(
    val mediaId: String,
    val title: String,
    val subtitle: String,
    val playable: Boolean
  )

  private val childrenByParent = ConcurrentHashMap<String, List<BrowseNode>>()
  private val tracksByMediaId = ConcurrentHashMap<String, AutoTrack>()

  fun clear() {
    childrenByParent.clear()
    tracksByMediaId.clear()
  }

  fun applySnapshot(snapshot: ReadableMap) {
    clear()

    val roots = snapshot.getArraySafe("roots")
    if (roots != null) {
      childrenByParent[ROOT_ID] = ensureHiddenTunesRoot(parseBrowseNodes(roots))
    }

    val sections = snapshot.getArraySafe("sections")
    if (sections != null) {
      for (index in 0 until sections.size()) {
        val section = sections.getMap(index) ?: continue
        val parentId = section.getStringSafe("parentId", "")
        val items = section.getArraySafe("items") ?: continue
        if (parentId.isBlank()) continue
        childrenByParent[parentId] = parseBrowseNodes(items)
      }
    }

    val tracks = snapshot.getArraySafe("tracks")
    if (tracks != null) {
      for (index in 0 until tracks.size()) {
        val trackMap = tracks.getMap(index) ?: continue
        val mediaId = trackMap.getStringSafe("mediaId", "")
        val url = trackMap.getStringSafe("url", "")
        if (mediaId.isBlank() || url.isBlank()) continue
        tracksByMediaId[mediaId] = AutoTrack(
          mediaId = mediaId,
          id = trackMap.getStringSafe("id", mediaId),
          url = url,
          title = trackMap.getStringSafe("title", "Hidden Tunes"),
          artist = trackMap.getStringSafe("artist", "Hidden Tunes"),
          album = trackMap.getStringSafe("album", ""),
          artworkUrl = trackMap.getStringSafe("artworkUrl", ""),
          durationSeconds = trackMap.getDoubleSafe("durationSeconds", 0.0)
        )
      }
    }

    if (!childrenByParent.containsKey(ROOT_ID)) {
      childrenByParent[ROOT_ID] = defaultRootNodes()
    }
  }

  fun getChildren(parentId: String): List<BrowseNode> {
    if (parentId == ROOT_ID && !childrenByParent.containsKey(ROOT_ID)) {
      childrenByParent[ROOT_ID] = defaultRootNodes()
    }
    if (parentId == HIDDEN_TUNES_ID) {
      val cached = childrenByParent[HIDDEN_TUNES_ID]
      if (!cached.isNullOrEmpty()) return cached
      return hiddenTunesHomeNodes()
    }
    return childrenByParent[parentId] ?: emptyList()
  }

  fun getRootChildrenForAuto(limit: Int, supportedFlags: Int): List<BrowseNode> {
    val all = getChildren(ROOT_ID)
    val browsableOnly =
      supportedFlags and android.support.v4.media.MediaBrowserCompat.MediaItem.FLAG_BROWSABLE != 0
    val filtered = if (browsableOnly) all.filter { !it.playable } else all
    if (limit <= 0 || limit == Int.MAX_VALUE) return filtered

    val priority = listOf(
      HIDDEN_TUNES_ID,
      "recently_added",
      "artists",
      "albums",
      "genres",
      "playlists"
    )
    val byId = filtered.associateBy { it.mediaId }
    val ordered = priority.mapNotNull { byId[it] }
    val remainder = filtered.filter { entry -> entry.mediaId !in priority }
    return (ordered + remainder).take(limit)
  }

  fun getTrack(mediaId: String): AutoTrack? = tracksByMediaId[mediaId]

  fun trackToWritableMap(track: AutoTrack): WritableMap {
    val map = Arguments.createMap()
    map.putString("id", track.id)
    map.putString("url", track.url)
    map.putString("title", track.title)
    map.putString("artist", track.artist)
    map.putString("album", track.album)
    map.putString("artworkUrl", track.artworkUrl)
    map.putDouble("durationSeconds", track.durationSeconds)
    return map
  }

  private fun defaultRootNodes(): List<BrowseNode> = listOf(
    BrowseNode(HIDDEN_TUNES_ID, "Hidden Tunes", "Your music library", false),
    BrowseNode("recently_added", "Recently Added", "Latest songs", false),
    BrowseNode("artists", "Artists", "Browse by artist", false),
    BrowseNode("albums", "Albums", "Browse by album", false),
    BrowseNode("genres", "Genres", "Browse by genre", false),
    BrowseNode("playlists", "Playlists", "Collections and rooms", false)
  )

  private fun hiddenTunesHomeNodes(): List<BrowseNode> = listOf(
    BrowseNode("recently_added", "Recently Added", "Latest songs", false),
    BrowseNode("artists", "Artists", "Browse by artist", false),
    BrowseNode("albums", "Albums", "Browse by album", false),
    BrowseNode("genres", "Genres", "Browse by genre", false),
    BrowseNode("playlists", "Playlists", "Collections and rooms", false)
  )

  private fun ensureHiddenTunesRoot(nodes: List<BrowseNode>): List<BrowseNode> {
    if (nodes.any { it.mediaId == HIDDEN_TUNES_ID }) return nodes
    return listOf(
      BrowseNode(HIDDEN_TUNES_ID, "Hidden Tunes", "Your music library", false)
    ) + nodes
  }

  private fun parseBrowseNodes(array: ReadableArray): List<BrowseNode> {
    val nodes = mutableListOf<BrowseNode>()
    for (index in 0 until array.size()) {
      val item = array.getMap(index) ?: continue
      val mediaId = item.getStringSafe("mediaId", "")
      if (mediaId.isBlank()) continue
      nodes.add(
        BrowseNode(
          mediaId = mediaId,
          title = item.getStringSafe("title", mediaId),
          subtitle = item.getStringSafe("subtitle", ""),
          playable = item.getBooleanSafe("playable", false)
        )
      )
      if (nodes.size >= 48) break
    }
    return nodes
  }

  private fun ReadableMap.getStringSafe(key: String, fallback: String): String {
    return if (hasKey(key) && !isNull(key)) getString(key) ?: fallback else fallback
  }

  private fun ReadableMap.getDoubleSafe(key: String, fallback: Double): Double {
    return if (hasKey(key) && !isNull(key)) getDouble(key) else fallback
  }

  private fun ReadableMap.getBooleanSafe(key: String, fallback: Boolean): Boolean {
    return if (hasKey(key) && !isNull(key)) getBoolean(key) else fallback
  }

  private fun ReadableMap.getArraySafe(key: String): ReadableArray? {
    return if (hasKey(key) && !isNull(key)) getArray(key) else null
  }
}
