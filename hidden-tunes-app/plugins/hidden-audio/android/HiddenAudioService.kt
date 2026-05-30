package com.hiddentunes.app.audio

import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

class HiddenAudioService : MediaSessionService() {
  override fun onGetSession(
    controllerInfo: MediaSession.ControllerInfo
  ): MediaSession? = HiddenAudioCore.session()
}
