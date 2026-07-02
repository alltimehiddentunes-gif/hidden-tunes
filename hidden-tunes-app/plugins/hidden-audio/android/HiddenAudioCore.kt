package com.hiddentunes.app.audio

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
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
import androidx.media3.common.PlaybackException
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
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
  private var audioFocusChangeListener: AudioManager.OnAudioFocusChangeListener? = null
  private const val AUDIO_FOCUS_STABILITY_WINDOW_MS = 3000L
  private const val TASK_REMOVED_BACKGROUND_GRACE_MS = 3000L
  private var lastAppBackgroundAtMs = 0L

  private var hasAudioFocus = false
  private var shouldPlayWhenReady = false
  private var backgroundPlaybackIntended = false
  private var phoneCallInterruptionActive = false
  private var appTaskRemoved = false
  private var wasPlayingBeforeAudioFocusLoss = false
  private var playbackEndedHandled = false
  private var lastPlayRequestAtMs = 0L
  private var lastReassertRequestAtMs = 0L
  private var lastPlayingStartedAtMs = 0L
  private var lastLoadTrackAtMs = 0L
  private var lastStopRequestAtMs = 0L
  private var playbackSessionId = 0L
  private var committedPlaySessionId = 0L
  private var playbackCallbackGeneration = 0L
  private var loadedMediaKey: String? = null
  private var pendingLoadSeekToStart = false
  private var hasReachedReadyForCurrentTrack = false
  private const val HTTP_USER_AGENT = "HiddenTunes/1.0 (Linux; Android)"

  fun attachReactContext(context: ReactApplicationContext) {
    reactContext = context
    if (audioManager == null) {
      audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }
  }

  fun setup(context: ReactApplicationContext) {
    attachReactContext(context)
    ensurePlayer(context)
    HiddenAudioAutoCatalog.ensureDefaultCatalog()
    HiddenAudioMediaSessionManager.warmUpForAndroidAuto(context)
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

  private fun shouldIgnorePermanentAudioFocusLoss(nowMs: Long): Boolean {
    if (lastPlayRequestAtMs > 0L &&
      elapsedSince(lastPlayRequestAtMs, nowMs) < AUDIO_FOCUS_STABILITY_WINDOW_MS
    ) {
      return true
    }
    if (isInPlaybackProtectionWindow(nowMs)) {
      return true
    }
    if (lastPlayingStartedAtMs <= 0L) {
      return true
    }
    return elapsedSince(lastPlayingStartedAtMs, nowMs) < AUDIO_FOCUS_STABILITY_WINDOW_MS
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
    val nextTrack = trackToMap(track)
    val url = nextTrack.url
    if (url.isBlank()) {
      playerStatus = "error"
      emitDiagnostic("hidden_audio_load_track_failed", simpleData("reason", "missing_url"))
      emitState()
      throw IllegalArgumentException("HiddenAudio track URL is required")
    }
    val mediaKey = mediaKeyFor(nextTrack)
    val previousMediaKey = loadedMediaKey
    val exo = player
      ?: throw IllegalStateException("HiddenAudio player is not initialized")
    val playbackStateBeforeLoad = exo.playbackState
    val sameMediaKeyAlreadyLoadedOrLoading =
      previousMediaKey == mediaKey &&
        (playbackStateBeforeLoad == Player.STATE_BUFFERING ||
          playbackStateBeforeLoad == Player.STATE_READY ||
          playbackStateBeforeLoad == Player.STATE_ENDED)
    val parsedUri = Uri.parse(url)
    val extension = urlPathExtension(url)
    val guessedMimeType = guessMimeTypeFromExtension(extension)
    activeTrack = nextTrack
    activeIndex = 0
    playbackEndedHandled = false
    lastPlayingStartedAtMs = 0L
    loadedMediaKey = mediaKey
    pendingLoadSeekToStart = true
    hasReachedReadyForCurrentTrack = false
    val mediaItem = MediaItem.Builder()
      .setUri(parsedUri)
      .setMediaId(nextTrack.id)
      .build()
    exo.stop()
    exo.clearMediaItems()
    exo.setMediaItem(mediaItem, 0L)
    forceSeekToStart(exo, emitDiagnostic = true, reason = "load_track_set_media_item")
    shouldPlayWhenReady = false
    val urlDiagnostics = Arguments.createMap()
    urlDiagnostics.putString("urlScheme", parsedUri.scheme ?: "")
    urlDiagnostics.putString("urlHost", parsedUri.host ?: "")
    urlDiagnostics.putString("extension", extension)
    urlDiagnostics.putString("guessedMimeType", guessedMimeType)
    urlDiagnostics.putBoolean("hasUrl", url.isNotBlank())
    urlDiagnostics.putInt("urlLength", url.length)
    urlDiagnostics.putString("mediaKey", mediaKey)
    urlDiagnostics.putBoolean("sameMediaKeyAlreadyLoadedOrLoading", sameMediaKeyAlreadyLoadedOrLoading)
    if (previousMediaKey != null) {
      urlDiagnostics.putString("previousMediaKey", previousMediaKey)
    }
    urlDiagnostics.putString(
      "playbackStateBeforeLoad",
      playbackStateName(playbackStateBeforeLoad)
    )
    emitDiagnostic("android_load_track_url_diagnostics", urlDiagnostics)
    exo.prepare()
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
    val exoForPlay = player
    if (url.isBlank() || exoForPlay == null || exoForPlay.mediaItemCount <= 0) {
      playerStatus = "idle"
      emitDiagnostic("hidden_audio_play_failed", simpleData("reason", "missing_loaded_track"))
      emitState()
      throw IllegalStateException("HiddenAudio cannot play without a loaded track")
    }
    lastPlayRequestAtMs = SystemClock.elapsedRealtime()
    phoneCallInterruptionActive = false
    HiddenAudioMediaSessionManager.activateSessionForAuto(context, "native_play")
    emitAudioRouteDiagnostic("native_play")
    requestAudioFocus()
    shouldPlayWhenReady = true
    startForegroundService()
    player?.playWhenReady = true
    when (player?.playbackState) {
      Player.STATE_IDLE -> player?.prepare()
      Player.STATE_ENDED -> {
        player?.seekTo(0)
        player?.prepare()
      }
    }
    player?.play()
    emitDiagnostic("android_auto_native_player_play_called")
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
    pauseForInterruption("user_pause", permanent = true, markUserPause = true)
  }

  fun silenceForManualReplace() {
    val exo = player ?: return
    if (!exo.isPlaying && !exo.playWhenReady && playerStatus != "playing" && playerStatus != "buffering") {
      emitDiagnostic("android_manual_replace_silence_noop", simpleData("status", playerStatus))
      return
    }
    pauseForInterruption("manual_replace_silence", permanent = false, markUserPause = false)
    emitDiagnostic("android_manual_replace_old_audio_silenced")
  }

  private fun pauseForInterruption(
    source: String,
    permanent: Boolean,
    markUserPause: Boolean = false
  ) {
    if (appTaskRemoved) return
    val exo = player
    val wasPlaying = exo?.isPlaying == true || exo?.playWhenReady == true || shouldPlayWhenReady
    if (wasPlaying && !markUserPause) {
      wasPlayingBeforeAudioFocusLoss = true
    }
    if (markUserPause) {
      wasPlayingBeforeAudioFocusLoss = false
    }
    exo?.pause()
    exo?.playWhenReady = false
    if (permanent) {
      shouldPlayWhenReady = false
      backgroundPlaybackIntended = false
    }
    playerStatus = "paused"
    stopProgressLoop()
    if (source.startsWith("audio_focus")) {
      emitDiagnostic("android_audio_focus_pause_for_interruption", simpleData("source", source))
    } else {
      emitDiagnostic("hidden_audio_pause_called", simpleData("source", source))
    }
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
    backgroundPlaybackIntended = false
    phoneCallInterruptionActive = false
    wasPlayingBeforeAudioFocusLoss = false
    playerStatus = "idle"
    activeTrack = null
    activeIndex = 0
    loadedMediaKey = null
    pendingLoadSeekToStart = false
    hasReachedReadyForCurrentTrack = false
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
    if (appTaskRemoved || phoneCallInterruptionActive) {
      val blocked = Arguments.createMap()
      blocked.putString("reason", reason)
      blocked.putBoolean("appTaskRemoved", appTaskRemoved)
      blocked.putBoolean("phoneCallInterruptionActive", phoneCallInterruptionActive)
      emitDiagnostic("background_recovery_blocked_by_interruption", blocked)
      return
    }
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

    val exoForReassert = player
    val alreadyPlaying =
      exoForReassert?.isPlaying == true ||
        (exoForReassert?.playWhenReady == true &&
          (playerStatus == "playing" || playerStatus == "buffering"))

    if (alreadyPlaying) {
      if (!hasAudioFocus) {
        requestAudioFocus()
      }
      startForegroundService()
      syncMediaSession()
      val sessionOnlyData = Arguments.createMap()
      sessionOnlyData.putString("reason", reason)
      sessionOnlyData.putString("status", playerStatus)
      sessionOnlyData.putBoolean("playWhenReady", exoForReassert?.playWhenReady == true)
      sessionOnlyData.putBoolean("isPlaying", exoForReassert?.isPlaying == true)
      emitDiagnostic("android_background_play_reassert_session_only", sessionOnlyData)
      emitState()
      emitProgress()
      return
    }

    val startData = Arguments.createMap()
    startData.putString("reason", reason)
    startData.putString("status", playerStatus)
    startData.putBoolean("playWhenReady", player?.playWhenReady == true)
    startData.putBoolean("isPlaying", player?.isPlaying == true)
    emitDiagnostic("android_background_play_reassert_start", startData)

    lastReassertRequestAtMs = SystemClock.elapsedRealtime()
    backgroundPlaybackIntended = true
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
    val durationMillisForEnd =
      if (exo == null || exo.duration <= 0) 0L else exo.duration.coerceAtLeast(0)
    val positionMillisForEnd = exo?.currentPosition?.coerceAtLeast(0) ?: 0L
    val atEnd =
      playerStatus == "ended" ||
        (durationMillisForEnd > 0 && positionMillisForEnd >= durationMillisForEnd - 500)
    val isPlaying =
      !atEnd &&
        (exo?.isPlaying == true || (exo?.playWhenReady == true && playerStatus == "buffering"))
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

  private fun buildMediaSourceFactory(context: Context): DefaultMediaSourceFactory {
    val httpFactory = DefaultHttpDataSource.Factory()
      .setUserAgent(HTTP_USER_AGENT)
      .setConnectTimeoutMs(20_000)
      .setReadTimeoutMs(20_000)
      .setAllowCrossProtocolRedirects(true)
    val dataSourceFactory = DefaultDataSource.Factory(context.applicationContext, httpFactory)
    return DefaultMediaSourceFactory(dataSourceFactory)
  }

  private fun ensurePlayer(context: Context) {
    val audioAttributes = androidx.media3.common.AudioAttributes.Builder()
      .setUsage(androidx.media3.common.C.USAGE_MEDIA)
      .setContentType(androidx.media3.common.C.AUDIO_CONTENT_TYPE_MUSIC)
      .build()

    val creatingPlayer = player == null
    if (creatingPlayer) {
      player = ExoPlayer.Builder(context)
        .setMediaSourceFactory(buildMediaSourceFactory(context))
        .setAudioAttributes(audioAttributes, true)
        .setHandleAudioBecomingNoisy(true)
        .build()
    } else {
      player?.setAudioAttributes(audioAttributes, true)
    }

    val attributesData = Arguments.createMap()
    attributesData.putInt("usage", androidx.media3.common.C.USAGE_MEDIA)
    attributesData.putInt("contentType", androidx.media3.common.C.AUDIO_CONTENT_TYPE_MUSIC)
    attributesData.putBoolean("handleAudioFocus", true)
    attributesData.putBoolean("handleAudioBecomingNoisy", true)
    emitDiagnostic("android_audio_attributes_configured", attributesData)

    val exoPlayer = player ?: return
    if (!creatingPlayer) {
      HiddenAudioMediaSessionManager.ensureSession(context)
      return
    }

    exoPlayer.addListener(object : Player.Listener {
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
            hasReachedReadyForCurrentTrack = true
            ensureLoadedTrackStartsAtBeginning(playbackState)
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

      override fun onPlayerError(error: PlaybackException) {
        val failedTrack = activeTrack
        val currentPlaybackState = player?.playbackState ?: Player.STATE_IDLE
        val data = Arguments.createMap()
        data.putString("message", error.message ?: "unknown")
        data.putString("errorCodeName", error.errorCodeName)
        data.putInt("errorCode", error.errorCode)
        data.putString("playbackState", playbackStateName(currentPlaybackState))
        data.putBoolean("playWhenReady", player?.playWhenReady == true)
        data.putBoolean("isPlaying", player?.isPlaying == true)
        if (failedTrack != null) {
          data.putString("trackId", failedTrack.id)
          data.putString("trackUrl", failedTrack.url)
        }
        emitDiagnostic("android_player_error", data)
        if (
          error.errorCode ==
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED
        ) {
          emitDiagnostic("android_player_network_connection_failed", data)
        }
        emitDiagnostic(
          "android_player_error_detailed",
          buildDetailedPlayerErrorDiagnostic(error, failedTrack, currentPlaybackState)
        )
        invalidateLoadedTrackAfterSourceError(error.errorCodeName ?: "player_error")
      }
    })
    HiddenAudioMediaSessionManager.ensureSession(context)
    emitDiagnostic("android_exoplayer_initialized")
  }

  private fun handlePlaybackEnded() {
    if (playbackEndedHandled) return
    playbackEndedHandled = true
    val exo = player
    exo?.pause()
    exo?.playWhenReady = false
    shouldPlayWhenReady = false
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


  private fun urlPathExtension(url: String): String {
    val path = Uri.parse(url).path ?: return ""
    val dot = path.lastIndexOf('.')
    if (dot < 0 || dot == path.length - 1) return ""
    return path.substring(dot + 1).lowercase()
  }

  private fun guessMimeTypeFromExtension(extension: String): String = when (extension) {
    "mp3" -> "audio/mpeg"
    "m4a", "mp4" -> "audio/mp4"
    "aac" -> "audio/aac"
    "ogg" -> "audio/ogg"
    "wav" -> "audio/wav"
    else -> if (extension.isBlank()) "unknown" else "application/octet-stream"
  }

  private fun appendCauseChain(error: Throwable?): WritableArray {
    val chain = Arguments.createArray()
    var current = error
    var depth = 0
    while (current != null && depth < 12) {
      val entry = Arguments.createMap()
      entry.putString("className", current.javaClass.name)
      entry.putString("simpleName", current.javaClass.simpleName)
      entry.putString("message", current.message ?: "")
      chain.pushMap(entry)
      current = current.cause
      depth += 1
    }
    return chain
  }

  private fun appendHttpDataSourceDetails(error: Throwable?, data: WritableMap) {
    var current: Throwable? = error
    while (current != null) {
      when (current) {
        is HttpDataSource.InvalidResponseCodeException -> {
          data.putInt("invalidResponseCode", current.responseCode)
          val spec = current.dataSpec
          if (spec != null) {
            data.putString("dataSpecUri", spec.uri.toString())
          }
        }
        is HttpDataSource.HttpDataSourceException -> {
          if (!data.hasKey("dataSpecUri")) {
            val spec = current.dataSpec
            if (spec != null) {
              data.putString("dataSpecUri", spec.uri.toString())
            }
          }
          data.putString("httpDataSourceExceptionType", current.javaClass.simpleName)
        }
      }
      current = current.cause
    }
  }

  private fun buildDetailedPlayerErrorDiagnostic(
    error: PlaybackException,
    failedTrack: ActiveTrackData?,
    currentPlaybackState: Int
  ): WritableMap {
    val data = Arguments.createMap()
    data.putInt("errorCode", error.errorCode)
    data.putString("errorCodeName", error.errorCodeName)
    data.putString("message", error.message ?: "unknown")
    data.putArray("causeChain", appendCauseChain(error))
    appendHttpDataSourceDetails(error, data)
    data.putBoolean("hasReachedReadyForCurrentTrack", hasReachedReadyForCurrentTrack)
    data.putString("playbackState", playbackStateName(currentPlaybackState))
    data.putBoolean("playWhenReady", player?.playWhenReady == true)
    if (failedTrack != null) {
      data.putString("activeTrackId", failedTrack.id)
      data.putString("activeTrackUrlExtension", urlPathExtension(failedTrack.url))
    }
    return data
  }

  private fun mediaKeyFor(track: ActiveTrackData): String = "${track.id}::${track.url}"

  private fun forceSeekToStart(
    exo: ExoPlayer,
    emitDiagnostic: Boolean,
    reason: String
  ) {
    exo.seekTo(0L)
    if (emitDiagnostic) {
      val data = Arguments.createMap()
      data.putString("reason", reason)
      data.putString("mediaKey", loadedMediaKey ?: "")
      emitDiagnostic("android_load_track_seek_to_start", data)
    }
  }

  private fun ensureLoadedTrackStartsAtBeginning(playbackState: Int) {
    if (!pendingLoadSeekToStart || playbackState != Player.STATE_READY) return
    val exo = player ?: return
    pendingLoadSeekToStart = false
    val durationMs = exo.duration.coerceAtLeast(0L)
    val positionMs = exo.currentPosition.coerceAtLeast(0L)
    val atEnd = durationMs > 0L && positionMs >= durationMs - 500L
    if (positionMs > 0L || atEnd) {
      forceSeekToStart(exo, emitDiagnostic = true, reason = "state_ready_position_reset")
    }
  }

  private fun invalidateLoadedTrackAfterSourceError(reason: String) {
    clearPlaybackCallbacks()
    bumpPlaybackSession()
    committedPlaySessionId = 0L
    shouldPlayWhenReady = false
    backgroundPlaybackIntended = false
    playbackEndedHandled = false
    pendingLoadSeekToStart = false
    hasReachedReadyForCurrentTrack = false
    loadedMediaKey = null
    val exo = player
    exo?.stop()
    exo?.clearMediaItems()
    exo?.playWhenReady = false
    activeTrack = null
    activeIndex = 0
    playerStatus = "idle"
    stopProgressLoop()
    val data = Arguments.createMap()
    data.putString("reason", reason)
    emitDiagnostic("android_native_track_invalidated", data)
    emitState()
    emitProgress()
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
    if (appTaskRemoved || phoneCallInterruptionActive) {
      val blocked = Arguments.createMap()
      blocked.putString("source", source)
      blocked.putBoolean("appTaskRemoved", appTaskRemoved)
      blocked.putBoolean("phoneCallInterruptionActive", phoneCallInterruptionActive)
      emitDiagnostic("background_recovery_blocked_by_interruption", blocked)
      return
    }
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
        if (shouldIgnorePermanentAudioFocusLoss(nowMs)) {
          emitDiagnostic("android_audio_focus_loss_ignored_startup_window", data)
          return
        }
        phoneCallInterruptionActive = true
        postPlaybackCallback {
          pauseForInterruption("audio_focus_loss", permanent = true)
        }
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
        emitDiagnostic("android_audio_focus_lost", data)
        phoneCallInterruptionActive = true
        postPlaybackCallback {
          pauseForInterruption("audio_focus_transient", permanent = false)
        }
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
        emitDiagnostic("android_audio_focus_lost", data)
        phoneCallInterruptionActive = true
        postPlaybackCallback {
          pauseForInterruption("audio_focus_duck", permanent = false)
        }
      }
      AudioManager.AUDIOFOCUS_GAIN -> {
        emitDiagnostic("android_audio_focus_gained", data)
        if (appTaskRemoved) {
          emitDiagnostic("android_audio_focus_gain_resume_blocked", simpleData("reason", "app_task_removed"))
          return
        }
        if (!wasPlayingBeforeAudioFocusLoss) {
          emitDiagnostic("android_audio_focus_gain_resume_blocked", simpleData("reason", "not_playing_before_interruption"))
          phoneCallInterruptionActive = false
          return
        }
        if (!shouldPlayWhenReady) {
          emitDiagnostic("android_audio_focus_gain_resume_blocked", simpleData("reason", "should_not_play"))
          phoneCallInterruptionActive = false
          return
        }
        emitDiagnostic("android_audio_focus_gain_resume_allowed", data)
        phoneCallInterruptionActive = false
        postPlaybackCallback { reassertBackgroundPlayback("audio_focus_gain") }
      }
    }
  }

  private fun getOrCreateAudioFocusRequest(): AudioFocusRequest {
    audioFocusRequest?.let { return it }

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
    return request
  }

  private fun requestAudioFocus(): Boolean {
    val manager = audioManager ?: return false

    if (hasAudioFocus) {
      emitDiagnostic("android_audio_focus_request_reused")
      return true
    }

    emitDiagnostic("android_audio_focus_request_start")

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = getOrCreateAudioFocusRequest()
      val result = manager.requestAudioFocus(request)
      hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
      if (hasAudioFocus) {
        emitDiagnostic("android_audio_focus_request_granted")
      } else {
        emitDiagnostic("android_audio_focus_request_failed")
      }
      return hasAudioFocus
    }

    if (audioFocusChangeListener == null) {
      audioFocusChangeListener = AudioManager.OnAudioFocusChangeListener { change ->
        handleAudioFocusChange(change)
      }
    }
    @Suppress("DEPRECATION")
    val result = manager.requestAudioFocus(
      audioFocusChangeListener,
      AudioManager.STREAM_MUSIC,
      AudioManager.AUDIOFOCUS_GAIN
    )
    hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    if (hasAudioFocus) {
      emitDiagnostic("android_audio_focus_request_granted")
    } else {
      emitDiagnostic("android_audio_focus_request_failed")
    }
    return hasAudioFocus
  }

  private fun abandonAudioFocus() {
    val manager = audioManager ?: return
    if (!hasAudioFocus) return

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioFocusRequest?.let { manager.abandonAudioFocusRequest(it) }
    } else {
      @Suppress("DEPRECATION")
      audioFocusChangeListener?.let { manager.abandonAudioFocus(it) }
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

  fun emitAudioRouteDiagnosticForAuto(source: String) {
    emitAudioRouteDiagnostic(source)
  }

  fun playForcedFromSession() {
    val context = reactContext ?: return
    ensurePlayer(context)
    HiddenAudioMediaSessionManager.activateSessionForAuto(context, "auto_play_command")
    emitAudioRouteDiagnostic("auto_play_command")
    if (player?.isPlaying == true) {
      emitDiagnostic("android_auto_play_forced", simpleData("state", "already_playing"))
      syncMediaSession()
      return
    }

    val hasLoadedNativeTrack =
      !activeTrack?.url.isNullOrBlank() && (player?.mediaItemCount ?: 0) > 0
    if (hasLoadedNativeTrack) {
      try {
        play()
        return
      } catch (_: Throwable) {
        // Fall through to catalog / JS recovery below.
      }
    }

    val fallbackMediaId = HiddenAudioAutoCatalog.firstPlayableMediaId()
    if (!fallbackMediaId.isNullOrBlank()) {
      playFromAutoMediaId(fallbackMediaId)
      return
    }

    if (context.hasActiveReactInstance()) {
      emitRemoteCommand("play")
      return
    }

    emitDiagnostic(
      "android_auto_play_forced",
      simpleData("state", "no_loaded_track_or_catalog")
    )
  }

  fun skipToNextFromSession() {
    emitAutoDiagnostic("android_auto_next_received")
    val context = reactContext
    if (context != null && context.hasActiveReactInstance()) {
      emitRemoteCommand("next")
      return
    }

    val nextMediaId = HiddenAudioAutoCatalog.nextPlayableMediaId(activeTrackMediaId())
    if (!nextMediaId.isNullOrBlank()) {
      playFromAutoMediaId(nextMediaId)
      return
    }
    emitRemoteCommand("next")
  }

  fun skipToPreviousFromSession() {
    emitAutoDiagnostic("android_auto_previous_received")
    val context = reactContext
    if (context != null && context.hasActiveReactInstance()) {
      emitRemoteCommand("previous")
      return
    }

    val previousMediaId = HiddenAudioAutoCatalog.previousPlayableMediaId(activeTrackMediaId())
    if (!previousMediaId.isNullOrBlank()) {
      playFromAutoMediaId(previousMediaId)
      return
    }
    emitRemoteCommand("previous")
  }

  private fun activeTrackMediaId(): String? {
    val track = activeTrack ?: return null
    return HiddenAudioAutoCatalog.findMediaIdByUrl(track.url)
      ?: if (track.id.isNotBlank()) "song:${track.id}" else null
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
    val startData = Arguments.createMap()
    startData.putString("mediaId", mediaId)
    emitAutoDiagnostic("android_auto_play_from_media_id", startData)

    val track = HiddenAudioAutoCatalog.getTrack(mediaId)
    if (track == null) {
      val failData = Arguments.createMap()
      failData.putString("mediaId", mediaId)
      failData.putString("reason", "track_not_in_catalog")
      emitAutoDiagnostic("android_auto_play_from_media_id_failed", failData)
      emitRemoteCommand("play_from_media_id", mediaId)
      return
    }

    val context = reactContext
    if (context == null) {
      val failData = Arguments.createMap()
      failData.putString("mediaId", mediaId)
      failData.putString("trackId", track.id)
      failData.putString("reason", "react_context_unavailable")
      emitAutoDiagnostic("android_auto_play_from_media_id_failed", failData)
      emitRemoteCommand("play_from_media_id", mediaId)
      return
    }

    try {
      val trackMap = HiddenAudioAutoCatalog.trackToWritableMap(track)
      loadTrack(context, trackMap)
      playForcedFromSession()
      val successData = Arguments.createMap()
      successData.putString("mediaId", mediaId)
      successData.putString("trackId", track.id)
      successData.putString("title", track.title)
      successData.putString("artist", track.artist)
      emitAutoDiagnostic("android_auto_play_from_media_id_success", successData)
    } catch (error: Throwable) {
      val failData = Arguments.createMap()
      failData.putString("mediaId", mediaId)
      failData.putString("trackId", track.id)
      failData.putString("reason", error.message ?: "load_failed")
      emitAutoDiagnostic("android_auto_play_from_media_id_failed", failData)
      emitDiagnostic("android_auto_media_session_error", failData)
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

  private fun emitAudioRouteDiagnostic(source: String) {
    val manager = audioManager ?: return
    val data = Arguments.createMap()
    data.putString("source", source)
    data.putBoolean("musicActive", manager.isMusicActive)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val outputs = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
      val routeNames = outputs.joinToString(",") { device ->
        "${device.type}:${device.productName}"
      }
      data.putString("outputDevices", routeNames)
      data.putBoolean(
        "hasBluetoothA2dp",
        outputs.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP }
      )
      data.putBoolean(
        "hasBluetoothSco",
        outputs.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }
      )
      data.putBoolean(
        "hasWiredHeadset",
        outputs.any {
          it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
            it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
            it.type == AudioDeviceInfo.TYPE_USB_HEADSET
        }
      )
      data.putBoolean(
        "hasBusOutput",
        outputs.any { it.type == AudioDeviceInfo.TYPE_BUS }
      )
      data.putBoolean(
        "hasHdmi",
        outputs.any {
          it.type == AudioDeviceInfo.TYPE_HDMI ||
            it.type == AudioDeviceInfo.TYPE_HDMI_ARC ||
            it.type == AudioDeviceInfo.TYPE_HDMI_EARC
        }
      )
    }
    emitDiagnostic("android_auto_audio_route_check", data)
  }

  private fun syncMediaSession() {
    val exo = player
    val track = activeTrack
    reactContext?.let {
      HiddenAudioMediaSessionManager.activateSessionForAuto(it, "sync_media_session")
    }
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


  fun notifyAppBackgrounded() {
    lastAppBackgroundAtMs = SystemClock.elapsedRealtime()
  }

  private fun isPlaybackActive(): Boolean {
    if (activeTrack?.url.isNullOrBlank()) return false
    val exo = player ?: return false
    val durationMillisForEnd = if (exo.duration <= 0) 0L else exo.duration.coerceAtLeast(0)
    val positionMillisForEnd = exo.currentPosition.coerceAtLeast(0)
    val atEnd =
      playerStatus == "ended" ||
        (durationMillisForEnd > 0 && positionMillisForEnd >= durationMillisForEnd - 500)
    return !atEnd &&
      (exo.isPlaying || (exo.playWhenReady && playerStatus == "buffering"))
  }

  fun handleTaskRemoved() {
    val nowMs = SystemClock.elapsedRealtime()
    val recentBackground =
      lastAppBackgroundAtMs > 0L &&
      nowMs - lastAppBackgroundAtMs <= TASK_REMOVED_BACKGROUND_GRACE_MS
    if (recentBackground || isPlaybackActive()) {
      emitDiagnostic("android_task_removed_ignored_recent_background")
      return
    }
    appTaskRemoved = true
    phoneCallInterruptionActive = false
    wasPlayingBeforeAudioFocusLoss = false
    emitDiagnostic("android_task_removed")
    emitDiagnostic("intentional_app_close_detected")
    try {
      pauseForInterruption("task_removed", permanent = true)
      stop()
      emitDiagnostic("intentional_app_close_native_stop_success")
    } catch (error: Throwable) {
      val data = Arguments.createMap()
      data.putString("message", error.message ?: "task_removed_stop_failed")
      emitDiagnostic("intentional_app_close_native_stop_failed", data)
    }
  }

}