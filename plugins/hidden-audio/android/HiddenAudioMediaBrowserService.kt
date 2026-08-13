package com.hiddentunes.app.audio

import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.support.v4.media.MediaBrowserCompat
import androidx.media.MediaBrowserServiceCompat
import com.facebook.react.bridge.Arguments

class HiddenAudioMediaBrowserService : MediaBrowserServiceCompat() {
  private var rootChildrenLimit = Int.MAX_VALUE
  private var rootChildrenSupportedFlags = MediaBrowserCompat.MediaItem.FLAG_BROWSABLE
  private var connectedClients = 0

  override fun onCreate() {
    val startedAt = SystemClock.elapsedRealtime()
    super.onCreate()
    activeInstance = this
    Log.i(TAG, "HiddenAudioMediaBrowserService onCreate")
    HiddenAudioAutoCatalog.attachContext(applicationContext)
    HiddenAudioCore.attachApplicationContext(applicationContext)
    HiddenAudioAutoCatalog.ensureDefaultCatalog()
    HiddenAudioMediaSessionManager.ensureSession(applicationContext)
    HiddenAudioMediaSessionManager.activateSessionForAuto(applicationContext, "media_browser_on_create")
    sessionToken = HiddenAudioMediaSessionManager.sessionToken()
    HiddenAudioCore.emitAutoDiagnostic("android_auto_service_created")
    HiddenAudioCore.emitAutoDiagnostic("android_auto_mbs_on_create")
    HiddenAudioCore.emitAutoPerformanceDiagnostic("android_auto_service_start_timing", Arguments.createMap().apply {
      putDouble("elapsedMs", (SystemClock.elapsedRealtime() - startedAt).toDouble())
    })
    Log.i(TAG, "HiddenAudioMediaBrowserService ready for Android Auto binding")
  }

  override fun onGetRoot(
    clientPackageName: String,
    clientUid: Int,
    rootHints: Bundle?
  ): BrowserRoot? {
    val rootData = Arguments.createMap()
    rootData.putString("clientPackageName", clientPackageName)
    Log.i(TAG, "onGetRoot clientPackageName=$clientPackageName")
    HiddenAudioCore.emitAutoDiagnostic("android_auto_root_requested", rootData)
    HiddenAudioCore.emitAutoDiagnostic("android_auto_media_root_requested", rootData)
    HiddenAudioAutoCatalog.attachContext(applicationContext)
    HiddenAudioCore.attachApplicationContext(applicationContext)
    HiddenAudioAutoCatalog.ensureDefaultCatalog()
    HiddenAudioMediaSessionManager.ensureSession(applicationContext)
    HiddenAudioMediaSessionManager.activateSessionForAuto(applicationContext, "media_browser_on_get_root")
    HiddenAudioCore.emitAudioRouteDiagnosticForAuto("media_browser_on_get_root")
    connectedClients += 1
    HiddenAudioCore.noteAndroidAutoBrowserConnected(clientPackageName)
    HiddenAudioCore.emitAutoDiagnostic(
      "android_auto_service_connected",
      Arguments.createMap().apply {
        putString("clientPackageName", clientPackageName)
        putInt("connectedClients", connectedClients)
      }
    )

    rootHints?.let { hints ->
      if (hints.containsKey(EXTRA_ROOT_CHILDREN_LIMIT)) {
        rootChildrenLimit = hints.getInt(EXTRA_ROOT_CHILDREN_LIMIT, Int.MAX_VALUE)
      }
      if (hints.containsKey(EXTRA_ROOT_CHILDREN_SUPPORTED_FLAGS)) {
        rootChildrenSupportedFlags = hints.getInt(
          EXTRA_ROOT_CHILDREN_SUPPORTED_FLAGS,
          MediaBrowserCompat.MediaItem.FLAG_BROWSABLE
        )
      }
    }

    val extras = Bundle().apply {
      putInt(EXTRA_CONTENT_STYLE_BROWSABLE, CONTENT_STYLE_LIST_ITEM)
      putInt(EXTRA_CONTENT_STYLE_PLAYABLE, CONTENT_STYLE_LIST_ITEM)
      putBoolean(BrowserRoot.EXTRA_OFFLINE, false)
    }
    // Never start playback merely because Android Auto connected.
    return BrowserRoot(HiddenAudioAutoCatalog.ROOT_ID, extras)
  }

  override fun onLoadChildren(
    parentId: String,
    result: Result<MutableList<MediaBrowserCompat.MediaItem>>
  ) {
    val startedAt = SystemClock.elapsedRealtime()
    val data = Arguments.createMap()
    data.putString("parentId", parentId)
    HiddenAudioCore.emitAutoDiagnostic("android_auto_children_requested", data)

    try {
      val children =
        if (parentId == HiddenAudioAutoCatalog.ROOT_ID) {
          HiddenAudioAutoCatalog.getRootChildrenForAuto(
            rootChildrenLimit,
            rootChildrenSupportedFlags
          )
        } else {
          HiddenAudioAutoCatalog.getChildren(parentId)
        }
      val items = children.map { node -> HiddenAudioAutoCatalog.toMediaItem(node) }
      result.sendResult(items.toMutableList())
      HiddenAudioCore.emitAutoPerformanceDiagnostic("android_auto_folder_open_timing", Arguments.createMap().apply {
        putString("parentId", parentId)
        putInt("itemCount", items.size)
        putDouble("elapsedMs", (SystemClock.elapsedRealtime() - startedAt).toDouble())
      })
    } catch (error: Throwable) {
      HiddenAudioMediaSessionManager.reportError(error.message ?: "children_load_failed")
      HiddenAudioAutoCatalog.ensureDefaultCatalog()
      val fallbackParentId =
        if (parentId.isBlank()) HiddenAudioAutoCatalog.ROOT_ID else parentId
      val fallbackChildren =
        if (fallbackParentId == HiddenAudioAutoCatalog.ROOT_ID) {
          HiddenAudioAutoCatalog.getRootChildrenForAuto(
            rootChildrenLimit,
            rootChildrenSupportedFlags
          )
        } else {
          HiddenAudioAutoCatalog.getChildren(fallbackParentId)
        }
      val fallbackItems = fallbackChildren.map { node -> HiddenAudioAutoCatalog.toMediaItem(node) }
      result.sendResult(fallbackItems.toMutableList())
    }
  }

  override fun onSearch(
    query: String,
    extras: Bundle?,
    result: Result<MutableList<MediaBrowserCompat.MediaItem>>
  ) {
    val startedAt = SystemClock.elapsedRealtime()
    val data = Arguments.createMap()
    data.putInt("queryLength", query.length.coerceAtMost(128))
    HiddenAudioCore.emitAutoDiagnostic("android_auto_search_requested", data)
    try {
      val matches = HiddenAudioAutoCatalog.search(query, limit = 24)
      result.sendResult(matches.map { HiddenAudioAutoCatalog.toMediaItem(it) }.toMutableList())
      HiddenAudioCore.emitAutoPerformanceDiagnostic("android_auto_search_timing", Arguments.createMap().apply {
        putInt("resultCount", matches.size)
        putDouble("elapsedMs", (SystemClock.elapsedRealtime() - startedAt).toDouble())
      })
    } catch (error: Throwable) {
      HiddenAudioMediaSessionManager.reportError(error.message ?: "search_failed")
      // Never cache timeouts as empty permanently — return empty for this request only.
      result.sendResult(mutableListOf())
    }
  }

  override fun onUnbind(intent: android.content.Intent?): Boolean {
    connectedClients = (connectedClients - 1).coerceAtLeast(0)
    HiddenAudioCore.noteAndroidAutoBrowserDisconnected()
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    if (activeInstance === this) {
      activeInstance = null
    }
    connectedClients = 0
    HiddenAudioCore.emitAutoDiagnostic("android_auto_disconnected")
    super.onDestroy()
  }

  companion object {
    private const val TAG = "HiddenTunesAuto"
    private const val EXTRA_ROOT_CHILDREN_LIMIT =
      "android.media.browse.extra.ROOT_CHILDREN_LIMIT"
    private const val EXTRA_ROOT_CHILDREN_SUPPORTED_FLAGS =
      "android.media.browse.extra.ROOT_CHILDREN_SUPPORTED_FLAGS"
    private const val EXTRA_CONTENT_STYLE_BROWSABLE =
      "android.media.browse.CONTENT_STYLE_BROWSABLE"
    private const val EXTRA_CONTENT_STYLE_PLAYABLE =
      "android.media.browse.CONTENT_STYLE_PLAYABLE"
    private const val CONTENT_STYLE_LIST_ITEM = 1

    @Volatile
    private var activeInstance: HiddenAudioMediaBrowserService? = null

    /**
     * Notify connected Android Auto clients that browse children changed.
     * No-op when the MediaBrowserService is not alive — next connect reads disk/memory.
     * Does not start the service merely to send a notification.
     */
    fun notifyBrowseParentsChanged(parentIds: Collection<String>) {
      val service = activeInstance ?: return
      if (parentIds.isEmpty()) return
      val unique = linkedSetOf<String>()
      for (id in parentIds) {
        val clean = id.trim()
        if (clean.isNotEmpty()) unique.add(clean)
      }
      if (unique.isEmpty()) return
      for (parentId in unique) {
        try {
          service.notifyChildrenChanged(parentId)
        } catch (_: Throwable) {
          // Best-effort; never crash catalog sync.
        }
      }
      val data = Arguments.createMap()
      data.putInt("parentCount", unique.size)
      data.putString("parents", unique.joinToString(","))
      HiddenAudioCore.emitAutoDiagnostic("android_auto_children_notified", data)
    }
  }
}
