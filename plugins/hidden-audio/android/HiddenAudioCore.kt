package com.hiddentunes.app.audio

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
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
    val durationSeconds: Double,
    val mediaId: String = "",
    val contentType: String = "music",
    val isLive: Boolean = false
  )

  private var reactContext: ReactApplicationContext? = null
  private var applicationContext: Context? = null
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
  private const val TASK_REMOVED_PREFS = "hidden_audio_task_removed"
  private const val TASK_REMOVED_KEY = "dismissed"

  private var lastAppBackgroundAtMs = 0L
  private var androidAutoBrowserClients = 0

  private var hasAudioFocus = false
  private var shouldPlayWhenReady = false
  private var backgroundPlaybackIntended = false
  /**
   * Legacy interruption latch kept in sync with the call state machine so
   * existing recovery gates continue to work.
   */
  private var phoneCallInterruptionActive = false
  /** True after explicit Recents swipe-away until the next user play/load. */
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
  private var firstAudioPlayingEmittedForSession = false
  private var continuousTapStartedAtMs = 0L
  private var continuousCommandSource = "unknown"
  private var isVolumeDucked = false
  private var unduckedVolume = 1.0f
  private var loadTrackCallCountForSession = 0
  private var prepareCallCountForSession = 0
  private var playCallCountForSession = 0
  private var automaticPauseCallCountForSession = 0
  private var lastEmittedProgressPositionMs = -1L
  private var lastEmittedProgressStatus = ""
  private var lastEmittedProgressIsPlaying = false
  private var lastJsDiagnosticEmitAtMs = 0L
  private const val PROGRESS_LOOP_INTERVAL_MS = 1000L
  private const val PROGRESS_EMIT_MIN_DELTA_MS = 400L
  private const val JS_DIAGNOSTIC_MIN_INTERVAL_MS = 250L

  private enum class CallState {
    IDLE,
    RINGING,
    OFFHOOK
  }

  private var callState = CallState.IDLE
  private var callInterruptionGeneration = 0L
  private var pausedByCall = false
  private var userOverrideDuringCall = false
  private var userPausedDuringCall = false
  private var wasPlayingBeforeCall = false
  private var interruptedMediaKey: String? = null
  private var interruptedPositionMs = 0L
  private var taskRemovalShutdown = false
  private const val HTTP_USER_AGENT = "HiddenTunes/1.0 (Linux; Android)"
  private const val CONTINUOUS_TRACE_TAG = "HTAndroidContinuousPlayback"
  private const val LIFECYCLE_TRACE_TAG = "HTAndroidLifecycle"
  /**
   * HiddenAudio owns audio focus via [requestAudioFocus]. ExoPlayer must NOT also
   * handle focus — dual ownership causes LOSS↔GAIN churn and a play/pause loop.
   */
  private const val EXOPLAYER_HANDLES_AUDIO_FOCUS = false

  fun attachApplicationContext(context: Context) {
    applicationContext = context.applicationContext
    if (audioManager == null) {
      audioManager = context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }
    HiddenAudioAutoCatalog.attachContext(context.applicationContext)
  }

  fun attachReactContext(context: ReactApplicationContext) {
    reactContext = context
    attachApplicationContext(context)
    HiddenAudioPendingCommandQueue.markReactReady(context.hasActiveReactInstance())
  }

  fun setup(context: ReactApplicationContext) {
    attachReactContext(context)
    ensurePlayer(context)
    HiddenAudioAutoCatalog.ensureDefaultCatalog()
    HiddenAudioMediaSessionManager.warmUpForAndroidAuto(context)
    HiddenAudioPendingCommandQueue.markReactReady(true)
    flushPendingRemoteCommands()
    emitDiagnostic("android_hidden_audio_setup_complete")
  }

  fun notifyReactHostReady() {
    HiddenAudioPendingCommandQueue.markReactReady(true)
    flushPendingRemoteCommands()
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
    clearUserDismissedTaskFlag("load_track")
    ensurePlayer(context)
    clearPlaybackCallbacks()
    val sessionId = bumpPlaybackSession()
    committedPlaySessionId = sessionId
    lastLoadTrackAtMs = SystemClock.elapsedRealtime()
    continuousTapStartedAtMs = lastLoadTrackAtMs
    continuousCommandSource = "load_track"
    firstAudioPlayingEmittedForSession = false
    loadTrackCallCountForSession = 0
    prepareCallCountForSession = 0
    playCallCountForSession = 0
    automaticPauseCallCountForSession = 0
    clearAudioFocusDuck(restoreVolume = true)
    // New explicit media selection invalidates any prior call-end resume.
    invalidateCallResumeForNewMediaSelection("load_track")
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
    emitContinuousPlaybackTrace("playback_request_created", "load_track")
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
    if (previousMediaKey != null && previousMediaKey != mediaKey) {
      emitContinuousPlaybackTrace("source_replaced", "load_track", mapOf("previousMediaKey" to previousMediaKey))
    }
    exo.stop()
    exo.clearMediaItems()
    exo.setMediaItem(mediaItem, 0L)
    loadTrackCallCountForSession += 1
    emitContinuousPlaybackTrace("loadTrack_called", "load_track")
    emitContinuousPlaybackTrace("native_media_item_set", "load_track")
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
    preparePlayerOnce(exo, "load_track")
    playerStatus = "ready"
    emitTrackChanged()
    emitState()
  }

  fun play() {
    val context = resolvePlaybackContext() ?: return
    clearUserDismissedTaskFlag("play")
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
    // Idempotent: already outputting or preparing with playWhenReady — do not re-issue play.
    if (
      exoForPlay.isPlaying ||
        (exoForPlay.playWhenReady &&
          (exoForPlay.playbackState == Player.STATE_BUFFERING ||
            exoForPlay.playbackState == Player.STATE_READY) &&
          shouldPlayWhenReady)
    ) {
      continuousCommandSource = "play_idempotent"
      emitContinuousPlaybackTrace(
        "native_play_called",
        "play_idempotent",
        mapOf("skipped" to true, "reason" to "already_playing_or_buffering")
      )
      startForegroundService()
      startProgressLoop()
      emitState()
      emitProgress()
      return
    }
    lastPlayRequestAtMs = SystemClock.elapsedRealtime()
    if (continuousTapStartedAtMs <= 0L) {
      continuousTapStartedAtMs = lastPlayRequestAtMs
    }
    continuousCommandSource = "play"
    noteExplicitUserPlayCommand("play")
    clearAudioFocusDuck(restoreVolume = true)
    HiddenAudioMediaSessionManager.activateSessionForAuto(context, "native_play")
    emitAudioRouteDiagnostic("native_play")
    emitContinuousPlaybackTrace("audio_focus_requested", "play")
    requestAudioFocus()
    shouldPlayWhenReady = true
    startForegroundService()
    player?.playWhenReady = true
    when (player?.playbackState) {
      Player.STATE_IDLE -> preparePlayerOnce(player!!, "play_idle")
      Player.STATE_ENDED -> {
        player?.seekTo(0)
        preparePlayerOnce(player!!, "play_ended")
      }
    }
    playCallCountForSession += 1
    emitContinuousPlaybackTrace("native_play_called", "play")
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
    noteExplicitUserPauseCommand("user_pause")
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
    if (appTaskRemoved || taskRemovalShutdown) return
    val exo = player
    val wasPlaying = exo?.isPlaying == true || exo?.playWhenReady == true || shouldPlayWhenReady
    if (wasPlaying && !markUserPause) {
      wasPlayingBeforeAudioFocusLoss = true
    }
    if (markUserPause) {
      wasPlayingBeforeAudioFocusLoss = false
    }
    // Preserve position: pause only — never stop/clear/seek.
    val positionMsBeforePause = exo?.currentPosition?.coerceAtLeast(0L) ?: 0L
    exo?.pause()
    exo?.playWhenReady = false
    if (permanent) {
      shouldPlayWhenReady = false
      backgroundPlaybackIntended = false
    }
    playerStatus = "paused"
    stopProgressLoop()
    if (!markUserPause) {
      automaticPauseCallCountForSession += 1
    }
    if (source.startsWith("audio_focus")) {
      emitContinuousPlaybackTrace("pause_called", source, mapOf("automatic" to true, "permanent" to permanent, "positionMs" to positionMsBeforePause))
      emitDiagnostic("android_audio_focus_pause_for_interruption", simpleData("source", source))
    } else if (markUserPause) {
      emitContinuousPlaybackTrace("pause_called", source, mapOf("automatic" to false, "permanent" to permanent, "positionMs" to positionMsBeforePause))
      emitDiagnostic("hidden_audio_pause_called", simpleData("source", source))
    } else {
      emitContinuousPlaybackTrace("pause_called", source, mapOf("automatic" to true, "permanent" to permanent, "positionMs" to positionMsBeforePause))
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
    resetCallInterruptionState("stop")
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
    emitLifecycleTrace("audio_focus_abandoned", "stop")
    stopForegroundService()
    // Clear MediaSession metadata so TV/video ownership is not masked by the
    // previous song title after peer stop.
    HiddenAudioMediaSessionManager.clearPresentedState()
    emitDiagnostic("hidden_audio_unload_called")
    emitContinuousPlaybackTrace("stop_called", "stop")
    emitState()
    emitProgress()
  }

  fun seekTo(seconds: Double) {
    val millis = (seconds.coerceAtLeast(0.0) * 1000).toLong()
    player?.seekTo(millis)
    emitProgress()
  }

  fun reassertBackgroundPlayback(reason: String = "background_reassert") {
    syncTaskRemovedFromDisk()
    if (appTaskRemoved || taskRemovalShutdown || phoneCallInterruptionActive) {
      val blocked = Arguments.createMap()
      blocked.putString("reason", reason)
      blocked.putBoolean("appTaskRemoved", appTaskRemoved)
      blocked.putBoolean("taskRemovalShutdown", taskRemovalShutdown)
      blocked.putBoolean("phoneCallInterruptionActive", phoneCallInterruptionActive)
      emitDiagnostic("background_recovery_blocked_by_interruption", blocked)
      emitLifecycleTrace("recovery_blocked", reason, mapOf("reason" to "interruption_or_task_removed"))
      return
    }
    if (isCallActive() && !isCallResumeEligible() && !userOverrideDuringCall) {
      emitLifecycleTrace("recovery_blocked", reason, mapOf("reason" to "call_not_eligible"))
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
      emitContinuousPlaybackTrace("audio_focus_requested", "reassert_$reason")
      requestAudioFocus()
    }
    startForegroundService()
    if (player?.playbackState == Player.STATE_IDLE) {
      preparePlayerOnce(player!!, "reassert_$reason")
    }
    player?.playWhenReady = true
    playCallCountForSession += 1
    emitContinuousPlaybackTrace("play_called", "reassert_$reason")
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
    val bufferedMs = exo?.bufferedPosition?.coerceAtLeast(0) ?: 0L
    progress.putDouble("bufferedSeconds", bufferedMs / 1000.0)
    progress.putDouble("bufferedPosition", bufferedMs / 1000.0)
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
      // Single focus owner: manual AudioFocusRequest only. ExoPlayer must not also own focus.
      player = ExoPlayer.Builder(context)
        .setMediaSourceFactory(buildMediaSourceFactory(context))
        .setAudioAttributes(audioAttributes, EXOPLAYER_HANDLES_AUDIO_FOCUS)
        .setHandleAudioBecomingNoisy(true)
        .build()
      val attributesData = Arguments.createMap()
      attributesData.putInt("usage", androidx.media3.common.C.USAGE_MEDIA)
      attributesData.putInt("contentType", androidx.media3.common.C.AUDIO_CONTENT_TYPE_MUSIC)
      attributesData.putBoolean("handleAudioFocus", EXOPLAYER_HANDLES_AUDIO_FOCUS)
      attributesData.putBoolean("handleAudioBecomingNoisy", true)
      attributesData.putBoolean("manualAudioFocusOwner", true)
      emitDiagnostic("android_audio_attributes_configured", attributesData)
    } else {
      // Do not re-set audio attributes on every ensurePlayer — that rebinds focus handling.
      HiddenAudioMediaSessionManager.ensureSession(context)
      return
    }

    val exoPlayer = player ?: return

    exoPlayer.addListener(object : Player.Listener {
      override fun onPlaybackStateChanged(playbackState: Int) {
        when (playbackState) {
          Player.STATE_IDLE -> {
            if (playerStatus != "stopped") playerStatus = "idle"
            emitPlaybackStateDiagnostic("android_player_state_idle", playbackState)
            emitContinuousPlaybackTrace("native_state_changed", "player_listener", mapOf("playbackState" to "idle"))
          }
          Player.STATE_BUFFERING -> {
            playerStatus = "buffering"
            emitPlaybackStateDiagnostic("android_player_state_buffering", playbackState)
            emitContinuousPlaybackTrace("buffering_started", "player_listener")
            emitContinuousPlaybackTrace("native_state_changed", "player_listener", mapOf("playbackState" to "buffering"))
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
            emitContinuousPlaybackTrace("native_ready", "player_listener")
            emitContinuousPlaybackTrace("buffering_ended", "player_listener")
            emitContinuousPlaybackTrace("native_state_changed", "player_listener", mapOf("playbackState" to "ready"))
          }
          Player.STATE_ENDED -> {
            emitPlaybackStateDiagnostic("android_player_state_ended", playbackState)
            emitContinuousPlaybackTrace("playback_ended", "player_listener")
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
        emitContinuousPlaybackTrace(
          "native_is_playing_changed",
          "player_listener",
          mapOf("isPlaying" to isPlaying)
        )
        if (isPlaying) {
          lastPlayingStartedAtMs = SystemClock.elapsedRealtime()
          if (!firstAudioPlayingEmittedForSession) {
            firstAudioPlayingEmittedForSession = true
            emitContinuousPlaybackTrace("first_audio_playing", "player_listener")
          }
        } else if (shouldPlayWhenReady) {
          val exo = player
          // BUFFERING / preparing with playWhenReady=true is NOT paused — never echo play().
          if (exo?.playWhenReady == true) {
            playerStatus = when (exo.playbackState) {
              Player.STATE_BUFFERING -> "buffering"
              Player.STATE_READY -> "buffering"
              else -> "buffering"
            }
            emitPlaybackStateDiagnostic(
              "android_player_is_playing_changed",
              exo.playbackState
            )
            emitDiagnostic(
              "android_player_state_changed",
              simpleData("state", playerStatus)
            )
            startProgressLoop()
            emitState()
            emitProgress()
            return
          }
          // Real focus interruption: wait for AUDIOFOCUS_GAIN; do not fight it with recover.
          if (phoneCallInterruptionActive) {
            playerStatus = "paused"
            stopProgressLoop()
            emitPlaybackStateDiagnostic(
              "android_player_is_playing_changed",
              exo?.playbackState ?: Player.STATE_IDLE
            )
            emitDiagnostic("android_player_state_changed", simpleData("state", playerStatus))
            emitState()
            emitProgress()
            return
          }
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
        emitContinuousPlaybackTrace(
          "player_error",
          "player_listener",
          mapOf(
            "message" to (error.message ?: "unknown"),
            "errorCodeName" to error.errorCodeName
          )
        )
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

  private fun preparePlayerOnce(exo: ExoPlayer, reason: String) {
    val state = exo.playbackState
    if (state == Player.STATE_BUFFERING || state == Player.STATE_READY) {
      emitContinuousPlaybackTrace(
        "native_prepare_called",
        reason,
        mapOf("skipped" to true, "playbackState" to playbackStateName(state))
      )
      return
    }
    prepareCallCountForSession += 1
    emitContinuousPlaybackTrace("native_prepare_called", reason)
    exo.prepare()
  }

  private fun applyAudioFocusDuck() {
    val exo = player ?: return
    if (!isVolumeDucked) {
      unduckedVolume = exo.volume.coerceIn(0.05f, 1.0f)
      isVolumeDucked = true
    }
    exo.volume = (unduckedVolume * 0.2f).coerceIn(0.05f, 1.0f)
    emitDiagnostic("android_audio_focus_duck_applied", simpleData("volume", exo.volume.toString()))
  }

  private fun clearAudioFocusDuck(restoreVolume: Boolean) {
    if (!isVolumeDucked) return
    if (restoreVolume) {
      player?.volume = unduckedVolume.coerceIn(0.05f, 1.0f)
    }
    isVolumeDucked = false
    emitDiagnostic("android_audio_focus_duck_cleared")
  }

  private fun isCallActive(): Boolean = callState != CallState.IDLE

  private fun isCallResumeEligible(): Boolean {
    if (taskRemovalShutdown || appTaskRemoved) return false
    if (userPausedDuringCall) return false
    if (userOverrideDuringCall) return false
    if (!pausedByCall) return false
    if (!wasPlayingBeforeCall) return false
    if (callState == CallState.IDLE && interruptedMediaKey == null) return false
    if (interruptedMediaKey != null && interruptedMediaKey != loadedMediaKey) return false
    return true
  }

  private fun shouldSuppressTransientPauseForUserOverride(): Boolean {
    return isCallActive() && userOverrideDuringCall && !userPausedDuringCall
  }

  private fun beginTransientCallLikeInterruption(source: String) {
    val exo = player
    val wasPlaying = exo?.isPlaying == true || exo?.playWhenReady == true || shouldPlayWhenReady
    if (isCallActive() && pausedByCall && !userOverrideDuringCall) {
      // Duplicate focus event for same call — pause once only.
      emitLifecycleTrace("call_duplicate_pause_suppressed", source)
      phoneCallInterruptionActive = true
      return
    }
    callInterruptionGeneration += 1L
    callState = CallState.OFFHOOK
    wasPlayingBeforeCall = wasPlaying
    pausedByCall = wasPlaying
    userOverrideDuringCall = false
    userPausedDuringCall = false
    interruptedMediaKey = loadedMediaKey
    interruptedPositionMs = exo?.currentPosition?.coerceAtLeast(0L) ?: 0L
    phoneCallInterruptionActive = wasPlaying
    wasPlayingBeforeAudioFocusLoss = wasPlaying
    emitLifecycleTrace(
      if (wasPlaying) "call_off_hook" else "call_idle",
      source,
      mapOf(
        "pausedByCall" to pausedByCall,
        "wasPlayingBeforeCall" to wasPlayingBeforeCall,
        "interruptedPositionMs" to interruptedPositionMs
      )
    )
  }

  private fun noteExplicitUserPlayCommand(source: String) {
    if (isCallActive()) {
      userOverrideDuringCall = true
      pausedByCall = false
      userPausedDuringCall = false
      phoneCallInterruptionActive = false
      emitLifecycleTrace("explicit_user_play", source)
    } else {
      phoneCallInterruptionActive = false
    }
  }

  private fun noteExplicitUserPauseCommand(source: String) {
    if (isCallActive()) {
      userPausedDuringCall = true
      pausedByCall = false
      wasPlayingBeforeCall = false
      phoneCallInterruptionActive = false
      emitLifecycleTrace("explicit_user_pause", source)
    }
  }

  private fun invalidateCallResumeForNewMediaSelection(source: String) {
    if (!isCallActive() && interruptedMediaKey == null && !pausedByCall) return
    callInterruptionGeneration += 1L
    pausedByCall = false
    wasPlayingBeforeCall = false
    userOverrideDuringCall = true
    userPausedDuringCall = false
    interruptedMediaKey = null
    interruptedPositionMs = 0L
    phoneCallInterruptionActive = false
    wasPlayingBeforeAudioFocusLoss = false
    emitLifecycleTrace("call_resume_invalidated_new_media", source)
  }

  private fun endCallInterruptionWithoutResume(reason: String) {
    phoneCallInterruptionActive = false
    resetCallInterruptionState(reason)
  }

  private fun resetCallInterruptionState(reason: String) {
    callState = CallState.IDLE
    pausedByCall = false
    userOverrideDuringCall = false
    userPausedDuringCall = false
    wasPlayingBeforeCall = false
    interruptedMediaKey = null
    interruptedPositionMs = 0L
    phoneCallInterruptionActive = false
    emitLifecycleTrace("call_idle", reason)
  }

  private fun urlIdentity(url: String): String {
    if (url.isBlank()) return ""
    return try {
      val uri = Uri.parse(url)
      "${uri.scheme ?: ""}://${uri.host ?: ""}${uri.path ?: ""}"
    } catch (_: Throwable) {
      url.take(96)
    }
  }

  private fun putCallFields(data: WritableMap) {
    data.putString("callState", callState.name.lowercase())
    data.putDouble("callInterruptionGeneration", callInterruptionGeneration.toDouble())
    data.putBoolean("pausedByCall", pausedByCall)
    data.putBoolean("userOverrideDuringCall", userOverrideDuringCall)
    data.putBoolean("userPausedDuringCall", userPausedDuringCall)
    data.putBoolean("callResumeEligible", isCallResumeEligible())
    data.putBoolean("wasPlayingBeforeCall", wasPlayingBeforeCall)
    data.putBoolean("taskRemovalShutdown", taskRemovalShutdown)
    data.putString("interruptedMediaKey", interruptedMediaKey ?: "")
    data.putDouble("interruptedPositionMs", interruptedPositionMs.toDouble())
  }

  private fun emitLifecycleTrace(
    event: String,
    commandSource: String,
    extras: Map<String, Any?> = emptyMap()
  ) {
    val nowMs = SystemClock.elapsedRealtime()
    val exo = player
    val track = activeTrack
    val data = Arguments.createMap()
    data.putString("event", event)
    data.putString("commandSource", commandSource.ifBlank { continuousCommandSource })
    data.putDouble("requestId", playbackSessionId.toDouble())
    data.putString("canonicalMediaId", loadedMediaKey ?: track?.id ?: "")
    data.putString("mediaDomain", track?.contentType ?: "music")
    data.putDouble("nativePlayerInstanceId", System.identityHashCode(exo).toDouble())
    data.putString("currentPlaybackState", playerStatus)
    data.putBoolean("playWhenReady", exo?.playWhenReady == true)
    data.putBoolean("isPlaying", exo?.isPlaying == true)
    data.putBoolean("isBuffering", exo?.playbackState == Player.STATE_BUFFERING || playerStatus == "buffering")
    data.putDouble("currentPositionMs", (exo?.currentPosition ?: 0L).toDouble())
    data.putDouble("bufferedPositionMs", (exo?.bufferedPosition ?: 0L).toDouble())
    data.putDouble("durationMs", (exo?.duration?.coerceAtLeast(0L) ?: 0L).toDouble())
    data.putBoolean("hasAudioFocus", hasAudioFocus)
    data.putBoolean("phoneCallInterruptionActive", phoneCallInterruptionActive)
    putCallFields(data)
    data.putDouble("timestamp", nowMs.toDouble())
    data.putDouble(
      "elapsedMsFromTap",
      if (continuousTapStartedAtMs > 0L) elapsedSince(continuousTapStartedAtMs, nowMs).toDouble() else -1.0
    )
    for ((key, value) in extras) {
      when (value) {
        null -> data.putNull(key)
        is Boolean -> data.putBoolean(key, value)
        is Int -> data.putInt(key, value)
        is Long -> data.putDouble(key, value.toDouble())
        is Float -> data.putDouble(key, value.toDouble())
        is Double -> data.putDouble(key, value)
        is String -> data.putString(key, value)
        else -> data.putString(key, value.toString())
      }
    }
    Log.i(LIFECYCLE_TRACE_TAG, "$event $data")
    emitJsDiagnosticThrottled("ht_android_lifecycle", data)
  }

  private fun emitContinuousPlaybackTrace(
    event: String,
    commandSource: String,
    extras: Map<String, Any?> = emptyMap()
  ) {
    val nowMs = SystemClock.elapsedRealtime()
    val exo = player
    val track = activeTrack
    val data = Arguments.createMap()
    data.putString("event", event)
    data.putDouble("requestId", playbackSessionId.toDouble())
    data.putString("songId", track?.id ?: "")
    data.putString("canonicalSongIdentity", loadedMediaKey ?: track?.id ?: "")
    data.putDouble("nativeSessionId", playbackSessionId.toDouble())
    data.putDouble("playerInstanceId", System.identityHashCode(exo).toDouble())
    data.putString("commandSource", commandSource.ifBlank { continuousCommandSource })
    data.putString("jsPlaybackState", playerStatus)
    data.putString("nativePlaybackState", playbackStateName(exo?.playbackState ?: Player.STATE_IDLE))
    data.putBoolean("isPlaying", exo?.isPlaying == true)
    data.putBoolean(
      "isBuffering",
      exo?.playbackState == Player.STATE_BUFFERING || playerStatus == "buffering"
    )
    data.putBoolean("playWhenReady", exo?.playWhenReady == true)
    data.putBoolean("shouldPlayWhenReady", shouldPlayWhenReady)
    data.putBoolean("hasAudioFocus", hasAudioFocus)
    data.putBoolean("phoneCallInterruptionActive", phoneCallInterruptionActive)
    putCallFields(data)
    data.putBoolean("isVolumeDucked", isVolumeDucked)
    data.putString("appState", if (lastAppBackgroundAtMs > 0L) "may_be_background" else "foreground_or_unknown")
    data.putDouble("currentPositionMs", (exo?.currentPosition ?: 0L).toDouble())
    data.putDouble("bufferedPositionMs", (exo?.bufferedPosition ?: 0L).toDouble())
    data.putDouble("durationMs", (exo?.duration?.coerceAtLeast(0L) ?: 0L).toDouble())
    data.putString("sourceUrlIdentity", urlIdentity(track?.url ?: ""))
    data.putDouble("timestamp", nowMs.toDouble())
    data.putDouble(
      "elapsedMsFromTap",
      if (continuousTapStartedAtMs > 0L) elapsedSince(continuousTapStartedAtMs, nowMs).toDouble() else -1.0
    )
    data.putInt("loadTrackCalls", loadTrackCallCountForSession)
    data.putInt("prepareCalls", prepareCallCountForSession)
    data.putInt("playCalls", playCallCountForSession)
    data.putInt("automaticPauseCalls", automaticPauseCallCountForSession)
    for ((key, value) in extras) {
      when (value) {
        null -> data.putNull(key)
        is Boolean -> data.putBoolean(key, value)
        is Int -> data.putInt(key, value)
        is Long -> data.putDouble(key, value.toDouble())
        is Float -> data.putDouble(key, value.toDouble())
        is Double -> data.putDouble(key, value)
        is String -> data.putString(key, value)
        else -> data.putString(key, value.toString())
      }
    }
    Log.i(CONTINUOUS_TRACE_TAG, "$event $data")
    emitJsDiagnosticThrottled("ht_android_continuous_playback", data)
  }

  private fun isDebuggableBuild(): Boolean {
    val context = applicationContext ?: reactContext ?: return false
    return try {
      (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    } catch (_: Throwable) {
      false
    }
  }

  /**
   * Keep Logcat traces always; only bridge to JS in debuggable builds and
   * rate-limit to avoid heating the JS thread during bursty state transitions.
   */
  private fun emitJsDiagnosticThrottled(eventName: String, data: WritableMap) {
    if (!isDebuggableBuild()) return
    val nowMs = SystemClock.elapsedRealtime()
    if (nowMs - lastJsDiagnosticEmitAtMs < JS_DIAGNOSTIC_MIN_INTERVAL_MS) return
    lastJsDiagnosticEmitAtMs = nowMs
    emitDiagnostic(eventName, data)
  }

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
    val mediaId = track.getStringSafe("mediaId", "")
    val contentType = track.getStringSafe("contentType", "music")
    val isLive =
      if (track.hasKey("isLive") && !track.isNull("isLive")) track.getBoolean("isLive")
      else contentType.equals("radio", ignoreCase = true)
    return ActiveTrackData(
      id = track.getStringSafe("id", "hidden-audio-track"),
      url = track.getStringSafe("url", ""),
      title = track.getStringSafe("title", "Hidden Tunes"),
      artist = track.getStringSafe("artist", "Hidden Tunes"),
      album = track.getStringSafe("album", ""),
      artworkUrl = track.getStringSafe("artworkUrl", ""),
      durationSeconds = if (isLive) 0.0 else track.getDoubleSafe("durationSeconds", 0.0),
      mediaId = mediaId,
      contentType = contentType,
      isLive = isLive
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
    syncTaskRemovedFromDisk()
    if (appTaskRemoved || taskRemovalShutdown || phoneCallInterruptionActive) {
      val blocked = Arguments.createMap()
      blocked.putString("source", source)
      blocked.putBoolean("appTaskRemoved", appTaskRemoved)
      blocked.putBoolean("taskRemovalShutdown", taskRemovalShutdown)
      blocked.putBoolean("phoneCallInterruptionActive", phoneCallInterruptionActive)
      emitDiagnostic("background_recovery_blocked_by_interruption", blocked)
      emitLifecycleTrace("recovery_blocked", source, mapOf("reason" to "interruption_or_task_removed"))
      return
    }
    if (!shouldPlayWhenReady) return
    val exo = player ?: return
    if (exo.isPlaying && exo.playWhenReady) return
    // Still preparing with intent to play — do not issue another play/prepare.
    if (exo.playWhenReady &&
      (exo.playbackState == Player.STATE_BUFFERING || exo.playbackState == Player.STATE_READY)
    ) {
      playerStatus = "buffering"
      emitContinuousPlaybackTrace(
        "play_called",
        "recover_skipped_buffering",
        mapOf("skipped" to true, "source" to source)
      )
      return
    }
    emitLifecycleTrace("recovery_attempted", source)
    if (!hasAudioFocus) {
      emitContinuousPlaybackTrace("audio_focus_requested", "recover_$source")
      requestAudioFocus()
    }
    startForegroundService()
    if (exo.playbackState == Player.STATE_IDLE) {
      preparePlayerOnce(exo, "recover_$source")
    }
    exo.playWhenReady = true
    playCallCountForSession += 1
    emitContinuousPlaybackTrace("play_called", "recover_$source")
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
        emitContinuousPlaybackTrace("audio_focus_lost", "focus_listener", mapOf("focusChange" to "LOSS"))
        emitLifecycleTrace("audio_focus_loss", "focus_listener")
        emitDiagnostic("android_audio_focus_lost", data)
        if (shouldIgnorePermanentAudioFocusLoss(nowMs)) {
          emitDiagnostic("android_audio_focus_loss_ignored_startup_window", data)
          return
        }
        clearAudioFocusDuck(restoreVolume = true)
        // Permanent loss (another app): pause permanently; not a call-resume case.
        resetCallInterruptionState("permanent_focus_loss")
        phoneCallInterruptionActive = false
        wasPlayingBeforeAudioFocusLoss = false
        postPlaybackCallback {
          pauseForInterruption("audio_focus_loss", permanent = true)
        }
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
        emitContinuousPlaybackTrace("audio_focus_lost", "focus_listener", mapOf("focusChange" to "LOSS_TRANSIENT"))
        emitLifecycleTrace("transient_loss", "focus_listener")
        emitDiagnostic("android_audio_focus_lost", data)
        clearAudioFocusDuck(restoreVolume = true)
        if (shouldSuppressTransientPauseForUserOverride()) {
          emitLifecycleTrace(
            "call_re_pause_suppressed_user_override",
            "focus_listener",
            mapOf("callInterruptionGeneration" to callInterruptionGeneration)
          )
          return
        }
        beginTransientCallLikeInterruption("audio_focus_transient")
        postPlaybackCallback {
          pauseForInterruption("audio_focus_transient", permanent = false)
        }
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
        // Duck only — never pause and never mark a phone-call interruption.
        emitContinuousPlaybackTrace("audio_focus_duck", "focus_listener")
        emitLifecycleTrace("can_duck", "focus_listener")
        emitDiagnostic("android_audio_focus_lost", data)
        applyAudioFocusDuck()
      }
      AudioManager.AUDIOFOCUS_GAIN -> {
        emitContinuousPlaybackTrace("audio_focus_gain", "focus_listener")
        emitLifecycleTrace("focus_gain", "focus_listener")
        emitDiagnostic("android_audio_focus_gained", data)
        clearAudioFocusDuck(restoreVolume = true)
        if (appTaskRemoved || taskRemovalShutdown) {
          emitDiagnostic("android_audio_focus_gain_resume_blocked", simpleData("reason", "app_task_removed"))
          emitLifecycleTrace("recovery_blocked", "focus_gain", mapOf("reason" to "task_removed"))
          return
        }
        if (!isCallResumeEligible() && !wasPlayingBeforeAudioFocusLoss) {
          emitDiagnostic("android_audio_focus_gain_resume_blocked", simpleData("reason", "not_playing_before_interruption"))
          endCallInterruptionWithoutResume("not_playing_before_interruption")
          return
        }
        if (!shouldPlayWhenReady && !isCallResumeEligible()) {
          emitDiagnostic("android_audio_focus_gain_resume_blocked", simpleData("reason", "should_not_play"))
          endCallInterruptionWithoutResume("should_not_play")
          return
        }
        if (userOverrideDuringCall && player?.isPlaying == true) {
          // Explicit Play during call already succeeded — do nothing on call end.
          emitLifecycleTrace("call_end_noop_already_playing", "focus_gain")
          endCallInterruptionWithoutResume("already_playing_user_override")
          return
        }
        if (!isCallResumeEligible() && !wasPlayingBeforeAudioFocusLoss) {
          endCallInterruptionWithoutResume("ineligible")
          return
        }
        emitDiagnostic("android_audio_focus_gain_resume_allowed", data)
        val resumeGeneration = callInterruptionGeneration
        phoneCallInterruptionActive = false
        shouldPlayWhenReady = true
        postPlaybackCallback {
          if (appTaskRemoved || taskRemovalShutdown) {
            emitLifecycleTrace("recovery_blocked", "focus_gain_callback", mapOf("reason" to "task_removed"))
            return@postPlaybackCallback
          }
          if (resumeGeneration != 0L && resumeGeneration != callInterruptionGeneration) {
            emitLifecycleTrace(
              "recovery_blocked",
              "focus_gain_callback",
              mapOf("reason" to "stale_call_generation")
            )
            return@postPlaybackCallback
          }
          if (interruptedMediaKey != null && interruptedMediaKey != loadedMediaKey) {
            emitLifecycleTrace(
              "recovery_blocked",
              "focus_gain_callback",
              mapOf("reason" to "media_replaced")
            )
            resetCallInterruptionState("media_replaced")
            return@postPlaybackCallback
          }
          reassertBackgroundPlayback("audio_focus_gain")
          resetCallInterruptionState("resumed_after_focus_gain")
        }
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
      emitContinuousPlaybackTrace("audio_focus_granted", "request_reused")
      return true
    }

    emitDiagnostic("android_audio_focus_request_start")

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = getOrCreateAudioFocusRequest()
      val result = manager.requestAudioFocus(request)
      hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
      if (hasAudioFocus) {
        emitDiagnostic("android_audio_focus_request_granted")
        emitContinuousPlaybackTrace("audio_focus_granted", "request_new")
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
      emitContinuousPlaybackTrace("audio_focus_granted", "request_legacy")
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
    syncTaskRemovedFromDisk()
    if (appTaskRemoved || taskRemovalShutdown) {
      emitDiagnostic(
        "android_foreground_service_start_blocked_task_removed",
        simpleData("reason", "user_dismissed_recents")
      )
      return
    }
    val context = applicationContext ?: reactContext ?: return
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
    val context = applicationContext ?: reactContext ?: return
    context.stopService(Intent(context, HiddenAudioPlaybackService::class.java))
    emitDiagnostic("android_foreground_service_status", simpleData("status", "stopped"))
  }

  private fun startProgressLoop() {
    stopProgressLoop()
    progressTick = object : Runnable {
      override fun run() {
        emitProgress(force = false)
        mainHandler.postDelayed(this, PROGRESS_LOOP_INTERVAL_MS)
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

  private fun emitProgress(force: Boolean = true) {
    val snapshot = progress()
    val positionSeconds =
      if (snapshot.hasKey("positionSeconds")) snapshot.getDouble("positionSeconds") else 0.0
    val positionMs = (positionSeconds * 1000.0).toLong()
    val status =
      if (snapshot.hasKey("status")) snapshot.getString("status") ?: playerStatus else playerStatus
    val isPlaying =
      if (snapshot.hasKey("isPlaying")) snapshot.getDouble("isPlaying") >= 0.5 else false
    if (
      !force &&
        status == lastEmittedProgressStatus &&
        isPlaying == lastEmittedProgressIsPlaying &&
        kotlin.math.abs(positionMs - lastEmittedProgressPositionMs) < PROGRESS_EMIT_MIN_DELTA_MS
    ) {
      return
    }
    lastEmittedProgressPositionMs = positionMs
    lastEmittedProgressStatus = status
    lastEmittedProgressIsPlaying = isPlaying

    // JS only subscribes to HiddenAudioProgressChanged — avoid duplicate bridge traffic.
    val progressChangedBody = Arguments.createMap()
    progressChangedBody.putString("type", "progress")
    progressChangedBody.putMap("progress", copyWritableMap(snapshot))
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
    if (HiddenAudioMediaSessionManager.isPresentedExternalOwner()) {
      emitRemoteCommand("play")
      return
    }
    val context = resolvePlaybackContext()
    if (context == null) {
      emitRemoteCommand("play")
      return
    }
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

    emitRemoteCommand("play")
  }

  fun skipToNextFromSession() {
    emitAutoDiagnostic("android_auto_next_received")
    if (isReactBridgeLive()) {
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
    if (isReactBridgeLive()) {
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
    if (track.mediaId.isNotBlank()) return track.mediaId
    return HiddenAudioAutoCatalog.findMediaIdByUrl(track.url)
      ?: if (track.id.isNotBlank()) "song:${track.id}" else null
  }

  fun pauseForcedFromSession() {
    if (HiddenAudioMediaSessionManager.isPresentedExternalOwner()) {
      emitRemoteCommand("pause")
      return
    }
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

  fun stopForcedFromSession() {
    if (HiddenAudioMediaSessionManager.isPresentedExternalOwner()) {
      emitRemoteCommand("stop")
      return
    }
    try {
      stop()
    } catch (_: Throwable) {
      emitRemoteCommand("stop")
    }
  }

  /**
   * Android Auto media selection.
   * Prefer the canonical JS playback path when React Native is ready.
   * Native ExoPlayer is only used as cold-start fallback for catalog tracks
   * that already include a stream URL — never a second long-lived player.
   */
  fun playFromAutoMediaId(mediaId: String) {
    val handle = HiddenAudioPlaybackTransaction.begin(mediaId, "play_from_media_id")
    val startData = handle.toDiagnosticMap()
    startData.putString("mediaId", mediaId)
    emitAutoDiagnostic("android_auto_play_from_media_id", startData)
    emitAutoDiagnostic("android_auto_media_selected", startData)

    emitAutoDiagnostic("previous_owner_released", handle.toDiagnosticMap())
    emitAutoDiagnostic("media_owner_claimed", handle.toDiagnosticMap())

    // Canonical path: when JS is live, route through PlayerContext only.
    if (isReactBridgeLive()) {
      emitRemoteCommand("play_from_media_id", mediaId, handle)
      return
    }

    val track = HiddenAudioAutoCatalog.getTrack(mediaId)
    val context = resolvePlaybackContext()
    if (track != null && track.url.isNotBlank() && context != null) {
      if (!HiddenAudioPlaybackTransaction.isCurrent(handle.transactionId)) {
        HiddenAudioPlaybackTransaction.markStaleIgnored(handle.transactionId, "before_native_load")
        return
      }
      try {
        val trackMap = HiddenAudioAutoCatalog.trackToWritableMap(track)
        loadTrackFromAutoCatalog(context, trackMap, track)
        if (!HiddenAudioPlaybackTransaction.isCurrent(handle.transactionId)) {
          HiddenAudioPlaybackTransaction.markStaleIgnored(handle.transactionId, "after_native_load")
          return
        }
        playForcedFromSession()
        emitAutoDiagnostic("canonical_player_invoked", handle.toDiagnosticMap().apply {
          putString("path", "native_cold_start")
          putString("title", track.title)
        })
        val successData = handle.toDiagnosticMap()
        successData.putString("mediaId", mediaId)
        successData.putString("trackId", track.id)
        successData.putString("title", track.title)
        successData.putString("artist", track.artist)
        emitAutoDiagnostic("android_auto_play_from_media_id_success", successData)
        // Do not re-dispatch play_from_media_id — that would double-start when RN wakes.
        return
      } catch (error: Throwable) {
        val failData = handle.toDiagnosticMap()
        failData.putString("mediaId", mediaId)
        failData.putString("trackId", track.id)
        failData.putString("reason", error.message ?: "load_failed")
        emitAutoDiagnostic("android_auto_play_from_media_id_failed", failData)
      }
    }

    // No native URL / no context — wait for JS (bounded pending queue).
    val failData = handle.toDiagnosticMap()
    failData.putString("mediaId", mediaId)
    failData.putString("reason", if (track == null) "track_not_in_catalog" else "awaiting_react_native")
    emitAutoDiagnostic("android_auto_play_from_media_id_failed", failData)
    emitRemoteCommand("play_from_media_id", mediaId, handle)
  }

  private fun loadTrackFromAutoCatalog(
    context: Context,
    trackMap: WritableMap,
    track: HiddenAudioAutoCatalog.AutoTrack
  ) {
    // Prefer ReactApplicationContext path when available.
    val react = reactContext
    if (react != null) {
      loadTrack(react, trackMap)
      // Enrich active track with AA metadata after load.
      activeTrack = activeTrack?.copy(
        mediaId = track.mediaId,
        contentType = track.contentType,
        isLive = track.isLive,
        durationSeconds = if (track.isLive) 0.0 else track.durationSeconds
      )
      return
    }
    // Cold-start without RN: ensure player and load directly.
    ensurePlayer(context)
    clearPlaybackCallbacks()
    val sessionId = bumpPlaybackSession()
    committedPlaySessionId = sessionId
    lastLoadTrackAtMs = SystemClock.elapsedRealtime()
    val nextTrack = ActiveTrackData(
      id = track.id,
      url = track.url,
      title = track.title,
      artist = track.artist,
      album = track.album,
      artworkUrl = track.artworkUrl,
      durationSeconds = if (track.isLive) 0.0 else track.durationSeconds,
      mediaId = track.mediaId,
      contentType = track.contentType,
      isLive = track.isLive
    )
    if (nextTrack.url.isBlank()) {
      throw IllegalArgumentException("HiddenAudio track URL is required")
    }
    val exo = player ?: throw IllegalStateException("HiddenAudio player is not initialized")
    activeTrack = nextTrack
    activeIndex = 0
    playbackEndedHandled = false
    lastPlayingStartedAtMs = 0L
    loadedMediaKey = mediaKeyFor(nextTrack)
    pendingLoadSeekToStart = !track.isLive
    hasReachedReadyForCurrentTrack = false
    val mediaItem = MediaItem.Builder()
      .setUri(Uri.parse(nextTrack.url))
      .setMediaId(nextTrack.mediaId.ifBlank { nextTrack.id })
      .build()
    exo.stop()
    exo.clearMediaItems()
    exo.setMediaItem(mediaItem, 0L)
    if (!track.isLive) {
      forceSeekToStart(exo, emitDiagnostic = true, reason = "auto_cold_load")
    }
    shouldPlayWhenReady = false
    exo.prepare()
    playerStatus = "ready"
    emitState()
  }

  fun emitRemoteCommand(
    command: String,
    mediaId: String? = null,
    handle: HiddenAudioPlaybackTransaction.Handle? = null,
    forcePending: Boolean = false
  ) {
    val tx = handle ?: HiddenAudioPlaybackTransaction.current()
    val data = Arguments.createMap()
    data.putString("command", command)
    if (!mediaId.isNullOrBlank()) {
      data.putString("mediaId", mediaId)
    }
    if (tx != null) {
      data.putDouble("transactionId", tx.transactionId.toDouble())
      data.putString("correlationId", tx.correlationId)
    }
    emitDiagnostic("android_remote_command_received", data)
    emitDiagnostic("remote_command_received", copyWritableMap(data))

    val reactLive = isReactBridgeLive() && !forcePending
    if (reactLive) {
      val forwardedData = Arguments.createMap()
      forwardedData.putString("command", command)
      if (!mediaId.isNullOrBlank()) {
        forwardedData.putString("mediaId", mediaId)
      }
      if (tx != null) {
        forwardedData.putDouble("transactionId", tx.transactionId.toDouble())
        forwardedData.putString("correlationId", tx.correlationId)
      }
      emitDiagnostic("remote_command_dispatched_to_js", forwardedData)
      return
    }

    HiddenAudioPendingCommandQueue.enqueue(
      command = command,
      mediaId = mediaId,
      transactionId = tx?.transactionId ?: 0L,
      correlationId = tx?.correlationId ?: ""
    )
  }

  fun flushPendingRemoteCommands() {
    if (!isReactBridgeLive()) return
    val due = HiddenAudioPendingCommandQueue.drainDue()
    for (pending in due) {
      if (pending.transactionId != 0L &&
        !HiddenAudioPlaybackTransaction.isCurrent(pending.transactionId) &&
        (pending.command == "play_from_media_id" || pending.command == "play")
      ) {
        HiddenAudioPlaybackTransaction.markStaleIgnored(
          pending.transactionId,
          "pending_flush"
        )
        continue
      }
      val data = Arguments.createMap()
      data.putString("command", pending.command)
      if (!pending.mediaId.isNullOrBlank()) {
        data.putString("mediaId", pending.mediaId)
      }
      data.putDouble("transactionId", pending.transactionId.toDouble())
      data.putString("correlationId", pending.correlationId)
      emitDiagnostic("android_remote_command_received", data)
      emitDiagnostic("remote_command_dispatched_to_js", copyWritableMap(data))
    }
  }

  private fun isReactBridgeLive(): Boolean {
    val context = reactContext ?: return false
    return context.hasActiveReactInstance()
  }

  private fun resolvePlaybackContext(): Context? =
    reactContext ?: applicationContext

  private fun HiddenAudioPlaybackTransaction.Handle.toDiagnosticMap(): WritableMap {
    val data = Arguments.createMap()
    data.putDouble("transactionId", transactionId.toDouble())
    data.putString("mediaId", mediaId)
    data.putString("correlationId", correlationId)
    return data
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
    val ctx = resolvePlaybackContext()
    ctx?.let {
      HiddenAudioMediaSessionManager.activateSessionForAuto(it, "sync_media_session")
    }
    HiddenAudioMediaSessionManager.syncFromPlayer(
      title = track?.title ?: "Hidden Tunes",
      artist = track?.artist ?: "Hidden Tunes",
      album = track?.album ?: "",
      artworkUrl = track?.artworkUrl ?: "",
      durationSeconds = if (track?.isLive == true) 0.0 else (track?.durationSeconds ?: 0.0),
      positionSeconds = if (track?.isLive == true) {
        0.0
      } else {
        (exo?.currentPosition?.coerceAtLeast(0) ?: 0L) / 1000.0
      },
      player = exo,
      status = playerStatus,
      mediaId = track?.mediaId ?: "",
      contentType = track?.contentType ?: "",
      isLive = track?.isLive == true
    )
  }


  fun notifyAppBackgrounded() {
    lastAppBackgroundAtMs = SystemClock.elapsedRealtime()
  }

  fun noteAndroidAutoBrowserConnected(clientPackageName: String) {
    androidAutoBrowserClients += 1
    val data = Arguments.createMap()
    data.putString("clientPackageName", clientPackageName)
    data.putInt("connectedClients", androidAutoBrowserClients)
    emitAutoDiagnostic("android_auto_browser_client_connected", data)
  }

  fun noteAndroidAutoBrowserDisconnected() {
    androidAutoBrowserClients = (androidAutoBrowserClients - 1).coerceAtLeast(0)
    val data = Arguments.createMap()
    data.putInt("connectedClients", androidAutoBrowserClients)
    emitAutoDiagnostic("android_auto_browser_client_disconnected", data)
  }

  /** Deliberate Recents clear always stops — never preserve for Android Auto. */
  fun shouldPreservePlaybackAfterTaskRemoved(): Boolean {
    return false
  }

  fun isAppTaskRemoved(): Boolean {
    syncTaskRemovedFromDisk()
    return appTaskRemoved || taskRemovalShutdown
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

  private fun persistTaskRemovedDismissed(dismissed: Boolean) {
    val context = applicationContext ?: reactContext ?: return
    try {
      context
        .getSharedPreferences(TASK_REMOVED_PREFS, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(TASK_REMOVED_KEY, dismissed)
        .apply()
    } catch (_: Throwable) {
      // persistence must never block stop
    }
  }

  private fun syncTaskRemovedFromDisk() {
    if (appTaskRemoved || taskRemovalShutdown) return
    val context = applicationContext ?: reactContext ?: return
    try {
      val dismissed =
        context
          .getSharedPreferences(TASK_REMOVED_PREFS, Context.MODE_PRIVATE)
          .getBoolean(TASK_REMOVED_KEY, false)
      if (dismissed) {
        appTaskRemoved = true
        taskRemovalShutdown = true
      }
    } catch (_: Throwable) {
      // ignore
    }
  }

  private fun clearUserDismissedTaskFlag(source: String) {
    syncTaskRemovedFromDisk()
    if (!appTaskRemoved && !taskRemovalShutdown) return
    appTaskRemoved = false
    taskRemovalShutdown = false
    persistTaskRemovedDismissed(false)
    emitDiagnostic("android_task_removed_cleared", simpleData("source", source))
    emitLifecycleTrace("task_removal_cleared_for_user_play", source)
  }

  /**
   * Explicit Recents swipe-away. Always full shutdown — Android Auto connection
   * must not preserve playback after deliberate task removal. Normal Home/lock
   * backgrounding never reaches here without task removal.
   */
  fun handleTaskRemoved() {
    // Latch shutdown BEFORE stop so recovery/focus-gain / AA reconnect cannot race a restart.
    taskRemovalShutdown = true
    appTaskRemoved = true
    phoneCallInterruptionActive = false
    wasPlayingBeforeAudioFocusLoss = false
    shouldPlayWhenReady = false
    backgroundPlaybackIntended = false
    resetCallInterruptionState("task_removed")
    callInterruptionGeneration += 1L
    emitLifecycleTrace("task_removed", "onTaskRemoved", mapOf("shutdownReason" to "task_removed"))
    emitDiagnostic(
      "android_task_removed",
      Arguments.createMap().apply {
        putBoolean("preservedForAndroidAuto", false)
        putBoolean("taskRemovalShutdown", true)
        putInt("androidAutoBrowserClients", androidAutoBrowserClients)
        if (lastAppBackgroundAtMs > 0L) {
          putDouble(
            "msSinceBackground",
            (SystemClock.elapsedRealtime() - lastAppBackgroundAtMs).toDouble()
          )
        }
      }
    )
    emitDiagnostic("intentional_app_close_detected")
    try {
      val exo = player
      exo?.pause()
      exo?.playWhenReady = false
      playerStatus = "paused"
      stop()
      // Fully release MediaSession so notification/lock-screen cannot resurrect playback.
      HiddenAudioMediaSessionManager.release()
      emitLifecycleTrace("media_session_released", "task_removed")
      emitLifecycleTrace("foreground_service_stopped", "task_removed")
      persistTaskRemovedDismissed(true)
      emitDiagnostic("intentional_app_close_native_stop_success")
    } catch (error: Throwable) {
      persistTaskRemovedDismissed(true)
      taskRemovalShutdown = true
      appTaskRemoved = true
      val data = Arguments.createMap()
      data.putString("message", error.message ?: "task_removed_stop_failed")
      emitDiagnostic("intentional_app_close_native_stop_failed", data)
    }
  }

}