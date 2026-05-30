package com.hiddentunes.app.audio

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

object HiddenAudioCore {
  private const val LOG_TAG = "HiddenAudio"

  private data class TrackData(
    val id: String,
    val url: String,
    val title: String,
    val artist: String,
    val artworkUrl: String?
  )

  private var player: ExoPlayer? = null
  private var mediaSession: MediaSession? = null
  private var reactContext: ReactApplicationContext? = null
  private var activeTrack: TrackData? = null
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

  fun setup(context: Context) {
    if (player == null) {
      player = ExoPlayer.Builder(context.applicationContext).build().also {
        it.addListener(object : Player.Listener {
          override fun onPlaybackStateChanged(playbackState: Int) {
            emitState()
          }

          override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) {
              emitDiagnostic(
                "hidden_audio_native_playing_confirmed",
                mapOf("trackId" to (activeTrack?.id ?: ""))
              )
            }
            emitState()
          }

          override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            emitState()
          }

          override fun onPlayerError(error: PlaybackException) {
            emitError(error.message ?: "ExoPlayer playback failed")
          }
        })
      }
    }

    if (mediaSession == null) {
      mediaSession = MediaSession.Builder(context.applicationContext, player!!).build()
    }
  }

  fun loadTrack(context: Context, track: ReadableMap) {
    setup(context)
    val trackId = track.getString("id") ?: "hidden-audio-track"
    val title = track.getString("title") ?: "Hidden Tunes"
    val artist = track.getString("artist") ?: "Hidden Tunes"
    val url = track.getString("url") ?: throw IllegalArgumentException("Track url is required")
    val artworkUrl = track.getString("artworkUrl")
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

    val metadataBuilder = MediaMetadata.Builder()
      .setTitle(title)
      .setArtist(artist)

    if (!artworkUrl.isNullOrBlank()) {
      metadataBuilder.setArtworkUri(android.net.Uri.parse(artworkUrl))
    }

    val mediaItem = MediaItem.Builder()
      .setMediaId(trackId)
      .setUri(uri)
      .setMediaMetadata(metadataBuilder.build())
      .build()

    player?.setMediaItem(mediaItem)
    player?.prepare()
    activeTrack = TrackData(trackId, url, title, artist, artworkUrl)
    emitDiagnostic("hidden_audio_native_player_created", mapOf("trackId" to trackId))
    emitState()
  }

  fun play() {
    val currentPlayer = player ?: throw IllegalStateException("No player is loaded")
    emitDiagnostic(
      "hidden_audio_native_audio_session_active",
      mapOf("platform" to "android")
    )
    emitDiagnostic(
      "hidden_audio_native_play_called",
      mapOf("trackId" to (activeTrack?.id ?: ""))
    )
    currentPlayer.play()
    progressHandler.removeCallbacks(progressRunnable)
    progressHandler.post(progressRunnable)
    emitState()
  }

  fun pause() {
    player?.pause()
    progressHandler.removeCallbacks(progressRunnable)
    emitState()
  }

  fun stop() {
    player?.stop()
    progressHandler.removeCallbacks(progressRunnable)
    emitState()
  }

  fun seekTo(seconds: Double) {
    player?.seekTo((seconds * 1000).toLong().coerceAtLeast(0))
    emitProgress()
  }

  fun state(): WritableMap {
    val currentPlayer = player
    val status = when {
      currentPlayer == null -> "idle"
      currentPlayer.isLoading -> "loading"
      currentPlayer.isPlaying -> "playing"
      currentPlayer.playbackState == Player.STATE_BUFFERING -> "buffering"
      currentPlayer.playbackState == Player.STATE_ENDED -> "ended"
      currentPlayer.playbackState == Player.STATE_IDLE -> "idle"
      else -> "paused"
    }

    return Arguments.createMap().apply {
      putString("status", status)
      putMap("activeTrack", activeTrack?.toMap())
      putMap("queue", Arguments.createMap().apply {
        val tracks = Arguments.createArray()
        activeTrack?.let { tracks.pushMap(it.toMap()) }
        putArray("tracks", tracks)
        putInt("activeIndex", if (activeTrack == null) -1 else 0)
      })
      putString("error", null)
    }
  }

  fun progress(): WritableMap {
    val currentPlayer = player
    val durationMs = currentPlayer?.duration?.takeIf { it != C.TIME_UNSET } ?: 0L
    val bufferedMs = currentPlayer?.bufferedPosition ?: 0L
    val positionMs = currentPlayer?.currentPosition ?: 0L

    return Arguments.createMap().apply {
      putDouble("positionSeconds", positionMs / 1000.0)
      putDouble("durationSeconds", durationMs / 1000.0)
      putDouble("bufferedSeconds", bufferedMs / 1000.0)
    }
  }

  fun activeTrackMap(): WritableMap? = activeTrack?.toMap()

  fun session(): MediaSession? = mediaSession

  fun emitProgress() {
    emit("HiddenAudioProgress", Arguments.createMap().apply {
      putString("type", "progress")
      putMap("progress", progress())
    })
  }

  fun emitState() {
    emit("HiddenAudioState", Arguments.createMap().apply {
      putString("type", "state")
      putMap("state", state())
    })
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
      if (!artworkUrl.isNullOrBlank()) putString("artworkUrl", artworkUrl)
    }
}
