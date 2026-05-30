package com.hiddentunes.app.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat

class HiddenAudioService : Service() {
  private var foregroundStarted = false

  override fun onCreate() {
    super.onCreate()
    currentService = this
    HiddenAudioCore.setup(applicationContext)
    ensureNotificationChannel()
    ensureMediaSession()
    HiddenAudioCore.notifyServiceNotificationPosted("service_created")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    HiddenAudioCore.setup(applicationContext)
    ensureNotificationChannel()
    ensureMediaSession()

    when (intent?.action) {
      ACTION_PLAY -> HiddenAudioCore.play()
      ACTION_PAUSE -> HiddenAudioCore.pause()
      ACTION_TOGGLE -> {
        if (HiddenAudioCore.isPlaying()) HiddenAudioCore.pause() else HiddenAudioCore.play()
      }
      ACTION_NEXT -> HiddenAudioCore.next()
      ACTION_PREVIOUS -> HiddenAudioCore.previous()
      ACTION_STOP -> HiddenAudioCore.stop()
      ACTION_START_FOREGROUND, null -> startOrUpdateForeground("service_start")
    }

    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onTaskRemoved(rootIntent: Intent?) {
    // Keep the service alive while audio is active, even if the app task is removed.
    if (!HiddenAudioCore.hasActiveQueue()) {
      stopForegroundCompat(true)
      stopSelf()
    } else {
      startOrUpdateForeground("task_removed_active_queue")
    }
  }

  override fun onDestroy() {
    if (currentService === this) {
      currentService = null
    }
    try {
      mediaSession.isActive = false
      mediaSession.release()
    } catch (_: UninitializedPropertyAccessException) {
    }
    super.onDestroy()
  }

  fun startOrUpdateForeground(reason: String) {
    val notification = buildNotification()
    updateMediaSessionState()
    // This is the real foreground-service promotion that keeps playback alive locked/backgrounded.
    startForeground(NOTIFICATION_ID, notification)
    foregroundStarted = true
    HiddenAudioCore.notifyServiceNotificationPosted(reason)
  }

  fun updateNotification(reason: String) {
    if (!foregroundStarted && HiddenAudioCore.hasActiveQueue()) {
      startOrUpdateForeground(reason)
      return
    }

    if (!foregroundStarted) return

    try {
      updateMediaSessionState()
      val manager = getSystemService(NotificationManager::class.java)
      manager?.notify(NOTIFICATION_ID, buildNotification())
      HiddenAudioCore.notifyServiceNotificationUpdated(reason)
    } catch (error: Throwable) {
      HiddenAudioCore.notifyServiceNotificationError(
        "notification_update",
        error.message ?: error.toString()
      )
    }
  }

  fun stopForegroundAndService(reason: String) {
    // The service is stopped only when HiddenAudio has fully stopped/emptied playback.
    stopForegroundCompat(true)
    foregroundStarted = false
    HiddenAudioCore.notifyServiceNotificationUpdated(reason)
    stopSelf()
  }

  private fun ensureMediaSession(): MediaSessionCompat {
    try {
      return mediaSession
    } catch (_: UninitializedPropertyAccessException) {
    }

    return MediaSessionCompat(this, "HiddenAudio").apply {
      setFlags(
        MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
          MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
      )
      setCallback(object : MediaSessionCompat.Callback() {
        override fun onPlay() {
          HiddenAudioCore.play()
        }

        override fun onPause() {
          HiddenAudioCore.pause()
        }

        override fun onSkipToNext() {
          HiddenAudioCore.next()
        }

        override fun onSkipToPrevious() {
          HiddenAudioCore.previous()
        }

        override fun onSeekTo(pos: Long) {
          HiddenAudioCore.seekTo(pos / 1000.0)
        }

        override fun onStop() {
          HiddenAudioCore.stop()
        }
      })
      isActive = true
      HiddenAudioService.mediaSession = this
    }
  }

  private fun updateMediaSessionState() {
    val session = ensureMediaSession()
    val state = HiddenAudioCore.notificationState()
    val playbackState = if (state.isPlaying) {
      PlaybackStateCompat.STATE_PLAYING
    } else {
      PlaybackStateCompat.STATE_PAUSED
    }

    session.isActive = state.hasActiveTrack
    session.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(
          PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
            PlaybackStateCompat.ACTION_SEEK_TO or
            PlaybackStateCompat.ACTION_STOP
        )
        .setState(playbackState, state.positionMs, if (state.isPlaying) 1.0f else 0.0f)
        .build()
    )
    session.setMetadata(
      MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, state.title)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, state.artist)
        .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, state.album ?: "")
        .putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, state.artworkUrl ?: "")
        .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, state.durationMs)
        .build()
    )
  }

  private fun buildNotification(): Notification {
    val state = HiddenAudioCore.notificationState()
    val session = ensureMediaSession()
    val playPauseAction = if (state.isPlaying) {
      NotificationCompat.Action(
        android.R.drawable.ic_media_pause,
        "Pause",
        servicePendingIntent(ACTION_PAUSE, 2)
      )
    } else {
      NotificationCompat.Action(
        android.R.drawable.ic_media_play,
        "Play",
        servicePendingIntent(ACTION_PLAY, 1)
      )
    }

    return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_media_play)
      .setContentTitle(state.title)
      .setContentText(state.artist)
      .setSubText(state.album)
      .setLargeIcon(loadArtworkBitmap(state.artworkUrl))
      .setContentIntent(appLaunchIntent())
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true)
      .setOngoing(state.isPlaying)
      .setShowWhen(false)
      .addAction(
        NotificationCompat.Action(
          android.R.drawable.ic_media_previous,
          "Previous",
          servicePendingIntent(ACTION_PREVIOUS, 4)
        )
      )
      .addAction(playPauseAction)
      .addAction(
        NotificationCompat.Action(
          android.R.drawable.ic_media_next,
          "Next",
          servicePendingIntent(ACTION_NEXT, 3)
        )
      )
      .setStyle(
        androidx.media.app.NotificationCompat.MediaStyle()
          .setMediaSession(session.sessionToken)
          .setShowActionsInCompactView(0, 1, 2)
      )
      .build()
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
      NOTIFICATION_CHANNEL_ID,
      "Hidden Tunes playback",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Hidden Tunes audio playback controls"
      setShowBadge(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager?.createNotificationChannel(channel)
    HiddenAudioCore.notifyServiceNotificationChannelReady(NOTIFICATION_CHANNEL_ID)
  }

  private fun servicePendingIntent(action: String, requestCode: Int): PendingIntent {
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    return PendingIntent.getService(
      this,
      requestCode,
      Intent(this, HiddenAudioService::class.java).setAction(action),
      flags
    )
  }

  private fun appLaunchIntent(): PendingIntent? {
    val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse("hiddentunes://player")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    return PendingIntent.getActivity(this, 10, launchIntent, flags)
  }

  private fun loadArtworkBitmap(artworkUrl: String?): Bitmap? {
    if (artworkUrl.isNullOrBlank()) return null
    return try {
      val uri = Uri.parse(artworkUrl)
      if (uri.scheme == "file") {
        BitmapFactory.decodeFile(uri.path)
      } else {
        null
      }
    } catch (_: Throwable) {
      null
    }
  }

  private fun stopForegroundCompat(removeNotification: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(if (removeNotification) STOP_FOREGROUND_REMOVE else STOP_FOREGROUND_DETACH)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(removeNotification)
    }
  }

  companion object {
    @JvmStatic
    lateinit var mediaSession: MediaSessionCompat

    const val NOTIFICATION_ID = 4739
    const val NOTIFICATION_CHANNEL_ID = "hidden_audio_playback"
    const val ACTION_START_FOREGROUND = "com.hiddentunes.app.audio.START_FOREGROUND"
    const val ACTION_PLAY = "com.hiddentunes.app.audio.PLAY"
    const val ACTION_PAUSE = "com.hiddentunes.app.audio.PAUSE"
    const val ACTION_TOGGLE = "com.hiddentunes.app.audio.TOGGLE"
    const val ACTION_NEXT = "com.hiddentunes.app.audio.NEXT"
    const val ACTION_PREVIOUS = "com.hiddentunes.app.audio.PREVIOUS"
    const val ACTION_STOP = "com.hiddentunes.app.audio.STOP"

    @Volatile private var currentService: HiddenAudioService? = null

    fun startForegroundPlayback(context: Context, reason: String) {
      val intent = Intent(context, HiddenAudioService::class.java)
        .setAction(ACTION_START_FOREGROUND)
        .putExtra("reason", reason)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      currentService?.startOrUpdateForeground(reason)
    }

    fun updateFromCore(reason: String) {
      currentService?.updateNotification(reason)
    }

    fun stopFromCore(reason: String) {
      currentService?.stopForegroundAndService(reason)
    }
  }
}
