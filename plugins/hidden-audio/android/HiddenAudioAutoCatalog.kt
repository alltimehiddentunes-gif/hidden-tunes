package com.hiddentunes.app.audio

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.os.SystemClock
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
  const val ROOT_LISTEN = "listen"
  const val ROOT_RADIO = "radio"
  const val ROOT_LIBRARY = "library"

  const val SECTION_RECENT = "recently_played"
  const val SECTION_FAVORITES = "favorites"
  const val SECTION_MUSIC = "music"
  const val SECTION_RADIO = "radio"
  const val SECTION_PODCASTS = "podcasts"
  const val SECTION_AUDIOBOOKS = "audiobooks"
  const val SECTION_MOTIVATION = "motivationals"
  const val SECTION_LECTURES = "lectures"

  private val UNSUPPORTED_OPTIONAL_SECTIONS = setOf(
    SECTION_MOTIVATION,
    SECTION_LECTURES
  )
  private val OPTIONAL_SECTION_IDS = listOf(
    ROOT_LISTEN,
    ROOT_RADIO,
    ROOT_LIBRARY
  )

  private const val PREFS_NAME = "hidden_audio_auto_catalog"
  private const val PREFS_KEY = "snapshot_json_v3"
  private const val SNAPSHOT_SCHEMA_VERSION = 3
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
    val isLive: Boolean,
    val parentId: String = "",
    val canonicalId: String = "",
    val isMature: Boolean = false,
    val showId: String = "",
    val episodeId: String = "",
    val bookId: String = "",
    val chapterId: String = "",
    val resumePositionMillis: Double = 0.0,
    val collection: String = ""
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
  private var activeProfileNamespace = "anonymous"
  private var snapshotSignature = ""
  private var snapshotGeneratedAt = 0L
  private var matureAllowed = false
  private var maturePodcastAllowed = false

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
    val parseStartedAt = SystemClock.elapsedRealtime()
    val before = parentContentSignatures()
    val schemaVersion = snapshot.getDoubleSafe("schemaVersion", 0.0).toInt()
    val profileNamespace = snapshot.getStringSafe("profileNamespace", "")
    if (schemaVersion != SNAPSHOT_SCHEMA_VERSION || profileNamespace.isBlank()) {
      clear()
      prefs?.edit()?.remove(PREFS_KEY)?.apply()
      return (before.keys + ROOT_ID).distinct()
    }
    clear()
    activeProfileNamespace = profileNamespace
    snapshotSignature = snapshot.getStringSafe("signature", "")
    snapshotGeneratedAt = snapshot.getDoubleSafe("generatedAt", 0.0).toLong()
    matureAllowed = snapshot.getBooleanSafe("matureAllowed", false)
    maturePodcastAllowed = snapshot.getBooleanSafe("maturePodcastAllowed", false)

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
          if (contentType in listOf("motivation", "lecture")) continue
          // URL optional — radio/podcast/etc may resolve via JS canonical path.
          val url = trackMap.getStringSafe("url", "")
          val isLive =
            trackMap.getBooleanSafe("isLive", contentType.equals("radio", ignoreCase = true))
          val isMature = trackMap.getBooleanSafe("isMature", false)
          if (isMature && !isMatureDomainAllowed(contentType)) continue
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
            isLive = isLive,
            parentId = trackMap.getStringSafe("parentId", ""),
            canonicalId = trackMap.getStringSafe("canonicalId", trackMap.getStringSafe("id", mediaId)),
            isMature = isMature,
            showId = trackMap.getStringSafe("showId", ""),
            episodeId = trackMap.getStringSafe("episodeId", ""),
            bookId = trackMap.getStringSafe("bookId", ""),
            chapterId = trackMap.getStringSafe("chapterId", ""),
            resumePositionMillis = trackMap.getDoubleSafe("resumePositionMillis", 0.0),
            collection = trackMap.getStringSafe("collection", "")
          )
          if (!orderedPlayableMediaIds.contains(mediaId)) {
            orderedPlayableMediaIds.add(mediaId)
          }
          if (orderedPlayableMediaIds.size >= MAX_TRACKS) break
        }
      }
    }

    // Browse nodes are never trusted independently of the bounded, policy-
    // checked registry. This removes mature stale leaves and any item trimmed
    // by the registry cap before the host can select it.
    filterUnregisteredPlayableNodes()

    ensureSectionFallbacks()
    childrenByParent[ROOT_ID] = buildVisibleRootNodes(
      childrenByParent[ROOT_ID] ?: emptyList()
    )
    persistToDisk()
    HiddenAudioCore.emitAutoPerformanceDiagnostic("android_auto_snapshot_metrics", Arguments.createMap().apply {
      putInt("registryItemCount", tracksByMediaId.size)
      putInt("folderCount", childrenByParent.size)
      putInt("artworkUriCount", tracksByMediaId.values.count { it.artworkUrl.isNotBlank() })
      putDouble("parseElapsedMs", (SystemClock.elapsedRealtime() - parseStartedAt).toDouble())
    })

    val after = parentContentSignatures()
    val changed = linkedSetOf<String>()
    for ((parentId, signature) in after) {
      if (before[parentId] != signature) changed.add(parentId)
    }
    for (parentId in before.keys) {
      if (!after.containsKey(parentId)) changed.add(parentId)
    }
    // Root always notified when any top-level membership changed.
    if (changed.any { it != ROOT_ID && it in OPTIONAL_SECTION_IDS }) {
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
    val seenMediaIds = linkedSetOf<String>()
    val seenCanonicalIds = linkedSetOf<String>()
    // Exact collection/show/book folders lead so Play From Search preserves
    // the requested domain queue instead of falling back to a generic song.
    for (parentId in childrenByParent.keys.sorted()) {
      val nodes = childrenByParent[parentId] ?: continue
      for (node in nodes) {
        if (node.playable || node.mediaId.startsWith("empty:")) continue
        val hay = "${node.title} ${node.subtitle}".lowercase()
        if (!hay.contains(needle) || !seenMediaIds.add(node.mediaId)) continue
        matches.add(node)
        if (matches.size >= limit) return matches
      }
    }
    for (mediaId in orderedPlayableMediaIdsSnapshot()) {
      val track = tracksByMediaId[mediaId] ?: continue
      val hay = listOf(track.title, track.artist, track.album, track.contentType, track.collection)
        .joinToString(" ")
        .lowercase()
      if (!hay.contains(needle)) continue
      val canonicalId = track.canonicalId.ifBlank { track.id }
      if (!seenCanonicalIds.add("${track.contentType}:$canonicalId")) continue
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
      seenMediaIds.add(track.mediaId)
      if (matches.size >= limit) break
    }
    return matches
  }

  fun firstPlayableDescendant(parentId: String, maxDepth: Int = 4): String? {
    var frontier = listOf(parentId)
    val visited = linkedSetOf<String>()
    repeat(maxDepth.coerceIn(1, 4)) {
      val next = mutableListOf<String>()
      for (current in frontier) {
        if (!visited.add(current)) continue
        for (node in childrenByParent[current] ?: emptyList()) {
          if (node.playable && tracksByMediaId.containsKey(node.mediaId)) return node.mediaId
          if (!node.playable && !node.mediaId.startsWith("empty:")) next.add(node.mediaId)
        }
      }
      frontier = next
      if (frontier.isEmpty()) return null
    }
    return null
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

  fun getTrack(mediaId: String): AutoTrack? = tracksByMediaId[mediaId]?.takeIf {
    !it.isMature || isMatureDomainAllowed(it.contentType)
  }

  private fun isMatureDomainAllowed(contentType: String): Boolean =
    if (contentType.equals("podcast", ignoreCase = true)) maturePodcastAllowed else matureAllowed

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
    map.putString("parentId", track.parentId)
    map.putString("canonicalId", track.canonicalId)
    map.putBoolean("isMature", track.isMature)
    map.putString("showId", track.showId)
    map.putString("episodeId", track.episodeId)
    map.putString("bookId", track.bookId)
    map.putString("chapterId", track.chapterId)
    map.putDouble("resumePositionMillis", track.resumePositionMillis)
    map.putString("collection", track.collection)
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
      if (node.mediaId.startsWith("empty:")) {
        0
      } else if (node.playable) {
        MediaBrowserCompat.MediaItem.FLAG_PLAYABLE
      } else {
        MediaBrowserCompat.MediaItem.FLAG_BROWSABLE
      }
    return MediaBrowserCompat.MediaItem(descriptionBuilder.build(), flags)
  }

  private fun orderedPlayableMediaIdsSnapshot(): List<String> =
    synchronized(orderedPlayableMediaIds) { orderedPlayableMediaIds.toList() }

  private fun filterUnregisteredPlayableNodes() {
    for ((parentId, nodes) in childrenByParent.entries.toList()) {
      if (parentId == ROOT_ID) continue
      childrenByParent[parentId] = nodes.filter { node ->
        !node.playable || tracksByMediaId.containsKey(node.mediaId)
      }
    }
    val knownParents = childrenByParent.keys.toSet()
    for ((parentId, nodes) in childrenByParent.entries.toList()) {
      if (parentId == ROOT_ID) continue
      val closed = nodes.filter { node ->
        node.playable || node.mediaId.startsWith("empty:") || node.mediaId in knownParents
      }
      childrenByParent[parentId] = if (closed.isEmpty()) {
        listOf(disabledEmptyNode(parentId, "No matching audio is available."))
      } else closed
    }
  }

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
    if (!childrenByParent.containsKey(ROOT_LISTEN)) {
      childrenByParent[ROOT_LISTEN] = listOf(disabledEmptyNode(
        ROOT_LISTEN, "Continue listening on your phone to see unfinished audio here."
      ))
    }
    if (!childrenByParent.containsKey(ROOT_RADIO)) {
      childrenByParent[ROOT_RADIO] = listOf(disabledEmptyNode(
        ROOT_RADIO, "Favorite stations will appear here."
      ))
    }
    if (!childrenByParent.containsKey(ROOT_LIBRARY)) {
      childrenByParent[ROOT_LIBRARY] = listOf(
        BrowseNode(SECTION_MUSIC, "Saved Music", "Songs and collections", false, contentType = "music")
      )
    }
  }

  private fun disabledEmptyNode(parentId: String, title: String) =
    BrowseNode("empty:$parentId", title, "", false)

  /** The premium Android Auto hierarchy always has exactly three roots. */
  private fun defaultRootNodes(): List<BrowseNode> = candidateRootNodes()

  private fun candidateRootNodes(): List<BrowseNode> = listOf(
    BrowseNode(ROOT_LISTEN, "Listen", "Your listening", false, contentType = "audio"),
    BrowseNode(ROOT_RADIO, "Radio", "Live stations", false, contentType = "radio"),
    BrowseNode(ROOT_LIBRARY, "Library", "Music, podcasts, and books", false, contentType = "audio")
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
      visible.add(node)
    }
    return visible
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
    val startedAt = SystemClock.elapsedRealtime()
    try {
      val root = JSONObject()
      root.put("schemaVersion", SNAPSHOT_SCHEMA_VERSION)
      root.put("profileNamespace", activeProfileNamespace)
      root.put("signature", snapshotSignature)
      root.put("generatedAt", snapshotGeneratedAt)
      root.put("matureAllowed", matureAllowed)
      root.put("maturePodcastAllowed", maturePodcastAllowed)
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
            .put("parentId", track.parentId)
            .put("canonicalId", track.canonicalId)
            .put("isMature", track.isMature)
            .put("showId", track.showId)
            .put("episodeId", track.episodeId)
            .put("bookId", track.bookId)
            .put("chapterId", track.chapterId)
            .put("resumePositionMillis", track.resumePositionMillis)
            .put("collection", track.collection)
        )
      }
      root.put("tracks", tracks)
      val serialized = root.toString()
      store.edit().putString(PREFS_KEY, serialized).apply()
      HiddenAudioCore.emitAutoPerformanceDiagnostic("android_auto_snapshot_persist_timing", Arguments.createMap().apply {
        putInt("serializedBytes", serialized.toByteArray(Charsets.UTF_8).size)
        putDouble("elapsedMs", (SystemClock.elapsedRealtime() - startedAt).toDouble())
      })
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
      if (root.optInt("schemaVersion", 0) != SNAPSHOT_SCHEMA_VERSION) {
        prefs?.edit()?.remove(PREFS_KEY)?.apply()
        return
      }
      val profileNamespace = root.optString("profileNamespace", "")
      if (profileNamespace.isBlank()) {
        prefs?.edit()?.remove(PREFS_KEY)?.apply()
        return
      }
      activeProfileNamespace = profileNamespace
      snapshotSignature = root.optString("signature", "")
      snapshotGeneratedAt = root.optLong("generatedAt", 0L)
      matureAllowed = root.optBoolean("matureAllowed", false)
      maturePodcastAllowed = root.optBoolean("maturePodcastAllowed", false)
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
            val isMature = t.optBoolean("isMature", false)
            if (isMature && !isMatureDomainAllowed(contentType)) continue
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
              isLive = isLive,
              parentId = t.optString("parentId", ""),
              canonicalId = t.optString("canonicalId", t.optString("id", mediaId)),
              isMature = isMature,
              showId = t.optString("showId", ""),
              episodeId = t.optString("episodeId", ""),
              bookId = t.optString("bookId", ""),
              chapterId = t.optString("chapterId", ""),
              resumePositionMillis = t.optDouble("resumePositionMillis", 0.0),
              collection = t.optString("collection", "")
            )
            orderedPlayableMediaIds.add(mediaId)
          }
        }
      }
      filterUnregisteredPlayableNodes()
    } catch (_: Throwable) {
      // Corrupt cache fails closed and is removed so it cannot leave partial
      // profile data in memory or create a restore loop.
      clear()
      prefs?.edit()?.remove(PREFS_KEY)?.apply()
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
