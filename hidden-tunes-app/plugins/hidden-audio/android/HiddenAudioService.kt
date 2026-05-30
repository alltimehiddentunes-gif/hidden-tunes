package com.hiddentunes.app.audio

import android.content.Intent
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

class HiddenAudioService : MediaSessionService() {
  override fun onGetSession(
    controllerInfo: MediaSession.ControllerInfo
  ): MediaSession? = HiddenAudioCore.session()

  override fun onTaskRemoved(rootIntent: Intent?) {
    if (!HiddenAudioCore.isPlaying()) {
      stopSelf()
    }
  }
}
