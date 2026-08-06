package com.hiddentunes.app.audio

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.media3.common.Player
import com.facebook.react.bridge.Arguments

object HiddenAudioMediaSessionManager {
  private var mediaSession: MediaSessionCompat? = null
  private var presentedExternalOwner = false
  private var presentedIsPlaying = false
  private var presentedHasNext = false
  private var presentedHasPrevious = false
  private var canonicalQueueIndex = 0
  private var canonicalQueueSize = 0
  private var presentedIsLive = false
  private var lastPublishedMediaId: String = ""
  private var lastSessionActiveDiagnosticKey: String = ""
  private var lastSessionActiveDiagnosticAtMs: Long = 0L
  private var lastPlaybackStateDiagnosticKey: String = ""
  private var lastPlaybackStateDiagnosticAtMs: Long = 0L

  private const val HOT_DIAGNOSTIC_THROTTLE_MS = 5000L

  private fun shouldEmitHotDiagnostic(key: String, lastKey: String, lastAtMs: Long): Boolean {
    val now = android.os.SystemClock.elapsedRealtime()
    return key != lastKey || now - lastAtMs >= HOT_DIAGNOSTIC_THROTTLE_MS
  }

  fun ensureSession(context: Context) {
    if (mediaSession == null) {
      val appContext = context.applicationContext
      mediaSession = MediaSessionCompat(appContext, "HiddenTunesAutoSession").apply {
        setCallback(sessionCallback)
        setFlags(
          MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
            MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        )
        val mediaButtonIntent = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
          // Canonical single manifest receiver from expo-media-control.
          // Do not point at a second custom MEDIA_BUTTON receiver.
          component = ComponentName(
            appContext,
            androidx.media.session.MediaButtonReceiver::class.java
          )
        }
        val mediaButtonPending = PendingIntent.getBroadcast(
          appContext,
          0,
          mediaButtonIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        setMediaButtonReceiver(mediaButtonPending)
      }
      publishBrowseReadySession()
      HiddenAudioCore.emitAutoDiagnostic("android_auto_service_created")
    }
  }

  fun sessionCompat(): MediaSessionCompat? = mediaSession

  fun isPresentedExternalOwner(): Boolean = presentedExternalOwner

  fun activateSessionForAuto(context: Context, source: String) {
    ensureSession(context)
    val session = mediaSession ?: return
    if (!session.isActive) {
      session.isActive = true
    }
    val diagnosticKey = "$source:${session.isActive}"
    val now = android.os.SystemClock.elapsedRealtime()
    if (shouldEmitHotDiagnostic(diagnosticKey, lastSessionActiveDiagnosticKey, lastSessionActiveDiagnosticAtMs)) {
      lastSessionActiveDiagnosticKey = diagnosticKey
      lastSessionActiveDiagnosticAtMs = now
      val data = Arguments.createMap()
      data.putString("source", source)
      data.putBoolean("isActive", session.isActive)
      HiddenAudioCore.emitAutoDiagnostic("android_media_session_active_for_auto", data)
    }
  }

  fun warmUpForAndroidAuto(context: Context) {
    HiddenAudioCore.attachApplicationContext(context)
    ensureSession(context)
    HiddenAudioAutoCatalog.attachContext(context)
    HiddenAudioAutoCatalog.ensureDefaultCatalog()
    try {
      val intent = Intent(context.applicationContext, HiddenAudioMediaBrowserService::class.java)
      context.applicationContext.startService(intent)
      HiddenAudioCore.emitAutoDiagnostic("android_auto_mbs_warmup_started")
    } catch (error: Throwable) {
      val data = Arguments.createMap()
      data.putString("message", error.message ?: "mbs_warmup_failed")
      HiddenAudioCore.emitAutoDiagnostic("android_auto_mbs_warmup_failed", data)
    }
  }

  private fun publishBrowseReadySession() {
    val session = mediaSession ?: return
    val metadata = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, "Hidden Tunes")
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, "Your music library")
      .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "Browse")
      .build()
    session.setMetadata(metadata)

    val actions = transportActions()

    val state = PlaybackStateCompat.Builder()
      .setActions(actions)
      .setState(PlaybackStateCompat.STATE_PAUSED, 0L, 0f)
      .build()
    session.setPlaybackState(state)
  }

  fun sessionToken(): MediaSessionCompat.Token? = mediaSession?.sessionToken

  fun release() {
    mediaSession?.isActive = false
    mediaSession?.release()
    mediaSession = null
    lastPublishedMediaId = ""
    HiddenAudioCore.emitAutoDiagnostic("media_owner_released")
  }

  /** Wipe title/artist after shared-audio loses global ownership. */
  fun clearPresentedState() {
    presentedExternalOwner = false
    presentedIsPlaying = false
    presentedHasNext = false
    presentedHasPrevious = false
    presentedIsLive = false
    lastPublishedMediaId = ""
    val session = mediaSession ?: return
    val emptyMetadata = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, "")
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, "")
      .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "")
      .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, 0)
      .build()
    session.setMetadata(emptyMetadata)
    val state = PlaybackStateCompat.Builder()
      .setActions(transportActions())
      .setState(PlaybackStateCompat.STATE_STOPPED, 0L, 0f)
      .build()
    session.setPlaybackState(state)
    session.isActive = false
    HiddenAudioCore.emitAutoDiagnostic("media_owner_released")
  }

  /** Present live/external owner (TV) metadata without ExoPlayer. */
  fun setPresentedNowPlaying(
    context: Context,
    title: String,
    artist: String,
    album: String,
    artworkUrl: String,
    isPlaying: Boolean,
    hasNext: Boolean,
    hasPrevious: Boolean
  ) {
    ensureSession(context)
    val session = mediaSession ?: return
    presentedExternalOwner = true
    presentedIsPlaying = isPlaying
    presentedHasNext = hasNext
    presentedHasPrevious = hasPrevious
    presentedIsLive = true
    session.isActive = true

    val metadata = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title.ifBlank { "Live TV" })
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist.ifBlank { "Hidden Tunes TV" })
      .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album.ifBlank { "Hidden Tunes TV" })
      .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, 0L)
      .apply {
        if (artworkUrl.isNotBlank()) {
          putString(MediaMetadataCompat.METADATA_KEY_ART_URI, artworkUrl)
        }
      }
      .build()
    session.setMetadata(metadata)

    val state = PlaybackStateCompat.Builder()
      .setActions(presentedTransportActions())
      .setState(
        if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
        0L,
        if (isPlaying) 1.0f else 0.0f
      )
      .build()
    session.setPlaybackState(state)
  }

  fun updatePresentedPlaybackState(
    isPlaying: Boolean,
    hasNext: Boolean,
    hasPrevious: Boolean
  ) {
    if (!presentedExternalOwner) return
    val session = mediaSession ?: return
    presentedIsPlaying = isPlaying
    presentedHasNext = hasNext
    presentedHasPrevious = hasPrevious
    val state = PlaybackStateCompat.Builder()
      .setActions(presentedTransportActions())
      .setState(
        if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
        0L,
        if (isPlaying) 1.0f else 0.0f
      )
      .build()
    session.setPlaybackState(state)
  }

  fun clearPresentedNowPlaying() {
    if (!presentedExternalOwner) return
    clearPresentedState()
  }

  fun syncFromPlayer(
    title: String,
    artist: String,
    album: String,
    artworkUrl: String,
    durationSeconds: Double,
    positionSeconds: Double,
    player: Player?,
    status: String,
    mediaId: String = "",
    contentType: String = "",
    isLive: Boolean = false
  ) {
    // External presented owner (TV) wins — never republish audio under it.
    if (presentedExternalOwner) return
    val session = mediaSession ?: return
    if (!session.isActive) {
      session.isActive = true
    }

    val safeMediaId = mediaId.trim()
    val live = isLive || contentType.equals("radio", ignoreCase = true)
    presentedIsLive = live

    val metadata = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
      .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
      .putLong(
        MediaMetadataCompat.METADATA_KEY_DURATION,
        if (live) -1L else (durationSeconds.coerceAtLeast(0.0) * 1000).toLong()
      )
      .apply {
        if (safeMediaId.isNotBlank()) {
          putString(MediaMetadataCompat.METADATA_KEY_MEDIA_ID, safeMediaId)
        }
        if (contentType.isNotBlank()) {
          putString(MediaMetadataCompat.METADATA_KEY_GENRE, contentType)
        }
        if (canonicalQueueSize > 0) {
          putLong(MediaMetadataCompat.METADATA_KEY_TRACK_NUMBER, (canonicalQueueIndex + 1).toLong())
          putLong(MediaMetadataCompat.METADATA_KEY_NUM_TRACKS, canonicalQueueSize.toLong())
        }
        // Prefer URI string only — never decode bitmaps repeatedly for radio.
        if (artworkUrl.isNotBlank()) {
          putString(MediaMetadataCompat.METADATA_KEY_ART_URI, artworkUrl)
          putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, artworkUrl)
        }
      }
      .build()
    session.setMetadata(metadata)

    if (safeMediaId.isNotBlank() && safeMediaId != lastPublishedMediaId) {
      lastPublishedMediaId = safeMediaId
      val data = HiddenAudioPlaybackTransaction.diagnosticBase()
      data.putString("title", title)
      data.putString("artist", artist)
      data.putString("contentType", contentType)
      data.putBoolean("isLive", live)
      HiddenAudioCore.emitAutoDiagnostic("metadata_published", data)
    }

    val playbackState = when {
      status == "playing" || player?.isPlaying == true -> PlaybackStateCompat.STATE_PLAYING
      status == "buffering" || player?.playbackState == Player.STATE_BUFFERING ->
        PlaybackStateCompat.STATE_BUFFERING
      status == "paused" -> PlaybackStateCompat.STATE_PAUSED
      status == "ended" -> PlaybackStateCompat.STATE_STOPPED
      else -> PlaybackStateCompat.STATE_PAUSED
    }

    val positionMs =
      if (live) PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN
      else (positionSeconds.coerceAtLeast(0.0) * 1000).toLong()

    val state = PlaybackStateCompat.Builder()
      .setActions(transportActions(live))
      .setState(
        playbackState,
        positionMs,
        if (player?.isPlaying == true) 1.0f else 0.0f
      )
      .build()

    session.setPlaybackState(state)
    val stateKey = "$playbackState|$status|$live"
    val now = android.os.SystemClock.elapsedRealtime()
    if (shouldEmitHotDiagnostic(stateKey, lastPlaybackStateDiagnosticKey, lastPlaybackStateDiagnosticAtMs)) {
      lastPlaybackStateDiagnosticKey = stateKey
      lastPlaybackStateDiagnosticAtMs = now
      val stateData = HiddenAudioPlaybackTransaction.diagnosticBase()
      stateData.putString("status", status)
      stateData.putBoolean("isLive", live)
      HiddenAudioCore.emitAutoDiagnostic("playback_state_published", stateData)
    }
  }

  private fun transportActions(isLive: Boolean = presentedIsLive): Long {
    var actions =
      PlaybackStateCompat.ACTION_PLAY or
        PlaybackStateCompat.ACTION_PAUSE or
        PlaybackStateCompat.ACTION_PLAY_PAUSE or
        PlaybackStateCompat.ACTION_STOP or
        PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID or
        PlaybackStateCompat.ACTION_PLAY_FROM_SEARCH
    if (canonicalQueueIndex + 1 < canonicalQueueSize) {
      actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_NEXT
    }
    if (canonicalQueueIndex > 0 && canonicalQueueSize > 0) {
      actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
    }
    if (!isLive) {
      actions = actions or PlaybackStateCompat.ACTION_SEEK_TO
    }
    return actions
  }

  fun updateRemoteQueueAvailability(activeIndex: Int, queueLength: Int) {
    canonicalQueueSize = queueLength.coerceIn(0, 420)
    canonicalQueueIndex = if (canonicalQueueSize == 0) 0
      else activeIndex.coerceIn(0, canonicalQueueSize - 1)
    val session = mediaSession ?: return
    session.controller.metadata?.let { currentMetadata ->
      val metadataBuilder = MediaMetadataCompat.Builder(currentMetadata)
      if (canonicalQueueSize > 0) {
        metadataBuilder.putLong(MediaMetadataCompat.METADATA_KEY_TRACK_NUMBER,
          (canonicalQueueIndex + 1).toLong())
        metadataBuilder.putLong(MediaMetadataCompat.METADATA_KEY_NUM_TRACKS,
          canonicalQueueSize.toLong())
      }
      session.setMetadata(metadataBuilder.build())
    }
    val current = session.controller.playbackState ?: return
    session.setPlaybackState(PlaybackStateCompat.Builder(current)
      .setActions(transportActions(presentedIsLive)).build())
  }

  private fun presentedTransportActions(): Long {
    var actions =
      PlaybackStateCompat.ACTION_PLAY or
        PlaybackStateCompat.ACTION_PAUSE or
        PlaybackStateCompat.ACTION_PLAY_PAUSE
    if (presentedHasNext) {
      actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_NEXT
    }
    if (presentedHasPrevious) {
      actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
    }
    return actions
  }

  fun reportError(message: String) {
    val data = Arguments.createMap()
    data.putString("message", message)
    HiddenAudioCore.emitAutoDiagnostic("android_auto_media_session_error", data)
  }

  private val sessionCallback = object : MediaSessionCompat.Callback() {
    override fun onPlay() {
      val handle = HiddenAudioPlaybackTransaction.begin("", "remote_play")
      HiddenAudioCore.emitAutoDiagnostic("remote_command_received", Arguments.createMap().apply {
        putString("command", "play")
      })
      if (presentedExternalOwner) {
        HiddenAudioCore.emitRemoteCommand("play", handle = handle)
        return
      }
      HiddenAudioCore.emitAutoDiagnostic("android_auto_play_forced")
      HiddenAudioCore.playForcedFromSession()
    }

    override fun onPause() {
      val handle = HiddenAudioPlaybackTransaction.begin("", "remote_pause")
      HiddenAudioCore.emitAutoDiagnostic("remote_command_received", Arguments.createMap().apply {
        putString("command", "pause")
      })
      if (presentedExternalOwner) {
        HiddenAudioCore.emitRemoteCommand("pause", handle = handle)
        return
      }
      HiddenAudioCore.pauseForcedFromSession()
    }

    override fun onStop() {
      val handle = HiddenAudioPlaybackTransaction.begin("", "remote_stop")
      HiddenAudioCore.emitAutoDiagnostic("remote_command_received", Arguments.createMap().apply {
        putString("command", "stop")
      })
      if (presentedExternalOwner) {
        HiddenAudioCore.emitRemoteCommand("stop", handle = handle)
        return
      }
      HiddenAudioCore.stopForcedFromSession()
    }

    override fun onSkipToNext() {
      if (canonicalQueueIndex + 1 >= canonicalQueueSize) return
      val handle = HiddenAudioPlaybackTransaction.begin("", "remote_next")
      HiddenAudioCore.emitAutoDiagnostic("remote_command_received", Arguments.createMap().apply {
        putString("command", "next")
      })
      if (presentedExternalOwner) {
        HiddenAudioCore.emitRemoteCommand("next", handle = handle)
        return
      }
      HiddenAudioCore.skipToNextFromSession()
    }

    override fun onSkipToPrevious() {
      if (canonicalQueueSize <= 0 || canonicalQueueIndex <= 0) return
      val handle = HiddenAudioPlaybackTransaction.begin("", "remote_previous")
      HiddenAudioCore.emitAutoDiagnostic("remote_command_received", Arguments.createMap().apply {
        putString("command", "previous")
      })
      if (presentedExternalOwner) {
        HiddenAudioCore.emitRemoteCommand("previous", handle = handle)
        return
      }
      HiddenAudioCore.skipToPreviousFromSession()
    }

    override fun onSeekTo(pos: Long) {
      if (presentedExternalOwner || presentedIsLive) {
        // Live TV / live radio presented sessions do not support seek.
        return
      }
      HiddenAudioCore.emitAutoDiagnostic("remote_command_received", Arguments.createMap().apply {
        putString("command", "seek")
        putDouble("positionSeconds", pos.coerceAtLeast(0L) / 1000.0)
      })
      HiddenAudioCore.seekTo(pos.coerceAtLeast(0L) / 1000.0)
    }

    override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
      if (presentedExternalOwner) return
      val safeId = mediaId?.trim().orEmpty()
      if (safeId.isBlank()) return
      HiddenAudioCore.emitAutoDiagnostic("android_auto_media_selected", Arguments.createMap().apply {
        putString("mediaId", safeId)
      })
      HiddenAudioCore.playFromAutoMediaId(safeId)
    }

    override fun onPlayFromSearch(query: String?, extras: Bundle?) {
      if (presentedExternalOwner) return
      val safeQuery = query?.trim().orEmpty()
      HiddenAudioCore.emitAutoDiagnostic("android_auto_search_requested", Arguments.createMap().apply {
        putString("query", safeQuery)
        putString("source", "play_from_search")
      })
      if (safeQuery.isBlank()) {
        HiddenAudioCore.playForcedFromSession()
        return
      }
      val first = HiddenAudioAutoCatalog.search(safeQuery, limit = 24).firstOrNull()
      val playableMediaId = when {
        first == null -> null
        first.playable -> first.mediaId
        else -> HiddenAudioAutoCatalog.firstPlayableDescendant(first.mediaId)
      }
      if (playableMediaId != null) {
        HiddenAudioCore.playFromAutoMediaId(playableMediaId)
      } else {
        HiddenAudioCore.emitRemoteCommand("search_play", safeQuery)
      }
    }

    override fun onCustomAction(action: String?, extras: Bundle?) {
      if (action.isNullOrBlank()) return
      HiddenAudioCore.emitAutoDiagnostic("remote_command_received", Arguments.createMap().apply {
        putString("command", action)
      })
    }
  }
}
