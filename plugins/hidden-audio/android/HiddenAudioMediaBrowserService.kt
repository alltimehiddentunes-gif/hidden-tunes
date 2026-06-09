package com.hiddentunes.app.audio

import android.os.Bundle
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import androidx.media.MediaBrowserServiceCompat
import com.facebook.react.bridge.Arguments

class HiddenAudioMediaBrowserService : MediaBrowserServiceCompat() {
  override fun onCreate() {
    super.onCreate()
    HiddenAudioMediaSessionManager.ensureSession(applicationContext)
    sessionToken = HiddenAudioMediaSessionManager.sessionToken()
  }

  override fun onGetRoot(
    clientPackageName: String,
    clientUid: Int,
    rootHints: Bundle?
  ): BrowserRoot? {
    HiddenAudioCore.emitAutoDiagnostic("android_auto_media_root_requested")
    HiddenAudioMediaSessionManager.ensureSession(applicationContext)
    sessionToken = HiddenAudioMediaSessionManager.sessionToken()
    return BrowserRoot(HiddenAudioAutoCatalog.ROOT_ID, null)
  }

  override fun onLoadChildren(
    parentId: String,
    result: Result<MutableList<MediaBrowserCompat.MediaItem>>
  ) {
    val data = Arguments.createMap()
    data.putString("parentId", parentId)
    HiddenAudioCore.emitAutoDiagnostic("android_auto_children_requested", data)

    try {
      val children = HiddenAudioAutoCatalog.getChildren(parentId)
      val items = children.map { node ->
        val description = MediaDescriptionCompat.Builder()
          .setMediaId(node.mediaId)
          .setTitle(node.title)
          .setSubtitle(node.subtitle)
          .build()

        val flags = if (node.playable) {
          MediaBrowserCompat.MediaItem.FLAG_PLAYABLE
        } else {
          MediaBrowserCompat.MediaItem.FLAG_BROWSABLE
        }

        MediaBrowserCompat.MediaItem(description, flags)
      }

      result.sendResult(items.toMutableList())
    } catch (error: Throwable) {
      HiddenAudioMediaSessionManager.reportError(error.message ?: "children_load_failed")
      result.sendResult(mutableListOf())
    }
  }
}
