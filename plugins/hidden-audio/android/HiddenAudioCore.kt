package com.hiddentunes.app.audio

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

object HiddenAudioCore {
  private var reactContext: ReactApplicationContext? = null
  private var player: ExoPlayer? = null
  private var playerStatus = "idle"
  private var activeTrack: WritableMap? = null
  private var activeIndex = 0
  private val mainHandler = Handler(Looper.getMainLooper())
  private var progressTick: Runnable? = null
  private var audioManager: AudioManager? = null
  private var audioFocusRequest: AudioFocusRequest? = null
  private var hasAudioFocus = false
  private var shouldPlayWhenReady = false
  private var playbackEndedHandled = false

  fun attachReactContext(context: ReactApplicationContext) {
    reactContext = context
    if (audioManager == null) {
      audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }
  }

  fun setup(context: ReactApplicationContext) {
    attachReactContext(context)
    ensurePlayer(context)
    emitDiagnostic("android_hidden_audio_setup_complete")
  }

  fun loadTrack(context: ReactApplicationContext, track: ReadableMap) {
    attachReactContext(context)
    ensurePlayer(context)
    activeTrack = trackToMap(track)
    activeIndex = 0
    playbackEndedHandled = false
    val url = activeTrack?.getString("url") ?: ""
    if (url.isBlank()) {
      playerStatus = "error"
      emitDiagnostic("hidden_audio_load_track_failed", simpleData("reason", "missing_url"))
      emitState()
      throw IllegalArgumentException("HiddenAudio track URL is required")
    }
    val mediaItem = MediaItem.fromUri(Uri.parse(url))
    player?.setMediaItem(mediaItem)
    player?.prepare()
    playerStatus = "ready"
    shouldPlayWhenReady = false
    emitTrackChanged()
    emitState()
  }

  fun play() {
    val context = reactContext ?: return
    ensurePlayer(context)
    val url = activeTrack?.getString("url") ?: ""
    if (url.isBlank()) {
      playerStatus = "error"
      emitDiagnostic("hidden_audio_play_failed", simpleData("reason", "missing_loaded_track"))
      emitState()
      throw IllegalStateException("HiddenAudio cannot play without a loaded track")
    }
    requestAudioFocus()
    shouldPlayWhenReady = true
    startForegroundService()
    player?.playWhenReady = true
    if (player?.playbackState == Player.STATE_IDLE) {
      player?.prepare()
    }
    player?.play()
    playerStatus = when (player?.playbackState) {
      Player.STATE_BUFFERING -> "buffering"
      Player.STATE_READY -> if (player?.isPlaying == true) "playing" else "buffering"
      else -> "playing"
    }
    startProgressLoop()
    emitDiagnostic("hidden_audio_play_confirmed")
    emitState()
    emitProgress()
  }

  fun pause() {
    player?.pause()
    player?.playWhenReady = false
    playerStatus = "paused"
    stopProgressLoop()
    emitDiagnostic("hidden_audio_pause_called")
    emitState()
    emitProgress()
  }

  fun stop() {
    stopProgressLoop()
    player?.stop()
    player?.clearMediaItems()
    player?.playWhenReady = false
    playerStatus = "idle"
    activeTrack = null
    activeIndex = 0
    playbackEndedHandled = false
    abandonAudioFocus()
    stopForegroundService()
    emitDiagnostic("hidden_audio_unload_called")
    emitState()
    emitProgress()
  }

  fun seekTo(seconds: Double) {
    val millis = (seconds.coerceAtLeast(0.0) * 1000).toLong()
    player?.seekTo(millis)
    emitProgress()
  }

  fun emitRemoteCommand(command: String) {
    val data = Arguments.createMap()
    data.putString("command", command)
    emitDiagnostic("android_remote_command_received", data)
    emitDiagnostic("remote_command_dispatched_to_js", data)
  }

  fun state(): WritableMap {
    val state = Arguments.createMap()
    state.putString("status", playerStatus)
    state.putMap("activeTrack", activeTrack ?: Arguments.createMap())
    val queue = Arguments.createMap()
    queue.putInt("activeIndex", activeIndex)
    state.putMap("queue", queue)
    return state
  }

  fun progress(): WritableMap {
    val exo = player
    val positionSeconds =
      if (exo == null) 0.0 else exo.currentPosition.coerceAtLeast(0) / 1000.0
    val durationSeconds =
      if (exo == null || exo.duration <= 0) {
        activeTrack?.getDouble("durationSeconds") ?: 0.0
      } else {
        exo.duration.coerceAtLeast(0) / 1000.0
      }
    val isPlaying =
      exo?.isPlaying == true || exo?.playWhenReady == true && playerStatus == "buffering"
    val progress = Arguments.createMap()
    progress.putDouble("positionSeconds", positionSeconds)
    progress.putDouble("durationSeconds", durationSeconds)
    progress.putDouble("currentTime", positionSeconds)
    progress.putDouble("duration", durationSeconds)
    progress.putDouble("bufferedSeconds", 0.0)
    progress.putDouble("bufferedPosition", 0.0)
    progress.putDouble("isPlaying", if (isPlaying) 1.0 else 0.0)
    progress.putString("status", playerStatus)
    return progress
  }

  fun activeTrackMap(): WritableMap? = activeTrack

  private fun ensurePlayer(context: Context) {
    if (player != null) return
    val audioAttributes = androidx.media3.common.AudioAttributes.Builder()
      .setUsage(androidx.media3.common.C.USAGE_MEDIA)
      .setContentType(androidx.media3.common.C.AUDIO_CONTENT_TYPE_MUSIC)
      .build()
    player = ExoPlayer.Builder(context)
      .setAudioAttributes(audioAttributes, true)
      .setHandleAudioBecomingNoisy(true)
      .build()
    player?.addListener(object : Player.Listener {
      override fun onPlaybackStateChanged(playbackState: Int) {
        when (playbackState) {
          Player.STATE_BUFFERING -> playerStatus = "buffering"
          Player.STATE_READY -> {
            playerStatus = when {
              player?.isPlaying == true -> "playing"
              player?.playWhenReady == true -> "buffering"
              playerStatus != "paused" -> "ready"
              else -> "paused"
            }
          }
          Player.STATE_ENDED -> handlePlaybackEnded()
          Player.STATE_IDLE -> if (playerStatus != "stopped") playerStatus = "idle"
        }
        emitState()
        emitProgress()
      }

      override fun onIsPlayingChanged(isPlaying: Boolean) {
        playerStatus = when {
          isPlaying -> "playing"
          player?.playWhenReady == true -> "buffering"
          else -> "paused"
        }
        if (isPlaying || player?.playWhenReady == true) startProgressLoop() else stopProgressLoop()
        emitDiagnostic("android_player_state_changed", simpleData("state", playerStatus))
        emitState()
        emitProgress()
      }

      override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
        playerStatus = "error"
        val data = Arguments.createMap()
        data.putString("message", error.message ?: "unknown")
        data.putString("errorCodeName", error.errorCodeName)
        emitDiagnostic("android_player_error", data)
        emitState()
        emitProgress()
      }
    })
    emitDiagnostic("android_exoplayer_initialized")
  }

  private fun handlePlaybackEnded() {
    if (playbackEndedHandled) return
    playbackEndedHandled = true
    playerStatus = "ended"
    stopProgressLoop()
    val body = Arguments.createMap()
    body.putString("type", "playback_ended")
    if (activeTrack != null) body.putMap("track", activeTrack)
    body.putInt("index", activeIndex)
    val pos = player?.currentPosition?.coerceAtLeast(0)?.div(1000.0) ?: 0.0
    val dur = player?.duration?.coerceAtLeast(0)?.div(1000.0)
      ?: (activeTrack?.getDouble("durationSeconds") ?: 0.0)
    body.putDouble("positionSeconds", pos)
    body.putDouble("durationSeconds", dur)
    body.putString("status", playerStatus)
    emit("HiddenAudioPlaybackEnded", body)
    emitDiagnostic("hidden_audio_track_finished")
    emitState()
    emitProgress()
  }

  private fun trackToMap(track: ReadableMap): WritableMap {
    val map = Arguments.createMap()
    map.putString("id", track.getStringSafe("id", "hidden-audio-track"))
    map.putString("url", track.getStringSafe("url", ""))
    map.putString("title", track.getStringSafe("title", "Hidden Tunes"))
    map.putString("artist", track.getStringSafe("artist", "Hidden Tunes"))
    map.putString("album", track.getStringSafe("album", ""))
    map.putString("artworkUrl", track.getStringSafe("artworkUrl", ""))
    map.putDouble("durationSeconds", track.getDoubleSafe("durationSeconds", 0.0))
    return map
  }

  private fun ReadableMap.getStringSafe(key: String, fallback: String): String {
    return if (hasKey(key) && !isNull(key)) getString(key) ?: fallback else fallback
  }

  private fun ReadableMap.getDoubleSafe(key: String, fallback: Double): Double {
    return if (hasKey(key) && !isNull(key)) getDouble(key) else fallback
  }

  private fun requestAudioFocus(): Boolean {
    val manager = audioManager ?: return false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val focusAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(focusAttributes)
        .setOnAudioFocusChangeListener { change ->
          when (change) {
            AudioManager.AUDIOFOCUS_LOSS, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
              if (player?.isPlaying == true) pause()
              emitDiagnostic("android_audio_focus_lost")
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
              emitDiagnostic("android_audio_focus_gained")
            }
          }
        }
        .build()
      audioFocusRequest = request
      val result = manager.requestAudioFocus(request)
      hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
      return hasAudioFocus
    }
    @Suppress("DEPRECATION")
    val result = manager.requestAudioFocus(
      { change ->
        if (change == AudioManager.AUDIOFOCUS_LOSS && player?.isPlaying == true) pause()
      },
      AudioManager.STREAM_MUSIC,
      AudioManager.AUDIOFOCUS_GAIN
    )
    hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    return hasAudioFocus
  }

  private fun abandonAudioFocus() {
    val manager = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioFocusRequest?.let { manager.abandonAudioFocusRequest(it) }
    } else {
      @Suppress("DEPRECATION")
      manager.abandonAudioFocus(null)
    }
    hasAudioFocus = false
  }

  private fun startForegroundService() {
    val context = reactContext ?: return
    val intent = Intent(context, HiddenAudioPlaybackService::class.java)
    ContextCompat.startForegroundService(context, intent)
    emitDiagnostic("android_foreground_service_status", simpleData("status", "started"))
  }

  private fun stopForegroundService() {
    val context = reactContext ?: return
    context.stopService(Intent(context, HiddenAudioPlaybackService::class.java))
    emitDiagnostic("android_foreground_service_status", simpleData("status", "stopped"))
  }

  private fun startProgressLoop() {
    stopProgressLoop()
    progressTick = object : Runnable {
      override fun run() {
        emitProgress()
        mainHandler.postDelayed(this, 500)
      }
    }
    mainHandler.post(progressTick!!)
  }

  private fun stopProgressLoop() {
    progressTick?.let { mainHandler.removeCallbacks(it) }
    progressTick = null
  }

  private fun emitState() {
    val body = Arguments.createMap()
    body.putString("type", "state")
    body.putMap("state", state())
    emit("HiddenAudioState", body)
  }

  private fun emitProgress() {
    val progressMap = progress()
    val body = Arguments.createMap()
    body.putString("type", "progress")
    body.putMap("progress", progressMap)
    emit("HiddenAudioProgress", body)
    emit("HiddenAudioProgressChanged", body)
  }

  private fun emitTrackChanged() {
    val body = Arguments.createMap()
    body.putString("type", "track_changed")
    if (activeTrack != null) body.putMap("track", activeTrack)
    body.putInt("index", activeIndex)
    emit("HiddenAudioTrackChanged", body)
  }

  private fun emitDiagnostic(eventName: String, data: WritableMap = Arguments.createMap()) {
    val body = Arguments.createMap()
    body.putString("type", "diagnostic")
    body.putString("eventName", eventName)
    body.putMap("data", data)
    emit("HiddenAudioDiagnostic", body)
  }

  private fun simpleData(key: String, value: String): WritableMap {
    val data = Arguments.createMap()
    data.putString(key, value)
    return data
  }

  private fun emit(eventName: String, body: WritableMap) {
    val context = reactContext ?: return
    context
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, body)
  }
}
