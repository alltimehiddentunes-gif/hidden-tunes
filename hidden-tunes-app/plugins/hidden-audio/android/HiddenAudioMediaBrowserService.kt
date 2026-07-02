package com.hiddentunes.app.audio

import android.os.Bundle
import android.util.Log
import android.support.v4.media.MediaBrowserCompat
import androidx.media.MediaBrowserServiceCompat
import com.facebook.react.bridge.Arguments

class HiddenAudioMediaBrowserService : MediaBrowserServiceCompat() {
  private var rootChildrenLimit = Int.MAX_VALUE
  private var rootChildrenSupportedFlags = MediaBrowserCompat.MediaItem.FLAG_BROWSABLE

  override fun onCreate() {
    super.onCreate()
    Log.i(TAG, "HiddenAudioMediaBrowserService onCreate")
    HiddenAudioAutoCatalog.ensureDefaultCatalog()
    HiddenAudioMediaSessionManager.ensureSession(applicationContext)
    HiddenAudioMediaSessionManager.activateSessionForAuto(applicationContext, "media_browser_on_create")
    sessionToken = HiddenAudioMediaSessionManager.sessionToken()
    HiddenAudioCore.emitAutoDiagnostic("android_auto_mbs_on_create")
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
    HiddenAudioCore.emitAutoDiagnostic("android_auto_media_root_requested", rootData)
    HiddenAudioAutoCatalog.ensureDefaultCatalog()
    HiddenAudioMediaSessionManager.ensureSession(applicationContext)
    HiddenAudioMediaSessionManager.activateSessionForAuto(applicationContext, "media_browser_on_get_root")
    sessionToken = HiddenAudioMediaSessionManager.sessionToken()
    HiddenAudioCore.emitAudioRouteDiagnosticForAuto("media_browser_on_get_root")

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
    }
    return BrowserRoot(HiddenAudioAutoCatalog.ROOT_ID, extras)
  }

  override fun onLoadChildren(
    parentId: String,
    result: Result<MutableList<MediaBrowserCompat.MediaItem>>
  ) {
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

  private companion object {
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
  }
}
