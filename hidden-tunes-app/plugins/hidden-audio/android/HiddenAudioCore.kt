package com.hiddentunes.app.audio

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

object HiddenAudioCore {
  private const val LOG_TAG = "HiddenAudio"
  private const val NOTIFICATION_CHANNEL_ID = "hidden_audio_playback"
  private const val PROGRESS_DIAGNOSTIC_INTERVAL_MS = 15_000L
  private const val ON_EVENTS_DIAGNOSTIC_INTERVAL_MS = 3_000L

  private data class TrackData(
    val id: String,
    val url: String,
    val title: String,
    val artist: String,
    val album: String?,
    val artworkUrl: String?,
    val durationSeconds: Double?
  )

  private data class ProgressSnapshot(
    val positionMs: Long,
    val durationMs: Long,
    val bufferedMs: Long
  )

  private data class PlayerSnapshot(
    val isPlaying: Boolean,
    val playWhenReady: Boolean,
    val playbackState: Int,
    val currentMediaItemIndex: Int,
    val durationMs: Long?,
    val positionMs: Long,
    val bufferedMs: Long,
    val hasNext: Boolean,
    val hasPrevious: Boolean
  )

  private var player: ExoPlayer? = null
  private var mediaSession: MediaSession? = null
  private var appContext: Context? = null
  private var reactContext: ReactApplicationContext? = null
  private var queue: List<TrackData> = emptyList()
  private var activeIndex = -1
  private var endedEmittedForIndex = -1
  private var lastProgressDiagnosticAt = 0L
  private var lastOnEventsDiagnosticAt = 0L
  private var lastOnEventsDiagnosticKey = ""
  @Volatile private var cachedIsPlaying = false
  @Volatile private var cachedProgress = ProgressSnapshot(0L, 0L, 0L)
  @Volatile private var cachedPlayerSnapshot = PlayerSnapshot(
    isPlaying = false,
    playWhenReady = false,
    playbackState = Player.STATE_IDLE,
    currentMediaItemIndex = -1,
    durationMs = null,
    positionMs = 0L,
    bufferedMs = 0L,
    hasNext = false,
    hasPrevious = false
  )
  private var progressHandler: Handler? = null
  private val progressRunnable = object : Runnable {
    override fun run() {
      emitProgress()
      progressHandler?.postDelayed(this, 1000)
    }
  }

  fun attachReactContext(context: ReactApplicationContext) {
    reactContext = context
  }

  @androidx.annotation.OptIn(UnstableApi::class)
  fun setup(context: Context) {
    appContext = context.applicationContext
    ensureNotificationChannel(context.applicationContext)

    if (player == null) {
      player = ExoPlayer.Builder(context.applicationContext).build().also { exoPlayer ->
        progressHandler = Handler(exoPlayer.applicationLooper)
        exoPlayer.setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build(),
          true
        )
        exoPlayer.setWakeMode(C.WAKE_MODE_NETWORK)
        exoPlayer.addListener(object : Player.Listener {
          override fun onEvents(player: Player, events: Player.Events) {
            val snapshot = capturePlayerSnapshot(player)
            if (
              events.contains(Player.EVENT_PLAY_WHEN_READY_CHANGED) ||
              events.contains(Player.EVENT_PLAYBACK_STATE_CHANGED) ||
              events.contains(Player.EVENT_MEDIA_ITEM_TRANSITION) ||
              events.contains(Player.EVENT_POSITION_DISCONTINUITY) ||
              events.contains(Player.EVENT_IS_LOADING_CHANGED)
            ) {
              if (shouldEmitOnEventsDiagnostic(snapshot)) {
                emitDiagnostic(
                  "hidden_audio_android_on_events",
                  snapshot.toDiagnosticMap(
                    "trackId" to (activeTrack()?.id ?: ""),
                    "activeIndex" to activeIndex,
                    "threadName" to Thread.currentThread().name
                  ) + mapOf("events" to events.toString())
                )
              }
              emitState()
              emitProgress()
            }
          }

          override fun onPlaybackStateChanged(playbackState: Int) {
            val snapshot = capturePlayerSnapshot(exoPlayer)
            emitDiagnostic(
              "hidden_audio_android_playback_state_changed",
              snapshot.toDiagnosticMap(
                "trackId" to (activeTrack()?.id ?: ""),
                "activeIndex" to activeIndex,
                "threadName" to Thread.currentThread().name
              )
            )
            if (playbackState == Player.STATE_ENDED && endedEmittedForIndex != activeIndex) {
              endedEmittedForIndex = activeIndex
              emitDiagnostic(
                "hidden_audio_native_track_ended",
                mapOf("trackId" to (activeTrack()?.id ?: ""), "activeIndex" to activeIndex)
              )
              stopProgressPolling()
              if (!snapshot.hasNext) {
                stopForegroundService("queue_ended")
              }
            }
            emitState()
          }

          override fun onIsPlayingChanged(isPlaying: Boolean) {
            val snapshot = capturePlayerSnapshot(exoPlayer)
            cachedIsPlaying = isPlaying
            emitDiagnostic(
              "hidden_audio_android_is_playing_changed",
              snapshot.toDiagnosticMap(
                "trackId" to (activeTrack()?.id ?: ""),
                "activeIndex" to activeIndex,
                "threadName" to Thread.currentThread().name
              )
            )
            if (isPlaying) {
              requestForegroundServiceStart("is_playing_changed")
              emitDiagnostic(
                "hidden_audio_native_playing_confirmed",
                mapOf(
                  "trackId" to (activeTrack()?.id ?: ""),
                  "activeIndex" to activeIndex,
                  "threadName" to Thread.currentThread().name
                )
              )
              startProgressPolling()
            } else {
              stopProgressPolling()
            }
            emitState()
          }

          override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            val snapshot = capturePlayerSnapshot(exoPlayer)
            val previousIndex = activeIndex
            if (
              reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO &&
              previousIndex >= 0 &&
              endedEmittedForIndex != previousIndex
            ) {
              endedEmittedForIndex = previousIndex
              emitDiagnostic(
                "hidden_audio_native_track_ended",
                mapOf(
                  "trackId" to (queue.getOrNull(previousIndex)?.id ?: ""),
                  "activeIndex" to previousIndex
                )
              )
            }
            activeIndex = exoPlayer.currentMediaItemIndex.takeIf { it >= 0 } ?: activeIndex
            endedEmittedForIndex = -1
            emitDiagnostic(
              "hidden_audio_native_track_changed",
              snapshot.toDiagnosticMap(
                "trackId" to (activeTrack()?.id ?: ""),
                "activeIndex" to activeIndex,
                "reason" to reason,
                "threadName" to Thread.currentThread().name
              )
            )
            notifyServiceNotificationUpdated("track_changed")
            emitTrackChanged()
            emitState()
            emitProgress()
          }

          override fun onPlayerError(error: PlaybackException) {
            val snapshot = capturePlayerSnapshot(exoPlayer)
            emitDiagnostic(
              "hidden_audio_android_player_error",
              snapshot.toDiagnosticMap(
                "trackId" to (activeTrack()?.id ?: ""),
                "activeIndex" to activeIndex,
                "errorCode" to error.errorCode,
                "message" to (error.message ?: "ExoPlayer playback failed"),
                "threadName" to Thread.currentThread().name
              )
            )
            emitError(error.message ?: "ExoPlayer playback failed")
          }
        })
      }
    }

    if (mediaSession == null) {
      mediaSession = MediaSession.Builder(context.applicationContext, player!!).build()
      emitDiagnostic("hidden_audio_android_media_session_created")
    }
  }

  fun loadTrack(context: Context, track: ReadableMap) {
    loadQueue(context, listOf(parseTrack(track)), 0)
  }

  fun loadQueue(context: Context, tracks: ReadableArray, startIndex: Int) {
    if (tracks.size() <= 0) throw IllegalArgumentException("Queue is empty")

    val parsedTracks = mutableListOf<TrackData>()
    for (index in 0 until tracks.size()) {
      val track = tracks.getMap(index)
        ?: throw IllegalArgumentException("Track payload is required")
      parsedTracks.add(parseTrack(track))
    }

    loadQueue(context, parsedTracks, startIndex)
  }

  private fun loadQueue(context: Context, tracks: List<TrackData>, startIndex: Int) {
    setup(context)
    val safeIndex = startIndex.coerceIn(0, tracks.size - 1)
    queue = tracks
    activeIndex = safeIndex
    endedEmittedForIndex = -1

    val mediaItems = tracks.map { it.toMediaItem() }
    val currentTrack = tracks[safeIndex]
    cachedProgress = ProgressSnapshot(
      positionMs = 0L,
      durationMs = ((currentTrack.durationSeconds ?: 0.0) * 1000).toLong(),
      bufferedMs = 0L
    )

    runOnPlayerThread("loadQueue") {
      val currentPlayer = player ?: return@runOnPlayerThread
      emitDiagnostic(
        "hidden_audio_native_load_start",
        commandState(currentPlayer) + mapOf("trackId" to currentTrack.id, "activeIndex" to safeIndex)
      )
      currentPlayer.setMediaItems(mediaItems, safeIndex, 0L)
      currentPlayer.prepare()
      emitDiagnostic(
        "hidden_audio_android_notification_queue_ready",
        commandState(currentPlayer) + mapOf(
          "trackCount" to tracks.size,
          "activeIndex" to safeIndex,
          "hasNext" to (safeIndex + 1 < tracks.size),
          "hasPrevious" to (safeIndex > 0)
        )
      )
      emitDiagnostic(
        "hidden_audio_native_queue_loaded",
        commandState(currentPlayer) + mapOf("trackCount" to tracks.size, "activeIndex" to safeIndex)
      )
      emitDiagnostic(
        "hidden_audio_native_player_created",
        commandState(currentPlayer) + mapOf("trackId" to currentTrack.id, "activeIndex" to safeIndex)
      )
      emitTrackChanged()
      emitState()
      emitProgress()
    }
  }

  fun play() {
    if (player == null) throw IllegalStateException("No player is loaded")
    runOnPlayerThread("play") {
      val currentPlayer = player ?: return@runOnPlayerThread
      emitDiagnostic(
        "hidden_audio_native_audio_session_active",
        mapOf("platform" to "android", "threadName" to Thread.currentThread().name)
      )
      emitDiagnostic(
        "hidden_audio_native_play_requested",
        commandState(currentPlayer) + mapOf("trackId" to (activeTrack()?.id ?: ""), "activeIndex" to activeIndex)
      )
      emitDiagnostic("hidden_audio_android_command_play", commandState(currentPlayer))
      currentPlayer.play()
      requestForegroundServiceStart("play")
      emitState()
      emitProgress()
    }
  }

  fun pause() {
    runOnPlayerThread("pause") {
      val currentPlayer = player ?: return@runOnPlayerThread
      emitDiagnostic("hidden_audio_android_command_pause", commandState(currentPlayer))
      currentPlayer.pause()
      stopProgressPolling()
      emitState()
      emitProgress()
    }
  }

  fun stop() {
    runOnPlayerThread("stop") {
      val currentPlayer = player ?: return@runOnPlayerThread
      emitDiagnostic("hidden_audio_android_command_stop", commandState(currentPlayer))
      currentPlayer.stop()
      stopProgressPolling()
      stopForegroundService("stop")
      emitState()
      emitProgress()
    }
  }

  fun seekTo(seconds: Double) {
    runOnPlayerThread("seekTo") {
      val currentPlayer = player ?: return@runOnPlayerThread
      emitDiagnostic(
        "hidden_audio_android_command_seek",
        commandState(currentPlayer) + mapOf("targetSeconds" to seconds)
      )
      currentPlayer.seekTo((seconds * 1000).toLong().coerceAtLeast(0))
      emitProgress()
      emitState()
    }
  }

  fun next() {
    runOnPlayerThread("next") {
      val currentPlayer = player ?: return@runOnPlayerThread
      val snapshot = capturePlayerSnapshot(currentPlayer)
      emitDiagnostic("hidden_audio_android_command_next", commandState(currentPlayer))
      if (snapshot.hasNext) {
        currentPlayer.seekToNextMediaItem()
        currentPlayer.play()
        emitState()
        emitProgress()
      } else {
        emitDiagnostic(
          "hidden_audio_android_command_unavailable",
          commandState(currentPlayer) + mapOf("command" to "next", "reason" to "no_next_track")
        )
      }
    }
  }

  fun previous() {
    runOnPlayerThread("previous") {
      val currentPlayer = player ?: return@runOnPlayerThread
      val snapshot = capturePlayerSnapshot(currentPlayer)
      emitDiagnostic("hidden_audio_android_command_previous", commandState(currentPlayer))
      if (snapshot.positionMs > 3000 || !currentPlayer.hasPreviousMediaItem()) {
        currentPlayer.seekTo(0)
      } else {
        currentPlayer.seekToPreviousMediaItem()
      }
      currentPlayer.play()
      emitState()
      emitProgress()
    }
  }

  fun state(): WritableMap {
    val snapshot = playerSnapshot()
    val status = when {
      player == null -> "idle"
      snapshot.isPlaying -> "playing"
      snapshot.playbackState == Player.STATE_BUFFERING -> "buffering"
      snapshot.playbackState == Player.STATE_READY -> "ready"
      snapshot.playbackState == Player.STATE_ENDED -> "ended"
      snapshot.playbackState == Player.STATE_IDLE && activeTrack() == null -> "idle"
      else -> "paused"
    }

    return Arguments.createMap().apply {
      putString("status", status)
      putMap("activeTrack", activeTrack()?.toMap())
      putMap("queue", Arguments.createMap().apply {
        val tracks = Arguments.createArray()
        queue.forEach { tracks.pushMap(it.toMap()) }
        putArray("tracks", tracks)
        putInt("activeIndex", activeIndex)
      })
      putString("error", null)
    }
  }

  fun progress(): WritableMap {
    val snapshot = progressSnapshot()

    return Arguments.createMap().apply {
      putDouble("positionSeconds", snapshot.positionMs / 1000.0)
      putDouble("durationSeconds", snapshot.durationMs / 1000.0)
      putDouble("bufferedSeconds", snapshot.bufferedMs / 1000.0)
    }
  }

  fun activeTrackMap(): WritableMap? = activeTrack()?.toMap()

  fun session(): MediaSession? = mediaSession

  fun isPlaying(): Boolean = cachedIsPlaying

  fun notifyServiceNotificationPosted(reason: String) {
    emitDiagnostic(
      "hidden_audio_android_notification_posted",
      mapOf(
        "reason" to reason,
        "trackId" to (activeTrack()?.id ?: ""),
        "activeIndex" to activeIndex,
        "queueLength" to queue.size
      )
    )
  }

  fun notifyServiceNotificationUpdated(reason: String) {
    emitDiagnostic(
      "hidden_audio_android_notification_updated",
      mapOf(
        "reason" to reason,
        "trackId" to (activeTrack()?.id ?: ""),
        "activeIndex" to activeIndex,
        "queueLength" to queue.size,
        "isPlaying" to cachedIsPlaying
      )
    )
  }

  fun notifyServiceNotificationError(stage: String, message: String) {
    emitDiagnostic(
      "hidden_audio_android_notification_error",
      mapOf("stage" to stage, "message" to message)
    )
  }

  fun emitProgress() {
    val progress = progress()
    emit("HiddenAudioProgress", Arguments.createMap().apply {
      putString("type", "progress")
      putMap("progress", progress)
    })

    val now = System.currentTimeMillis()
    if (now - lastProgressDiagnosticAt >= PROGRESS_DIAGNOSTIC_INTERVAL_MS) {
      lastProgressDiagnosticAt = now
      val snapshot = progressSnapshot()
      emitDiagnostic(
        "hidden_audio_android_progress_poll_thread",
        mapOf("threadName" to Thread.currentThread().name)
      )
      emitDiagnostic(
        "hidden_audio_native_progress",
        mapOf(
          "positionSeconds" to snapshot.positionMs / 1000.0,
          "durationSeconds" to snapshot.durationMs / 1000.0,
          "activeIndex" to activeIndex,
          "threadName" to Thread.currentThread().name
        )
      )
    }
  }

  fun emitState() {
    emit("HiddenAudioState", Arguments.createMap().apply {
      putString("type", "state")
      putMap("state", state())
    })
  }

  private fun emitTrackChanged() {
    emit("HiddenAudioTrackChanged", Arguments.createMap().apply {
      putString("type", "track_changed")
      putMap("track", activeTrack()?.toMap())
      putInt("index", activeIndex)
    })
  }

  private fun parseTrack(track: ReadableMap): TrackData {
    val trackId = track.optionalString("id") ?: "hidden-audio-track"
    val title = track.optionalString("title") ?: "Hidden Tunes"
    val artist = track.optionalString("artist") ?: "Hidden Tunes"
    val album = track.optionalString("album")
    val url = track.optionalString("url") ?: throw IllegalArgumentException("Track url is required")
    val artworkUrl = track.optionalString("artworkUrl")
    val durationSeconds =
      if (track.hasKey("durationSeconds") && !track.isNull("durationSeconds")) {
        track.getDouble("durationSeconds")
      } else {
        null
      }
    val uri = Uri.parse(url)
    val scheme = uri.scheme?.lowercase()
    if (scheme !in setOf("http", "https", "file", "content")) {
      emitError("Track url is invalid")
      throw IllegalArgumentException("Track url is invalid")
    }

    emitDiagnostic(
      "hidden_audio_native_url_valid",
      mapOf("scheme" to (scheme ?: ""), "trackId" to trackId)
    )

    return TrackData(trackId, url, title, artist, album, artworkUrl, durationSeconds)
  }

  private fun activeTrack(): TrackData? = queue.getOrNull(activeIndex)

  private fun isOnPlayerThread(): Boolean =
    progressHandler?.looper != null && Looper.myLooper() == progressHandler?.looper

  private fun playerSnapshot(): PlayerSnapshot {
    val currentPlayer = player
    return if (currentPlayer != null && isOnPlayerThread()) {
      capturePlayerSnapshot(currentPlayer)
    } else {
      cachedPlayerSnapshot
    }
  }

  private fun capturePlayerSnapshot(currentPlayer: Player): PlayerSnapshot {
    val durationMs = currentPlayer.duration.takeIf { it != C.TIME_UNSET && it > 0 }
    val snapshot = PlayerSnapshot(
      isPlaying = currentPlayer.isPlaying,
      playWhenReady = currentPlayer.playWhenReady,
      playbackState = currentPlayer.playbackState,
      currentMediaItemIndex = currentPlayer.currentMediaItemIndex,
      durationMs = durationMs,
      positionMs = currentPlayer.currentPosition,
      bufferedMs = currentPlayer.bufferedPosition,
      hasNext = currentPlayer.hasNextMediaItem(),
      hasPrevious = currentPlayer.hasPreviousMediaItem() || currentPlayer.currentPosition > 3000
    )
    cachedIsPlaying = snapshot.isPlaying
    cachedPlayerSnapshot = snapshot
    cachedProgress = ProgressSnapshot(
      positionMs = snapshot.positionMs,
      durationMs = snapshot.durationMs
        ?: ((activeTrack()?.durationSeconds ?: 0.0) * 1000).toLong(),
      bufferedMs = snapshot.bufferedMs
    )
    return snapshot
  }

  private fun PlayerSnapshot.toDiagnosticMap(
    vararg extras: Pair<String, Any?>
  ): Map<String, Any?> =
    mapOf(
      "isPlaying" to isPlaying,
      "playWhenReady" to playWhenReady,
      "playbackState" to playbackState,
      "currentMediaItemIndex" to currentMediaItemIndex,
      "durationMs" to durationMs,
      "positionMs" to positionMs,
      "bufferedPosition" to bufferedMs,
      "hasNext" to hasNext,
      "hasPrevious" to hasPrevious
    ) + extras.toMap()

  private fun progressSnapshot(): ProgressSnapshot {
    val currentPlayer = player
    val activeTrackDurationMs = ((activeTrack()?.durationSeconds ?: 0.0) * 1000).toLong()

    if (currentPlayer == null || !isOnPlayerThread()) {
      val currentSnapshot = cachedProgress
      return if (currentSnapshot.durationMs > 0 || activeTrackDurationMs <= 0) {
        currentSnapshot
      } else {
        currentSnapshot.copy(durationMs = activeTrackDurationMs)
      }
    }

    val playerSnapshot = capturePlayerSnapshot(currentPlayer)
    val durationMs = playerSnapshot.durationMs ?: activeTrackDurationMs
    val snapshot = ProgressSnapshot(
      positionMs = playerSnapshot.positionMs,
      durationMs = durationMs,
      bufferedMs = playerSnapshot.bufferedMs
    )
    cachedProgress = snapshot
    return snapshot
  }

  private fun startProgressPolling() {
    val currentPlayer = player ?: return
    val handler = progressHandler ?: Handler(currentPlayer.applicationLooper).also {
      progressHandler = it
    }
    handler.removeCallbacks(progressRunnable)
    handler.post(progressRunnable)
  }

  private fun stopProgressPolling() {
    progressHandler?.removeCallbacks(progressRunnable)
  }

  private fun ensureNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    try {
      val manager = context.getSystemService(NotificationManager::class.java)
      val channel = NotificationChannel(
        NOTIFICATION_CHANNEL_ID,
        "Hidden Tunes playback",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Hidden Tunes audio playback controls"
        setShowBadge(false)
      }
      manager?.createNotificationChannel(channel)
      emitDiagnostic(
        "hidden_audio_android_notification_channel_ready",
        mapOf("channelId" to NOTIFICATION_CHANNEL_ID)
      )
    } catch (error: Throwable) {
      notifyServiceNotificationError(
        "notification_channel",
        error.message ?: error.toString()
      )
    }
  }

  private fun requestForegroundServiceStart(reason: String) {
    val context = appContext ?: return

    try {
      val intent = Intent(context, HiddenAudioService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      emitDiagnostic(
        "hidden_audio_android_foreground_service_start_requested",
        mapOf(
          "reason" to reason,
          "trackId" to (activeTrack()?.id ?: ""),
          "activeIndex" to activeIndex,
          "queueLength" to queue.size
        )
      )
    } catch (error: Throwable) {
      notifyServiceNotificationError(
        "foreground_service_start",
        error.message ?: error.toString()
      )
    }
  }

  private fun stopForegroundService(reason: String) {
    val context = appContext ?: return

    try {
      context.stopService(Intent(context, HiddenAudioService::class.java))
      notifyServiceNotificationUpdated(reason)
    } catch (error: Throwable) {
      notifyServiceNotificationError(
        "foreground_service_stop",
        error.message ?: error.toString()
      )
    }
  }

  private fun runOnPlayerThread(actionName: String, action: () -> Unit) {
    val handler = progressHandler
    if (handler != null && Looper.myLooper() != handler.looper) {
      handler.post {
        try {
          action()
        } catch (error: Throwable) {
          emitDiagnostic(
            "hidden_audio_android_player_thread_action_failed",
            mapOf(
              "action" to actionName,
              "message" to (error.message ?: error.toString()),
              "threadName" to Thread.currentThread().name
            )
          )
          emitError(error.message ?: "HiddenAudio player action failed")
        }
      }
      return
    }

    action()
  }

  private fun shouldEmitOnEventsDiagnostic(snapshot: PlayerSnapshot): Boolean {
    val now = System.currentTimeMillis()
    val key = listOf(
      snapshot.playbackState,
      snapshot.isPlaying,
      snapshot.playWhenReady,
      snapshot.currentMediaItemIndex,
      snapshot.durationMs
    ).joinToString(":")
    if (key != lastOnEventsDiagnosticKey) {
      lastOnEventsDiagnosticKey = key
      lastOnEventsDiagnosticAt = now
      return true
    }
    if (now - lastOnEventsDiagnosticAt >= ON_EVENTS_DIAGNOSTIC_INTERVAL_MS) {
      lastOnEventsDiagnosticAt = now
      return true
    }
    return false
  }

  private fun commandState(currentPlayer: Player): Map<String, Any?> {
    val snapshot = if (isOnPlayerThread()) {
      capturePlayerSnapshot(currentPlayer)
    } else {
      cachedPlayerSnapshot
    }
    return snapshot.toDiagnosticMap(
      "trackId" to (activeTrack()?.id ?: ""),
      "activeIndex" to activeIndex,
      "queueLength" to queue.size,
      "threadName" to Thread.currentThread().name
    )
  }

  private fun TrackData.toMediaItem(): MediaItem {
    val metadataBuilder = MediaMetadata.Builder()
      .setTitle(title)
      .setArtist(artist)
      .setAlbumTitle(album)

    if (!artworkUrl.isNullOrBlank()) {
      metadataBuilder.setArtworkUri(Uri.parse(artworkUrl))
    }

    return MediaItem.Builder()
      .setMediaId(id)
      .setUri(Uri.parse(url))
      .setMediaMetadata(metadataBuilder.build())
      .build()
  }

  private fun emitDiagnostic(
    eventName: String,
    details: Map<String, Any?> = emptyMap()
  ) {
    Log.d(LOG_TAG, "$eventName $details")
    emit("HiddenAudioDiagnostic", Arguments.createMap().apply {
      putString("type", "diagnostic")
      putString("eventName", eventName)
      putMap("data", Arguments.createMap().apply {
        details.forEach { (key, value) ->
          when (value) {
            is String -> putString(key, value)
            is Number -> putDouble(key, value.toDouble())
            is Boolean -> putBoolean(key, value)
            null -> putString(key, null)
            else -> putString(key, value.toString())
          }
        }
      })
    })
  }

  private fun emitError(message: String) {
    Log.e(LOG_TAG, "hidden_audio_native_error $message")
    emitDiagnostic("hidden_audio_native_error", mapOf("message" to message))
    stopProgressPolling()
    emit("HiddenAudioState", Arguments.createMap().apply {
      putString("type", "error")
      putString("message", message)
    })
  }

  private fun emit(eventName: String, body: WritableMap) {
    reactContext
      ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit(eventName, body)
  }

  private fun TrackData.toMap(): WritableMap =
    Arguments.createMap().apply {
      putString("id", id)
      putString("url", url)
      putString("title", title)
      putString("artist", artist)
      if (!album.isNullOrBlank()) putString("album", album)
      if (!artworkUrl.isNullOrBlank()) putString("artworkUrl", artworkUrl)
      durationSeconds?.let { putDouble("durationSeconds", it) }
    }

  private fun ReadableMap.optionalString(key: String): String? =
    if (hasKey(key) && !isNull(key)) getString(key) else null
}
