package com.hiddentunes.app.audio

import android.content.Intent
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

class HiddenAudioService : MediaSessionService() {
  override fun onCreate() {
    super.onCreate()
    HiddenAudioCore.notifyServiceNotificationPosted("service_created")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    HiddenAudioCore.notifyServiceNotificationPosted("service_started")
    return super.onStartCommand(intent, flags, startId)
  }

  override fun onGetSession(
    controllerInfo: MediaSession.ControllerInfo
  ): MediaSession? {
    HiddenAudioCore.notifyServiceNotificationUpdated("session_requested")
    return HiddenAudioCore.session()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    if (!HiddenAudioCore.isPlaying()) {
      HiddenAudioCore.notifyServiceNotificationUpdated("task_removed_not_playing")
      stopSelf()
    }
  }
}
