package com.hiddentunes.app.audio

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Bounded Android Auto browse catalog.
 * Roots are always available offline; playable URLs hydrate from JS snapshots
 * and a durable SharedPreferences cache for process-start before RN is ready.
 */
object HiddenAudioAutoCatalog {
  const val ROOT_ID = "hidden_tunes_root"

  const val SECTION_RECENT = "recently_played"
  const val SECTION_FAVORITES = "favorites"
  const val SECTION_MUSIC = "music"
  const val SECTION_RADIO = "radio"
  const val SECTION_PODCASTS = "podcasts"
  const val SECTION_AUDIOBOOKS = "audiobooks"
  const val SECTION_MOTIVATION = "motivationals"
  const val SECTION_LECTURES = "lectures"

  private val UNSUPPORTED_OPTIONAL_SECTIONS = setOf(
    SECTION_AUDIOBOOKS,
    SECTION_MOTIVATION,
    SECTION_LECTURES
  )
  private val OPTIONAL_SECTION_IDS = listOf(
    SECTION_RECENT,
    SECTION_FAVORITES,
    SECTION_RADIO,
    SECTION_PODCASTS
  )

  private const val PREFS_NAME = "hidden_audio_auto_catalog"
  private const val PREFS_KEY = "snapshot_json_v2"
  private const val MAX_CHILDREN = 48
  private const val MAX_TRACKS = 420
  private const val MAX_SEARCH = 24

  data class AutoTrack(
    val mediaId: String,
    val id: String,
    val url: String,
    val title: String,
    val artist: String,
    val album: String,
    val artworkUrl: String,
    val durationSeconds: Double,
    val contentType: String,
    val isLive: Boolean
  )

  data class BrowseNode(
    val mediaId: String,
    val title: String,
    val subtitle: String,
    val playable: Boolean,
    val artworkUrl: String = "",
    val contentType: String = ""
  )

  private val childrenByParent = ConcurrentHashMap<String, List<BrowseNode>>()
  private val tracksByMediaId = ConcurrentHashMap<String, AutoTrack>()
  private val orderedPlayableMediaIds = mutableListOf<String>()
  private var prefs: SharedPreferences? = null
  private var hydratedFromDisk = false

  fun attachContext(context: Context) {
    if (prefs == null) {
      prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }
  }

  fun clear() {
    childrenByParent.clear()
    tracksByMediaId.clear()
    synchronized(orderedPlayableMediaIds) {
      orderedPlayableMediaIds.clear()
    }
  }

  fun applySnapshot(snapshot: ReadableMap): List<String> {
    val before = parentContentSignatures()
    clear()

    val roots = snapshot.getArraySafe("roots")
    if (roots != null) {
      childrenByParent[ROOT_ID] = filterVisibleRoots(parseBrowseNodes(roots))
    }

    val sections = snapshot.getArraySafe("sections")
    if (sections != null) {
      for (index in 0 until sections.size()) {
        val section = sections.getMap(index) ?: continue
        val parentId = section.getStringSafe("parentId", "")
        val items = section.getArraySafe("items") ?: continue
        if (parentId.isBlank()) continue
        // Unsupported domains stay empty — never surface dead roots.
        if (parentId in UNSUPPORTED_OPTIONAL_SECTIONS) {
          childrenByParent[parentId] = emptyList()
          continue
        }
        childrenByParent[parentId] = parseBrowseNodes(items)
      }
    }

    val tracks = snapshot.getArraySafe("tracks")
    synchronized(orderedPlayableMediaIds) {
      orderedPlayableMediaIds.clear()
      if (tracks != null) {
        for (index in 0 until tracks.size()) {
          val trackMap = tracks.getMap(index) ?: continue
          val mediaId = trackMap.getStringSafe("mediaId", "")
          if (mediaId.isBlank()) continue
          val contentType = trackMap.getStringSafe(
            "contentType",
            inferContentType(mediaId)
          ).lowercase()
          if (contentType == "tv" || contentType == "video" || contentType == "sports") continue
          if (contentType in listOf("audiobook", "motivation", "lecture")) continue
          // URL optional — radio/podcast/etc may resolve via JS canonical path.
          val url = trackMap.getStringSafe("url", "")
          val isLive =
            trackMap.getBooleanSafe("isLive", contentType.equals("radio", ignoreCase = true))
          tracksByMediaId[mediaId] = AutoTrack(
            mediaId = mediaId,
            id = trackMap.getStringSafe("id", mediaId),
            url = url,
            title = trackMap.getStringSafe("title", "Hidden Tunes"),
            artist = trackMap.getStringSafe("artist", "Hidden Tunes"),
            album = trackMap.getStringSafe("album", ""),
            artworkUrl = trackMap.getStringSafe("artworkUrl", ""),
            durationSeconds = if (isLive) 0.0 else trackMap.getDoubleSafe("durationSeconds", 0.0),
            contentType = contentType,
            isLive = isLive
          )
          if (!orderedPlayableMediaIds.contains(mediaId)) {
            orderedPlayableMediaIds.add(mediaId)
          }
          if (orderedPlayableMediaIds.size >= MAX_TRACKS) break
        }
      }
    }

    ensureSectionFallbacks()
    childrenByParent[ROOT_ID] = buildVisibleRootNodes(
      childrenByParent[ROOT_ID] ?: emptyList()
    )
    persistToDisk()

    val after = parentContentSignatures()
    val changed = linkedSetOf<String>()
    for ((parentId, signature) in after) {
      if (before[parentId] != signature) changed.add(parentId)
    }
    for (parentId in before.keys) {
      if (!after.containsKey(parentId)) changed.add(parentId)
    }
    // Root always notified when any top-level membership changed.
    if (changed.any { it != ROOT_ID && it in OPTIONAL_SECTION_IDS + listOf(SECTION_MUSIC) }) {
      changed.add(ROOT_ID)
    }
    return changed.toList()
  }

  fun ensureDefaultCatalog() {
    restoreFromDiskIfNeeded()
    if (!childrenByParent.containsKey(ROOT_ID)) {
      childrenByParent[ROOT_ID] = defaultRootNodes()
    }
    ensureSectionFallbacks()
    childrenByParent[ROOT_ID] = buildVisibleRootNodes(
      childrenByParent[ROOT_ID] ?: defaultRootNodes()
    )
  }

  fun getChildren(parentId: String): List<BrowseNode> {
    ensureDefaultCatalog()
    if (parentId == ROOT_ID) {
      return childrenByParent[ROOT_ID] ?: defaultRootNodes()
    }
    if (parentId in UNSUPPORTED_OPTIONAL_SECTIONS) {
      return emptyList()
    }
    val cached = childrenByParent[parentId]
    if (cached != null) {
      // Empty list is a real bounded response — do not invent fake children.
      return cached
    }
    return when (parentId) {
      SECTION_MUSIC -> musicHomeNodes()
      SECTION_RECENT,
      SECTION_FAVORITES,
      SECTION_RADIO,
      SECTION_PODCASTS -> emptyList()
      else -> emptyList()
    }
  }

  fun getRootChildrenForAuto(limit: Int, supportedFlags: Int): List<BrowseNode> {
    ensureDefaultCatalog()
    val all = childrenByParent[ROOT_ID] ?: defaultRootNodes()
    val browsableOnly =
      supportedFlags and MediaBrowserCompat.MediaItem.FLAG_BROWSABLE != 0 &&
        supportedFlags and MediaBrowserCompat.MediaItem.FLAG_PLAYABLE == 0
    val filtered = if (browsableOnly) all.filter { !it.playable } else all
    if (limit <= 0 || limit == Int.MAX_VALUE) return filtered
    return filtered.take(limit)
  }

  fun search(query: String, limit: Int = MAX_SEARCH): List<BrowseNode> {
    ensureDefaultCatalog()
    val needle = query.trim().lowercase()
    if (needle.isEmpty()) return emptyList()
    val matches = mutableListOf<BrowseNode>()
    for (track in tracksByMediaId.values) {
      val hay = listOf(track.title, track.artist, track.album, track.contentType)
        .joinToString(" ")
        .lowercase()
      if (!hay.contains(needle)) continue
      matches.add(
        BrowseNode(
          mediaId = track.mediaId,
          title = track.title,
          subtitle = track.artist,
          playable = true,
          artworkUrl = track.artworkUrl,
          contentType = track.contentType
        )
      )
      if (matches.size >= limit) break
    }
    if (matches.isNotEmpty()) return matches

    // Fall back to browse node titles (folders / favorites without track payloads).
    for (nodes in childrenByParent.values) {
      for (node in nodes) {
        if (!node.playable) continue
        val hay = "${node.title} ${node.subtitle}".lowercase()
        if (!hay.contains(needle)) continue
        matches.add(node)
        if (matches.size >= limit) return matches
      }
    }
    return matches
  }

  fun firstPlayableMediaId(): String? = orderedPlayableMediaIdsSnapshot().firstOrNull()

  fun nextPlayableMediaId(currentMediaId: String?): String? {
    val ordered = orderedPlayableMediaIdsSnapshot()
    if (ordered.isEmpty()) return null
    if (currentMediaId.isNullOrBlank()) return ordered.first()
    val index = ordered.indexOf(currentMediaId)
    if (index < 0) return ordered.first()
    return if (index + 1 < ordered.size) ordered[index + 1] else null
  }

  fun previousPlayableMediaId(currentMediaId: String?): String? {
    val ordered = orderedPlayableMediaIdsSnapshot()
    if (ordered.isEmpty()) return null
    if (currentMediaId.isNullOrBlank()) return ordered.first()
    val index = ordered.indexOf(currentMediaId)
    if (index < 0) return ordered.first()
    return if (index > 0) ordered[index - 1] else null
  }

  fun findMediaIdByUrl(url: String): String? {
    val cleanUrl = url.trim()
    if (cleanUrl.isBlank()) return null
    return tracksByMediaId.values.firstOrNull { it.url == cleanUrl }?.mediaId
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
    map.putString("contentType", track.contentType)
    map.putBoolean("isLive", track.isLive)
    map.putString("mediaId", track.mediaId)
    return map
  }

  fun toMediaItem(node: BrowseNode): MediaBrowserCompat.MediaItem {
    val track = if (node.playable) getTrack(node.mediaId) else null
    val descriptionBuilder = MediaDescriptionCompat.Builder().setMediaId(node.mediaId)
    if (track != null) {
      descriptionBuilder
        .setTitle(track.title)
        .setSubtitle(track.artist)
        .setDescription(track.album.ifBlank { node.subtitle })
      val art = track.artworkUrl.ifBlank { node.artworkUrl }
      if (art.isNotBlank()) {
        descriptionBuilder.setIconUri(Uri.parse(art))
      }
    } else {
      descriptionBuilder
        .setTitle(node.title)
        .setSubtitle(node.subtitle)
      if (node.artworkUrl.isNotBlank()) {
        descriptionBuilder.setIconUri(Uri.parse(node.artworkUrl))
      }
    }
    val flags =
      if (node.playable) {
        MediaBrowserCompat.MediaItem.FLAG_PLAYABLE
      } else {
        MediaBrowserCompat.MediaItem.FLAG_BROWSABLE
      }
    return MediaBrowserCompat.MediaItem(descriptionBuilder.build(), flags)
  }

  private fun orderedPlayableMediaIdsSnapshot(): List<String> =
    synchronized(orderedPlayableMediaIds) { orderedPlayableMediaIds.toList() }

  private fun ensureSectionFallbacks() {
    if (!childrenByParent.containsKey(SECTION_MUSIC) ||
      childrenByParent[SECTION_MUSIC].isNullOrEmpty()
    ) {
      childrenByParent[SECTION_MUSIC] = musicHomeNodes()
    }
    // Do not invent fake empty caches for other sections — leave empty until JS sync.
    for (unsupported in UNSUPPORTED_OPTIONAL_SECTIONS) {
      childrenByParent[unsupported] = emptyList()
    }
  }

  /** Always-available Music root. Optional domains only when they have playable children. */
  private fun defaultRootNodes(): List<BrowseNode> = listOf(
    BrowseNode(SECTION_MUSIC, "Music", "Songs and collections", false, contentType = "music")
  )

  private fun candidateRootNodes(): List<BrowseNode> = listOf(
    BrowseNode(SECTION_RECENT, "Recently Played", "Continue listening", false, contentType = "recent"),
    BrowseNode(SECTION_FAVORITES, "Favorites", "Saved audio", false, contentType = "favorites"),
    BrowseNode(SECTION_MUSIC, "Music", "Songs and collections", false, contentType = "music"),
    BrowseNode(SECTION_RADIO, "Radio", "Live stations", false, contentType = "radio"),
    BrowseNode(SECTION_PODCASTS, "Podcasts", "Episodes", false, contentType = "podcast")
  )

  private fun musicHomeNodes(): List<BrowseNode> = listOf(
    BrowseNode("recently_added", "Recently Added", "Latest songs", false, contentType = "music"),
    BrowseNode("artists", "Artists", "Browse by artist", false, contentType = "music"),
    BrowseNode("albums", "Albums", "Browse by album", false, contentType = "music"),
    BrowseNode("genres", "Genres", "Browse by genre", false, contentType = "music"),
    BrowseNode("playlists", "Playlists", "Collections", false, contentType = "music")
  )

  private fun filterVisibleRoots(nodes: List<BrowseNode>): List<BrowseNode> {
    val byId = nodes.associateBy { it.mediaId }.toMutableMap()
    // Drop unsupported domains even if JS still sends them.
    for (unsupported in UNSUPPORTED_OPTIONAL_SECTIONS) {
      byId.remove(unsupported)
    }
    return buildVisibleRootNodes(byId.values.toList())
  }

  private fun buildVisibleRootNodes(preferred: List<BrowseNode>): List<BrowseNode> {
    val byId = preferred.associateBy { it.mediaId }.toMutableMap()
    for (candidate in candidateRootNodes()) {
      if (!byId.containsKey(candidate.mediaId)) {
        byId[candidate.mediaId] = candidate
      }
    }
    val visible = mutableListOf<BrowseNode>()
    for (candidate in candidateRootNodes()) {
      val node = byId[candidate.mediaId] ?: continue
      if (node.mediaId in UNSUPPORTED_OPTIONAL_SECTIONS) continue
      if (node.mediaId == SECTION_MUSIC) {
        visible.add(node)
        continue
      }
      if (sectionHasPlayableOrBrowseChildren(node.mediaId)) {
        visible.add(node)
      }
    }
    if (visible.none { it.mediaId == SECTION_MUSIC }) {
      visible.add(
        0,
        BrowseNode(SECTION_MUSIC, "Music", "Songs and collections", false, contentType = "music")
      )
    }
    return visible
  }

  private fun sectionHasPlayableOrBrowseChildren(sectionId: String): Boolean {
    val children = childrenByParent[sectionId] ?: return false
    if (children.isEmpty()) return false
    // Prefer at least one playable leaf; otherwise allow non-empty browsable folder only for music.
    return children.any { it.playable } ||
      (sectionId == SECTION_MUSIC && children.isNotEmpty())
  }

  private fun parentContentSignatures(): Map<String, String> {
    val signatures = linkedMapOf<String, String>()
    for ((parentId, nodes) in childrenByParent) {
      signatures[parentId] = nodes.joinToString("|") { "${it.mediaId}:${it.playable}" }
    }
    synchronized(orderedPlayableMediaIds) {
      signatures["__tracks__"] =
        orderedPlayableMediaIds.take(32).joinToString(",") + "#${orderedPlayableMediaIds.size}"
    }
    return signatures
  }

  private fun inferContentType(mediaId: String): String {
    val id = mediaId.lowercase()
    return when {
      id.startsWith("radio:") || id.startsWith("fav:radio:") -> "radio"
      id.startsWith("podcast:") || id.startsWith("episode:") -> "podcast"
      id.startsWith("audiobook:") -> "audiobook"
      id.startsWith("motivation:") -> "motivation"
      id.startsWith("lecture:") || id.startsWith("edu:") -> "lecture"
      id.startsWith("song:") || id.startsWith("fav:song:") -> "music"
      else -> "music"
    }
  }

  private fun parseBrowseNodes(array: ReadableArray): List<BrowseNode> {
    val nodes = mutableListOf<BrowseNode>()
    for (index in 0 until array.size()) {
      val item = array.getMap(index) ?: continue
      val mediaId = item.getStringSafe("mediaId", "")
      if (mediaId.isBlank()) continue
      // Never expose TV/video content types in Android Auto.
      val contentType = item.getStringSafe("contentType", inferContentType(mediaId)).lowercase()
      if (contentType == "tv" || contentType == "video" || contentType == "sports") continue
      nodes.add(
        BrowseNode(
          mediaId = mediaId,
          title = item.getStringSafe("title", mediaId),
          subtitle = item.getStringSafe("subtitle", ""),
          playable = item.getBooleanSafe("playable", false),
          artworkUrl = item.getStringSafe("artworkUrl", ""),
          contentType = contentType
        )
      )
      if (nodes.size >= MAX_CHILDREN) break
    }
    return nodes
  }

  private fun persistToDisk() {
    val store = prefs ?: return
    try {
      val root = JSONObject()
      val roots = JSONArray()
      for (node in childrenByParent[ROOT_ID] ?: defaultRootNodes()) {
        roots.put(nodeToJson(node))
      }
      root.put("roots", roots)

      val sections = JSONArray()
      for ((parentId, nodes) in childrenByParent) {
        if (parentId == ROOT_ID) continue
        val section = JSONObject()
        section.put("parentId", parentId)
        val items = JSONArray()
        for (node in nodes) items.put(nodeToJson(node))
        section.put("items", items)
        sections.put(section)
      }
      root.put("sections", sections)

      val tracks = JSONArray()
      for (mediaId in orderedPlayableMediaIdsSnapshot().take(MAX_TRACKS)) {
        val track = tracksByMediaId[mediaId] ?: continue
        tracks.put(
          JSONObject()
            .put("mediaId", track.mediaId)
            .put("id", track.id)
            .put("url", track.url)
            .put("title", track.title)
            .put("artist", track.artist)
            .put("album", track.album)
            .put("artworkUrl", track.artworkUrl)
            .put("durationSeconds", track.durationSeconds)
            .put("contentType", track.contentType)
            .put("isLive", track.isLive)
        )
      }
      root.put("tracks", tracks)
      store.edit().putString(PREFS_KEY, root.toString()).apply()
    } catch (_: Throwable) {
      // Persistence is best-effort; never crash browse.
    }
  }

  private fun restoreFromDiskIfNeeded() {
    if (hydratedFromDisk) return
    hydratedFromDisk = true
    val raw = prefs?.getString(PREFS_KEY, null) ?: return
    if (raw.isBlank()) return
    if (childrenByParent.containsKey(ROOT_ID) && tracksByMediaId.isNotEmpty()) return
    try {
      val root = JSONObject(raw)
      val rootsArr = root.optJSONArray("roots")
      if (rootsArr != null) {
        childrenByParent[ROOT_ID] = filterVisibleRoots(jsonNodes(rootsArr))
      }
      val sectionsArr = root.optJSONArray("sections")
      if (sectionsArr != null) {
        for (i in 0 until sectionsArr.length()) {
          val section = sectionsArr.optJSONObject(i) ?: continue
          val parentId = section.optString("parentId", "")
          if (parentId.isBlank()) continue
          childrenByParent[parentId] = jsonNodes(section.optJSONArray("items"))
        }
      }
      val tracksArr = root.optJSONArray("tracks")
      synchronized(orderedPlayableMediaIds) {
        orderedPlayableMediaIds.clear()
        if (tracksArr != null) {
          for (i in 0 until tracksArr.length()) {
            val t = tracksArr.optJSONObject(i) ?: continue
            val mediaId = t.optString("mediaId", "")
            if (mediaId.isBlank()) continue
            val contentType = t.optString("contentType", inferContentType(mediaId))
            val isLive = t.optBoolean("isLive", contentType.equals("radio", ignoreCase = true))
            tracksByMediaId[mediaId] = AutoTrack(
              mediaId = mediaId,
              id = t.optString("id", mediaId),
              url = t.optString("url", ""),
              title = t.optString("title", "Hidden Tunes"),
              artist = t.optString("artist", "Hidden Tunes"),
              album = t.optString("album", ""),
              artworkUrl = t.optString("artworkUrl", ""),
              durationSeconds = if (isLive) 0.0 else t.optDouble("durationSeconds", 0.0),
              contentType = contentType,
              isLive = isLive
            )
            orderedPlayableMediaIds.add(mediaId)
          }
        }
      }
    } catch (_: Throwable) {
      // Corrupt cache — fall back to defaults.
    }
    ensureSectionFallbacks()
    childrenByParent[ROOT_ID] = buildVisibleRootNodes(
      childrenByParent[ROOT_ID] ?: defaultRootNodes()
    )
  }

  private fun nodeToJson(node: BrowseNode): JSONObject =
    JSONObject()
      .put("mediaId", node.mediaId)
      .put("title", node.title)
      .put("subtitle", node.subtitle)
      .put("playable", node.playable)
      .put("artworkUrl", node.artworkUrl)
      .put("contentType", node.contentType)

  private fun jsonNodes(array: JSONArray?): List<BrowseNode> {
    if (array == null) return emptyList()
    val nodes = mutableListOf<BrowseNode>()
    for (i in 0 until array.length()) {
      val item = array.optJSONObject(i) ?: continue
      val mediaId = item.optString("mediaId", "")
      if (mediaId.isBlank()) continue
      nodes.add(
        BrowseNode(
          mediaId = mediaId,
          title = item.optString("title", mediaId),
          subtitle = item.optString("subtitle", ""),
          playable = item.optBoolean("playable", false),
          artworkUrl = item.optString("artworkUrl", ""),
          contentType = item.optString("contentType", "")
        )
      )
      if (nodes.size >= MAX_CHILDREN) break
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
