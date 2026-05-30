package com.hiddentunes.app.audio

import android.os.Bundle
import android.support.v4.media.MediaBrowserCompat
import androidx.media.MediaBrowserServiceCompat

class HiddenAudioBrowserService : MediaBrowserServiceCompat() {
  override fun onCreate() {
    super.onCreate()
    bindExistingSessionToken()
  }

  override fun onGetRoot(
    clientPackageName: String,
    clientUid: Int,
    rootHints: Bundle?
  ): MediaBrowserServiceCompat.BrowserRoot {
    bindExistingSessionToken()
    return MediaBrowserServiceCompat.BrowserRoot("hidden_audio_root", null)
  }

  override fun onLoadChildren(
    parentId: String,
    result: MediaBrowserServiceCompat.Result<MutableList<MediaBrowserCompat.MediaItem>>
  ) {
    result.sendResult(mutableListOf())
  }

  private fun bindExistingSessionToken() {
    if (HiddenAudioService::mediaSession.isInitialized) {
      sessionToken = HiddenAudioService.mediaSession.sessionToken
    }
  }
}
