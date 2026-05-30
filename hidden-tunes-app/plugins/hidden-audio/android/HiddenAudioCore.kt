package com.hiddentunes.app.audio

import android.content.Context
import android.net.Uri
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
  private const val PROGRESS_DIAGNOSTIC_INTERVAL_MS = 15_000L

  private data class TrackData(
    val id: String,
    val url: String,
    val title: String,
    val artist: String,
    val album: String?,
    val artworkUrl: String?,
    val durationSeconds: Double?
  )

  private var player: ExoPlayer? = null
  private var mediaSession: MediaSession? = null
  private var reactContext: ReactApplicationContext? = null
  private var queue: List<TrackData> = emptyList()
  private var activeIndex = -1
  private var endedEmittedForIndex = -1
  private var lastProgressDiagnosticAt = 0L
  private val progressHandler = Handler(Looper.getMainLooper())
  private val progressRunnable = object : Runnable {
    override fun run() {
      emitProgress()
      progressHandler.postDelayed(this, 1000)
    }
  }

  fun attachReactContext(context: ReactApplicationContext) {
    reactContext = context
  }

  @androidx.annotation.OptIn(UnstableApi::class)
  fun setup(context: Context) {
    if (player == null) {
      player = ExoPlayer.Builder(context.applicationContext).build().also { exoPlayer ->
        exoPlayer.setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build(),
          true
        )
        exoPlayer.setWakeMode(C.WAKE_MODE_NETWORK)
        exoPlayer.setSeekBackIncrementMs(10_000)
        exoPlayer.setSeekForwardIncrementMs(30_000)
        exoPlayer.addListener(object : Player.Listener {
          override fun onEvents(player: Player, events: Player.Events) {
            if (
              events.contains(Player.EVENT_PLAY_WHEN_READY_CHANGED) ||
              events.contains(Player.EVENT_PLAYBACK_STATE_CHANGED) ||
              events.contains(Player.EVENT_MEDIA_ITEM_TRANSITION) ||
              events.contains(Player.EVENT_POSITION_DISCONTINUITY)
            ) {
              emitDiagnostic(
                "hidden_audio_android_media_session_state_synced",
                mapOf(
                  "isPlaying" to player.isPlaying,
                  "playWhenReady" to player.playWhenReady,
                  "playbackState" to player.playbackState,
                  "activeIndex" to player.currentMediaItemIndex,
                  "hasNext" to player.hasNextMediaItem(),
                  "hasPrevious" to hasPreviousTrack(player)
                )
              )
              emitState()
              emitProgress()
            }
          }

          override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_ENDED && endedEmittedForIndex != activeIndex) {
              endedEmittedForIndex = activeIndex
              emitDiagnostic(
                "hidden_audio_native_track_ended",
                mapOf("trackId" to (activeTrack()?.id ?: ""), "activeIndex" to activeIndex)
              )
              progressHandler.removeCallbacks(progressRunnable)
            }
            emitState()
          }

          override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) {
              emitDiagnostic(
                "hidden_audio_native_playing_confirmed",
                mapOf("trackId" to (activeTrack()?.id ?: ""), "activeIndex" to activeIndex)
              )
              progressHandler.removeCallbacks(progressRunnable)
              progressHandler.post(progressRunnable)
            } else {
              progressHandler.removeCallbacks(progressRunnable)
            }
            emitState()
          }

          override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
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
              mapOf("trackId" to (activeTrack()?.id ?: ""), "activeIndex" to activeIndex)
            )
            emitTrackChanged()
            emitState()
            emitProgress()
          }

          override fun onPlayerError(error: PlaybackException) {
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
    emitDiagnostic(
      "hidden_audio_native_load_start",
      mapOf("trackId" to currentTrack.id, "activeIndex" to safeIndex)
    )
    player?.setMediaItems(mediaItems, safeIndex, 0L)
    player?.prepare()
    emitDiagnostic(
      "hidden_audio_android_notification_queue_ready",
      mapOf(
        "trackCount" to tracks.size,
        "activeIndex" to safeIndex,
        "hasNext" to (safeIndex + 1 < tracks.size),
        "hasPrevious" to (safeIndex > 0)
      )
    )
    emitDiagnostic(
      "hidden_audio_native_queue_loaded",
      mapOf("trackCount" to tracks.size, "activeIndex" to safeIndex)
    )
    emitDiagnostic(
      "hidden_audio_native_player_created",
      mapOf("trackId" to currentTrack.id, "activeIndex" to safeIndex)
    )
    emitTrackChanged()
    emitState()
    emitProgress()
  }

  fun play() {
    val currentPlayer = player ?: throw IllegalStateException("No player is loaded")
    emitDiagnostic(
      "hidden_audio_native_audio_session_active",
      mapOf("platform" to "android")
    )
    emitDiagnostic(
      "hidden_audio_native_play_requested",
      mapOf("trackId" to (activeTrack()?.id ?: ""), "activeIndex" to activeIndex)
    )
    emitDiagnostic("hidden_audio_android_command_play", commandState(currentPlayer))
    currentPlayer.play()
    emitState()
    emitProgress()
  }

  fun pause() {
    val currentPlayer = player ?: return
    emitDiagnostic("hidden_audio_android_command_pause", commandState(currentPlayer))
    currentPlayer.pause()
    progressHandler.removeCallbacks(progressRunnable)
    emitState()
    emitProgress()
  }

  fun stop() {
    val currentPlayer = player ?: return
    emitDiagnostic("hidden_audio_android_command_stop", commandState(currentPlayer))
    currentPlayer.stop()
    progressHandler.removeCallbacks(progressRunnable)
    emitState()
    emitProgress()
  }

  fun seekTo(seconds: Double) {
    val currentPlayer = player ?: return
    emitDiagnostic(
      "hidden_audio_android_command_seek",
      commandState(currentPlayer) + mapOf("targetSeconds" to seconds)
    )
    currentPlayer.seekTo((seconds * 1000).toLong().coerceAtLeast(0))
    emitProgress()
    emitState()
  }

  fun next() {
    val currentPlayer = player ?: return
    emitDiagnostic("hidden_audio_android_command_next", commandState(currentPlayer))
    if (currentPlayer.hasNextMediaItem()) {
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

  fun previous() {
    val currentPlayer = player ?: return
    emitDiagnostic("hidden_audio_android_command_previous", commandState(currentPlayer))
    if (currentPlayer.currentPosition > 3000 || !currentPlayer.hasPreviousMediaItem()) {
      currentPlayer.seekTo(0)
    } else {
      currentPlayer.seekToPreviousMediaItem()
    }
    currentPlayer.play()
    emitState()
    emitProgress()
  }

  fun state(): WritableMap {
    val currentPlayer = player
    val status = when {
      currentPlayer == null -> "idle"
      currentPlayer.isPlaying -> "playing"
      currentPlayer.playbackState == Player.STATE_BUFFERING -> "buffering"
      currentPlayer.playbackState == Player.STATE_READY -> "ready"
      currentPlayer.playbackState == Player.STATE_ENDED -> "ended"
      currentPlayer.playbackState == Player.STATE_IDLE && activeTrack() == null -> "idle"
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
    val currentPlayer = player
    val activeTrackDurationMs = ((activeTrack()?.durationSeconds ?: 0.0) * 1000).toLong()
    val durationMs = currentPlayer?.duration
      ?.takeIf { it != C.TIME_UNSET && it > 0 }
      ?: activeTrackDurationMs
    val bufferedMs = currentPlayer?.bufferedPosition ?: 0L
    val positionMs = currentPlayer?.currentPosition ?: 0L

    return Arguments.createMap().apply {
      putDouble("positionSeconds", positionMs / 1000.0)
      putDouble("durationSeconds", durationMs / 1000.0)
      putDouble("bufferedSeconds", bufferedMs / 1000.0)
    }
  }

  fun activeTrackMap(): WritableMap? = activeTrack()?.toMap()

  fun session(): MediaSession? = mediaSession

  fun isPlaying(): Boolean = player?.isPlaying == true

  fun emitProgress() {
    val progress = progress()
    emit("HiddenAudioProgress", Arguments.createMap().apply {
      putString("type", "progress")
      putMap("progress", progress)
    })

    val now = System.currentTimeMillis()
    if (now - lastProgressDiagnosticAt >= PROGRESS_DIAGNOSTIC_INTERVAL_MS) {
      lastProgressDiagnosticAt = now
      val currentPlayer = player
      val activeTrackDurationMs = ((activeTrack()?.durationSeconds ?: 0.0) * 1000).toLong()
      val durationMs = currentPlayer?.duration
        ?.takeIf { it != C.TIME_UNSET && it > 0 }
        ?: activeTrackDurationMs
      val positionMs = currentPlayer?.currentPosition ?: 0L
      emitDiagnostic(
        "hidden_audio_native_progress",
        mapOf(
          "positionSeconds" to positionMs / 1000.0,
          "durationSeconds" to durationMs / 1000.0,
          "activeIndex" to activeIndex
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

  private fun hasPreviousTrack(currentPlayer: Player): Boolean =
    currentPlayer.hasPreviousMediaItem() || currentPlayer.currentPosition > 3000

  private fun commandState(currentPlayer: Player): Map<String, Any?> =
    mapOf(
      "trackId" to (activeTrack()?.id ?: ""),
      "activeIndex" to activeIndex,
      "queueLength" to queue.size,
      "isPlaying" to currentPlayer.isPlaying,
      "playWhenReady" to currentPlayer.playWhenReady,
      "playbackState" to currentPlayer.playbackState,
      "positionMs" to currentPlayer.currentPosition,
      "durationMs" to currentPlayer.duration.takeIf { it != C.TIME_UNSET },
      "hasNext" to currentPlayer.hasNextMediaItem(),
      "hasPrevious" to hasPreviousTrack(currentPlayer)
    )

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
    progressHandler.removeCallbacks(progressRunnable)
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
