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
import android.os.SystemClock
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

object HiddenAudioCore {
  private data class ActiveTrackData(
    val id: String,
    val url: String,
    val title: String,
    val artist: String,
    val album: String,
    val artworkUrl: String,
    val durationSeconds: Double
  )

  private var reactContext: ReactApplicationContext? = null
  private var player: ExoPlayer? = null
  private var playerStatus = "idle"
  private var activeTrack: ActiveTrackData? = null
  private var activeIndex = 0
  private val mainHandler = Handler(Looper.getMainLooper())
  private var progressTick: Runnable? = null
  private var audioManager: AudioManager? = null
  private var audioFocusRequest: AudioFocusRequest? = null
  private const val AUDIO_FOCUS_STABILITY_WINDOW_MS = 3000L

  private var hasAudioFocus = false
  private var shouldPlayWhenReady = false
  private var playbackEndedHandled = false
  private var lastPlayRequestAtMs = 0L
  private var lastReassertRequestAtMs = 0L
  private var lastPlayingStartedAtMs = 0L
  private var lastLoadTrackAtMs = 0L
  private var lastStopRequestAtMs = 0L
  private var playbackSessionId = 0L
  private var committedPlaySessionId = 0L
  private var playbackCallbackGeneration = 0L

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


  private fun bumpPlaybackSession(): Long {
    playbackSessionId += 1L
    return playbackSessionId
  }

  private fun clearPlaybackCallbacks() {
    playbackCallbackGeneration += 1L
  }

  private fun postPlaybackCallback(action: () -> Unit) {
    val generation = playbackCallbackGeneration
    mainHandler.post {
      if (generation != playbackCallbackGeneration) return@post
      action()
    }
  }

  private fun isInPlaybackProtectionWindow(nowMs: Long): Boolean {
    return elapsedSince(lastPlayRequestAtMs, nowMs) <= AUDIO_FOCUS_STABILITY_WINDOW_MS ||
      elapsedSince(lastReassertRequestAtMs, nowMs) <= AUDIO_FOCUS_STABILITY_WINDOW_MS ||
      elapsedSince(lastLoadTrackAtMs, nowMs) <= AUDIO_FOCUS_STABILITY_WINDOW_MS ||
      elapsedSince(lastStopRequestAtMs, nowMs) <= AUDIO_FOCUS_STABILITY_WINDOW_MS
  }

  private fun shouldIgnoreStalePlaybackPause(): Boolean {
    return committedPlaySessionId != 0L && playbackSessionId != committedPlaySessionId
  }

  fun loadTrack(context: ReactApplicationContext, track: ReadableMap) {
    attachReactContext(context)
    ensurePlayer(context)
    clearPlaybackCallbacks()
    val sessionId = bumpPlaybackSession()
    committedPlaySessionId = sessionId
    lastLoadTrackAtMs = SystemClock.elapsedRealtime()
    activeTrack = trackToMap(track)
    activeIndex = 0
    playbackEndedHandled = false
    lastPlayingStartedAtMs = 0L
    val url = activeTrack?.url ?: ""
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
    emitTrackChanged()
    emitState()
  }

  fun play() {
    val context = reactContext ?: return
    ensurePlayer(context)
    clearPlaybackCallbacks()
    committedPlaySessionId = playbackSessionId
    val url = activeTrack?.url ?: ""
    if (url.isBlank()) {
      playerStatus = "error"
      emitDiagnostic("hidden_audio_play_failed", simpleData("reason", "missing_loaded_track"))
      emitState()
      throw IllegalStateException("HiddenAudio cannot play without a loaded track")
    }
    lastPlayRequestAtMs = SystemClock.elapsedRealtime()
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
    if (shouldIgnoreStalePlaybackPause()) {
      emitDiagnostic("android_playback_stale_session_ignored", simpleData("source", "pause"))
      return
    }
    player?.pause()
    player?.playWhenReady = false
    shouldPlayWhenReady = false
    playerStatus = "paused"
    stopProgressLoop()
    emitDiagnostic("hidden_audio_pause_called")
    emitState()
    emitProgress()
  }

  fun stop() {
    clearPlaybackCallbacks()
    bumpPlaybackSession()
    committedPlaySessionId = 0L
    lastStopRequestAtMs = SystemClock.elapsedRealtime()
    stopProgressLoop()
    player?.stop()
    player?.clearMediaItems()
    player?.playWhenReady = false
    shouldPlayWhenReady = false
    playerStatus = "idle"
    activeTrack = null
    activeIndex = 0
    playbackEndedHandled = false
    lastPlayingStartedAtMs = 0L
    lastPlayRequestAtMs = 0L
    lastReassertRequestAtMs = 0L
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

  fun reassertBackgroundPlayback(reason: String = "background_reassert") {
    val context = reactContext ?: return
    ensurePlayer(context)
    clearPlaybackCallbacks()
    committedPlaySessionId = playbackSessionId
    val url = activeTrack?.url ?: ""
    if (url.isBlank()) {
      emitDiagnostic("android_background_play_reassert_start", simpleData("reason", reason))
      emitDiagnostic("hidden_audio_play_failed", simpleData("reason", "missing_loaded_track"))
      throw IllegalStateException("HiddenAudio cannot reassert playback without a loaded track")
    }

    val startData = Arguments.createMap()
    startData.putString("reason", reason)
    startData.putString("status", playerStatus)
    startData.putBoolean("playWhenReady", player?.playWhenReady == true)
    startData.putBoolean("isPlaying", player?.isPlaying == true)
    emitDiagnostic("android_background_play_reassert_start", startData)

    lastReassertRequestAtMs = SystemClock.elapsedRealtime()
    shouldPlayWhenReady = true
    if (!hasAudioFocus) {
      requestAudioFocus()
    }
    startForegroundService()
    if (player?.playbackState == Player.STATE_IDLE) {
      player?.prepare()
    }
    player?.playWhenReady = true
    player?.play()
    playerStatus = when (player?.playbackState) {
      Player.STATE_BUFFERING -> "buffering"
      Player.STATE_READY -> if (player?.isPlaying == true) "playing" else "buffering"
      else -> "playing"
    }
    startProgressLoop()

    val successData = Arguments.createMap()
    successData.putString("reason", reason)
    successData.putString("status", playerStatus)
    successData.putBoolean("playWhenReady", player?.playWhenReady == true)
    successData.putBoolean("isPlaying", player?.isPlaying == true)
    emitDiagnostic("android_background_play_reassert_success", successData)
    emitState()
    emitProgress()
  }

  fun state(): WritableMap {
    val state = Arguments.createMap()
    state.putString("status", playerStatus)
    state.putMap("activeTrack", freshActiveTrackMap())
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
        activeTrack?.durationSeconds ?: 0.0
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

  fun activeTrackMap(): WritableMap = freshActiveTrackMap()

  private fun ensurePlayer(context: Context) {
    if (player != null) return
    val audioAttributes = androidx.media3.common.AudioAttributes.Builder()
      .setUsage(androidx.media3.common.C.USAGE_MEDIA)
      .setContentType(androidx.media3.common.C.AUDIO_CONTENT_TYPE_MUSIC)
      .build()
    player = ExoPlayer.Builder(context)
      .setAudioAttributes(audioAttributes, false)
      .setHandleAudioBecomingNoisy(true)
      .build()
    player?.addListener(object : Player.Listener {
      override fun onPlaybackStateChanged(playbackState: Int) {
        when (playbackState) {
          Player.STATE_IDLE -> {
            if (playerStatus != "stopped") playerStatus = "idle"
            emitPlaybackStateDiagnostic("android_player_state_idle", playbackState)
          }
          Player.STATE_BUFFERING -> {
            playerStatus = "buffering"
            emitPlaybackStateDiagnostic("android_player_state_buffering", playbackState)
          }
          Player.STATE_READY -> {
            playerStatus = when {
              player?.isPlaying == true -> "playing"
              player?.playWhenReady == true -> "buffering"
              playerStatus != "paused" -> "ready"
              else -> "paused"
            }
            emitPlaybackStateDiagnostic("android_player_state_ready", playbackState)
          }
          Player.STATE_ENDED -> {
            emitPlaybackStateDiagnostic("android_player_state_ended", playbackState)
            handlePlaybackEnded()
            return
          }
        }
        emitState()
        emitProgress()
      }

      override fun onIsPlayingChanged(isPlaying: Boolean) {
        if (shouldIgnoreStalePlaybackPause() && !isPlaying) {
          emitDiagnostic(
            "android_playback_stale_session_ignored",
            simpleData("source", "is_playing_changed")
          )
          return
        }
        if (isPlaying) {
          lastPlayingStartedAtMs = SystemClock.elapsedRealtime()
        } else if (shouldPlayWhenReady) {
          val nowMs = SystemClock.elapsedRealtime()
          if (isInPlaybackProtectionWindow(nowMs)) {
            emitDiagnostic(
              "android_background_pause_prevented",
              focusChangeData(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, nowMs)
            )
            postPlaybackCallback { recoverPlaybackWhenReady("is_playing_changed") }
            return
          }
        }
        playerStatus = when {
          isPlaying -> "playing"
          player?.playWhenReady == true -> "buffering"
          else -> "paused"
        }
        if (isPlaying || player?.playWhenReady == true) startProgressLoop() else stopProgressLoop()
        emitPlaybackStateDiagnostic("android_player_is_playing_changed", player?.playbackState ?: Player.STATE_IDLE)
        emitDiagnostic("android_player_state_changed", simpleData("state", playerStatus))
        emitState()
        emitProgress()
      }

      override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
        playerStatus = "error"
        val data = Arguments.createMap()
        data.putString("message", error.message ?: "unknown")
        data.putString("errorCodeName", error.errorCodeName)
        data.putInt("errorCode", error.errorCode)
        data.putString("playbackState", playbackStateName(player?.playbackState ?: Player.STATE_IDLE))
        data.putBoolean("playWhenReady", player?.playWhenReady == true)
        data.putBoolean("isPlaying", player?.isPlaying == true)
        emitDiagnostic("android_player_error", data)
        emitState()
        emitProgress()
      }
    })
    HiddenAudioMediaSessionManager.ensureSession(context)
    emitDiagnostic("android_exoplayer_initialized")
  }

  private fun handlePlaybackEnded() {
    if (playbackEndedHandled) return
    playbackEndedHandled = true
    playerStatus = "ended"
    stopProgressLoop()
    val body = Arguments.createMap()
    body.putString("type", "playback_ended")
    if (activeTrack != null) body.putMap("track", freshActiveTrackMap())
    body.putInt("index", activeIndex)
    val pos = player?.currentPosition?.coerceAtLeast(0)?.div(1000.0) ?: 0.0
    val dur = player?.duration?.coerceAtLeast(0)?.div(1000.0)
      ?: (activeTrack?.durationSeconds ?: 0.0)
    body.putDouble("positionSeconds", pos)
    body.putDouble("durationSeconds", dur)
    body.putString("status", playerStatus)
    emit("HiddenAudioPlaybackEnded", body)
    emitDiagnostic("hidden_audio_track_finished")
    emitState()
    emitProgress()
  }


  private fun playbackStateName(state: Int): String = when (state) {
    Player.STATE_IDLE -> "idle"
    Player.STATE_BUFFERING -> "buffering"
    Player.STATE_READY -> "ready"
    Player.STATE_ENDED -> "ended"
    else -> "unknown"
  }

  private fun emitPlaybackStateDiagnostic(eventName: String, playbackState: Int) {
    val exo = player
    val data = Arguments.createMap()
    data.putString("playbackState", playbackStateName(playbackState))
    data.putBoolean("playWhenReady", exo?.playWhenReady == true)
    data.putBoolean("isPlaying", exo?.isPlaying == true)
    data.putInt("playbackSuppressionReason", exo?.playbackSuppressionReason ?: Player.PLAYBACK_SUPPRESSION_REASON_NONE)
    data.putDouble(
      "positionSeconds",
      (exo?.currentPosition?.coerceAtLeast(0) ?: 0L) / 1000.0
    )
    val durationMillis = exo?.duration?.coerceAtLeast(0) ?: 0L
    data.putDouble(
      "durationSeconds",
      if (durationMillis > 0) durationMillis / 1000.0 else (activeTrack?.durationSeconds ?: 0.0)
    )
    emitDiagnostic(eventName, data)
  }

  private fun trackToMap(track: ReadableMap): ActiveTrackData {
    return ActiveTrackData(
      id = track.getStringSafe("id", "hidden-audio-track"),
      url = track.getStringSafe("url", ""),
      title = track.getStringSafe("title", "Hidden Tunes"),
      artist = track.getStringSafe("artist", "Hidden Tunes"),
      album = track.getStringSafe("album", ""),
      artworkUrl = track.getStringSafe("artworkUrl", ""),
      durationSeconds = track.getDoubleSafe("durationSeconds", 0.0)
    )
  }

  private fun freshActiveTrackMap(): WritableMap {
    val track = activeTrack
    val map = Arguments.createMap()
    if (track == null) return map

    map.putString("id", track.id)
    map.putString("url", track.url)
    map.putString("title", track.title)
    map.putString("artist", track.artist)
    map.putString("album", track.album)
    map.putString("artworkUrl", track.artworkUrl)
    map.putDouble("durationSeconds", track.durationSeconds)
    return map
  }

  private fun ReadableMap.getStringSafe(key: String, fallback: String): String {
    return if (hasKey(key) && !isNull(key)) getString(key) ?: fallback else fallback
  }

  private fun ReadableMap.getDoubleSafe(key: String, fallback: Double): Double {
    return if (hasKey(key) && !isNull(key)) getDouble(key) else fallback
  }

  private fun elapsedSince(timestampMs: Long, nowMs: Long): Long {
    if (timestampMs <= 0L) return Long.MAX_VALUE
    return (nowMs - timestampMs).coerceAtLeast(0L)
  }


  private fun recoverPlaybackWhenReady(source: String) {
    if (!shouldPlayWhenReady) return
    val exo = player ?: return
    if (exo.isPlaying && exo.playWhenReady) return
    if (!hasAudioFocus) {
      requestAudioFocus()
    }
    startForegroundService()
    if (exo.playbackState == Player.STATE_IDLE) {
      exo.prepare()
    }
    exo.playWhenReady = true
    exo.play()
    playerStatus = when (exo.playbackState) {
      Player.STATE_BUFFERING -> "buffering"
      Player.STATE_READY -> if (exo.isPlaying) "playing" else "buffering"
      else -> "playing"
    }
    startProgressLoop()
    val data = Arguments.createMap()
    data.putString("source", source)
    data.putString("status", playerStatus)
    data.putBoolean("playWhenReady", exo.playWhenReady)
    data.putBoolean("isPlaying", exo.isPlaying)
    emitDiagnostic("android_background_play_reassert_success", data)
    emitState()
    emitProgress()
  }

  private fun focusChangeData(change: Int, nowMs: Long): WritableMap {
    val data = Arguments.createMap()
    data.putInt("focusChange", change)
    data.putString("status", playerStatus)
    data.putBoolean("shouldPlayWhenReady", shouldPlayWhenReady)
    data.putDouble("msSincePlayRequest", elapsedSince(lastPlayRequestAtMs, nowMs).toDouble())
    data.putDouble("msSinceReassertRequest", elapsedSince(lastReassertRequestAtMs, nowMs).toDouble())
    data.putDouble("stablePlaybackMs", elapsedSince(lastPlayingStartedAtMs, nowMs).toDouble())
    return data
  }

  private fun handleAudioFocusChange(change: Int) {
    val nowMs = SystemClock.elapsedRealtime()
    val data = focusChangeData(change, nowMs)
    emitDiagnostic("android_audio_focus_change", data)

    when (change) {
      AudioManager.AUDIOFOCUS_LOSS -> {
        emitDiagnostic("android_audio_focus_lost", data)

        if (isInPlaybackProtectionWindow(nowMs)) {
          emitDiagnostic("android_audio_focus_loss_ignored_startup_window", data)
          emitDiagnostic("android_background_pause_prevented", data)
          return
        }

        val stablePlaybackMs = elapsedSince(lastPlayingStartedAtMs, nowMs)
        if (playerStatus != "playing" || stablePlaybackMs <= AUDIO_FOCUS_STABILITY_WINDOW_MS) {
          emitDiagnostic("android_audio_focus_loss_ignored_not_stable", data)
          emitDiagnostic("android_background_pause_prevented", data)
          return
        }

        emitDiagnostic("android_audio_focus_loss_permanent_pause", data)
        postPlaybackCallback { pause() }
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
        emitDiagnostic("android_audio_focus_lost", data)
        emitDiagnostic("android_audio_focus_loss_ignored_for_background_playback", data)
        emitDiagnostic("android_background_pause_prevented", data)
      }
      AudioManager.AUDIOFOCUS_GAIN -> {
        emitDiagnostic("android_audio_focus_gained", data)
        if (
          shouldPlayWhenReady &&
          playerStatus != "playing" &&
          elapsedSince(lastPlayRequestAtMs, nowMs) > AUDIO_FOCUS_STABILITY_WINDOW_MS &&
          elapsedSince(lastReassertRequestAtMs, nowMs) > AUDIO_FOCUS_STABILITY_WINDOW_MS
        ) {
          postPlaybackCallback { reassertBackgroundPlayback("audio_focus_gain") }
        }
      }
    }
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
          handleAudioFocusChange(change)
        }
        .build()
      audioFocusRequest = request
      val result = manager.requestAudioFocus(request)
      hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
      return hasAudioFocus
    }
    @Suppress("DEPRECATION")
    val result = manager.requestAudioFocus(
      { change -> handleAudioFocusChange(change) },
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
    try {
      ContextCompat.startForegroundService(context, intent)
      emitDiagnostic("android_foreground_service_status", simpleData("status", "started"))
    } catch (error: Throwable) {
      val data = Arguments.createMap()
      data.putString("message", error.message ?: error.javaClass.simpleName)
      data.putString("name", error.javaClass.simpleName)
      emitDiagnostic("android_foreground_service_start_failed", data)
    }
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
    syncMediaSession()
  }

  private fun emitProgress() {
    val progressBody = Arguments.createMap()
    progressBody.putString("type", "progress")
    progressBody.putMap("progress", progress())
    emit("HiddenAudioProgress", progressBody)

    val progressChangedBody = Arguments.createMap()
    progressChangedBody.putString("type", "progress")
    progressChangedBody.putMap("progress", progress())
    emit("HiddenAudioProgressChanged", progressChangedBody)
  }

  private fun emitTrackChanged() {
    val body = Arguments.createMap()
    body.putString("type", "track_changed")
    if (activeTrack != null) body.putMap("track", freshActiveTrackMap())
    body.putInt("index", activeIndex)
    emit("HiddenAudioTrackChanged", body)
  }


  private fun copyWritableMap(source: ReadableMap): WritableMap {
    val copy = Arguments.createMap()
    val iterator = source.entryIterator
    while (iterator.hasNext()) {
      val entry = iterator.next()
      val key = entry.key
      when (val value = entry.value) {
        null -> copy.putNull(key)
        is Boolean -> copy.putBoolean(key, value)
        is Int -> copy.putInt(key, value)
        is Double -> copy.putDouble(key, value)
        is String -> copy.putString(key, value)
        is ReadableMap -> copy.putMap(key, copyWritableMap(value))
        is ReadableArray -> copy.putArray(key, copyReadableArray(value))
        is Number -> copy.putDouble(key, value.toDouble())
      }
    }
    return copy
  }

  private fun copyReadableArray(source: ReadableArray): WritableArray {
    val copy = Arguments.createArray()
    for (index in 0 until source.size()) {
      when (source.getType(index)) {
        ReadableType.Null -> copy.pushNull()
        ReadableType.Boolean -> copy.pushBoolean(source.getBoolean(index))
        ReadableType.Number -> copy.pushDouble(source.getDouble(index))
        ReadableType.String -> copy.pushString(source.getString(index))
        ReadableType.Map -> copy.pushMap(copyWritableMap(source.getMap(index)!!))
        ReadableType.Array -> copy.pushArray(copyReadableArray(source.getArray(index)!!))
      }
    }
    return copy
  }

  private fun emitDiagnostic(eventName: String, data: WritableMap = Arguments.createMap()) {
    val body = Arguments.createMap()
    body.putString("type", "diagnostic")
    body.putString("eventName", eventName)
    body.putMap("data", copyWritableMap(data))
    emit("HiddenAudioDiagnostic", body)
  }

  private fun simpleData(key: String, value: String): WritableMap {
    val data = Arguments.createMap()
    data.putString(key, value)
    return data
  }

  private fun emit(eventName: String, body: WritableMap) {
    val context = reactContext ?: return
    if (!context.hasActiveReactInstance()) return
    try {
      context
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, body)
    } catch (_: Throwable) {
      // React instance may be tearing down; never crash the process for bridge emits.
    }
  }

  fun emitAutoDiagnostic(eventName: String, data: WritableMap = Arguments.createMap()) {
    emitDiagnostic(eventName, data)
  }

  fun playForcedFromSession() {
    val context = reactContext ?: return
    ensurePlayer(context)
    if (player?.isPlaying == true) {
      emitDiagnostic("android_auto_play_forced", simpleData("state", "already_playing"))
      syncMediaSession()
      return
    }
    play()
  }

  fun pauseForcedFromSession() {
    if (player?.isPlaying != true && player?.playWhenReady != true) {
      playerStatus = "paused"
      player?.pause()
      player?.playWhenReady = false
      emitDiagnostic("android_auto_pause_forced", simpleData("state", "already_paused"))
      syncMediaSession()
      return
    }
    pause()
  }

  fun playFromAutoMediaId(mediaId: String) {
    val context = reactContext
    val track = HiddenAudioAutoCatalog.getTrack(mediaId)
    if (context != null && track != null) {
      try {
        val trackMap = HiddenAudioAutoCatalog.trackToWritableMap(track)
        loadTrack(context, trackMap)
        playForcedFromSession()
      } catch (error: Throwable) {
        val data = Arguments.createMap()
        data.putString("mediaId", mediaId)
        data.putString("message", error.message ?: "load_failed")
        emitDiagnostic("android_auto_media_session_error", data)
      }
    }
    emitRemoteCommand("play_from_media_id", mediaId)
  }

  fun emitRemoteCommand(command: String, mediaId: String? = null) {
    val data = Arguments.createMap()
    data.putString("command", command)
    if (!mediaId.isNullOrBlank()) {
      data.putString("mediaId", mediaId)
    }
    emitDiagnostic("android_remote_command_received", data)
    val forwardedData = Arguments.createMap()
    forwardedData.putString("command", command)
    if (!mediaId.isNullOrBlank()) {
      forwardedData.putString("mediaId", mediaId)
    }
    emitDiagnostic("remote_command_dispatched_to_js", forwardedData)
  }

  private fun syncMediaSession() {
    val exo = player
    val track = activeTrack
    HiddenAudioMediaSessionManager.syncFromPlayer(
      title = track?.title ?: "Hidden Tunes",
      artist = track?.artist ?: "Hidden Tunes",
      album = track?.album ?: "",
      artworkUrl = track?.artworkUrl ?: "",
      durationSeconds = track?.durationSeconds ?: 0.0,
      positionSeconds = (exo?.currentPosition?.coerceAtLeast(0) ?: 0L) / 1000.0,
      player = exo,
      status = playerStatus
    )
  }

}
