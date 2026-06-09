package com.hiddentunes.app.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.hiddentunes.app.MainActivity

class HiddenAudioPlaybackService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val channelId = "hidden_audio_playback"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        channelId,
        "Hidden Tunes Playback",
        NotificationManager.IMPORTANCE_LOW
      )
      val manager = getSystemService(NotificationManager::class.java)
      manager?.createNotificationChannel(channel)
    }

    val launchIntent = Intent(this, MainActivity::class.java)
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val smallIconRes = resources.getIdentifier("ic_notification", "drawable", packageName)
    val resolvedSmallIcon = if (smallIconRes != 0) {
      smallIconRes
    } else {
      applicationInfo.icon
    }

    val notification: Notification = NotificationCompat.Builder(this, channelId)
      .setContentTitle("Hidden Tunes")
      .setContentText("Playing in background")
      .setSmallIcon(resolvedSmallIcon)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
      .build()

    try {
      startForeground(FOREGROUND_NOTIFICATION_ID, notification)
    } catch (error: Throwable) {
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    HiddenAudioCore.handleTaskRemoved()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  companion object {
    const val FOREGROUND_NOTIFICATION_ID = 41001
  }
}
