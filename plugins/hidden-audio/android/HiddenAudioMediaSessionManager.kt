package com.hiddentunes.app.audio

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.media3.common.Player
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

object HiddenAudioMediaSessionManager {
  private var mediaSession: MediaSessionCompat? = null

  fun ensureSession(context: Context) {
    if (mediaSession != null) return

    mediaSession = MediaSessionCompat(context.applicationContext, "HiddenTunesAutoSession").apply {
      setCallback(sessionCallback)
      setFlags(
        MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
          MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
      )
      isActive = true
    }
    publishBrowseReadySession()
    HiddenAudioCore.emitAutoDiagnostic("android_auto_session_active")
    HiddenAudioCore.emitAutoDiagnostic("android_auto_service_created")
  }

  fun warmUpForAndroidAuto(context: Context) {
    ensureSession(context)
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

    val actions =
      PlaybackStateCompat.ACTION_PLAY or
        PlaybackStateCompat.ACTION_PAUSE or
        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
        PlaybackStateCompat.ACTION_SEEK_TO or
        PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID

    val state = PlaybackStateCompat.Builder()
      .setActions(actions)
      .setState(PlaybackStateCompat.STATE_NONE, 0L, 0f)
      .build()
    session.setPlaybackState(state)
  }

  fun sessionToken(): MediaSessionCompat.Token? = mediaSession?.sessionToken

  fun release() {
    mediaSession?.isActive = false
    mediaSession?.release()
    mediaSession = null
  }

  fun syncFromPlayer(
    title: String,
    artist: String,
    album: String,
    artworkUrl: String,
    durationSeconds: Double,
    positionSeconds: Double,
    player: Player?,
    status: String
  ) {
    val session = mediaSession ?: return

    val metadata = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
      .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
      .putLong(
        MediaMetadataCompat.METADATA_KEY_DURATION,
        (durationSeconds.coerceAtLeast(0.0) * 1000).toLong()
      )
      .apply {
        if (artworkUrl.isNotBlank()) {
          putString(MediaMetadataCompat.METADATA_KEY_ART_URI, artworkUrl)
        }
      }
      .build()
    session.setMetadata(metadata)

    val playbackState = when {
      status == "playing" || player?.isPlaying == true -> PlaybackStateCompat.STATE_PLAYING
      status == "buffering" || player?.playbackState == Player.STATE_BUFFERING ->
        PlaybackStateCompat.STATE_BUFFERING
      status == "paused" -> PlaybackStateCompat.STATE_PAUSED
      status == "ended" -> PlaybackStateCompat.STATE_STOPPED
      else -> PlaybackStateCompat.STATE_PAUSED
    }

    val actions =
      PlaybackStateCompat.ACTION_PLAY or
        PlaybackStateCompat.ACTION_PAUSE or
        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
        PlaybackStateCompat.ACTION_SEEK_TO or
        PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID

    val state = PlaybackStateCompat.Builder()
      .setActions(actions)
      .setState(
        playbackState,
        (positionSeconds.coerceAtLeast(0.0) * 1000).toLong(),
        if (player?.isPlaying == true) 1.0f else 0.0f
      )
      .build()

    session.setPlaybackState(state)
  }

  fun reportError(message: String) {
    val data = Arguments.createMap()
    data.putString("message", message)
    HiddenAudioCore.emitAutoDiagnostic("android_auto_media_session_error", data)
  }

  private val sessionCallback = object : MediaSessionCompat.Callback() {
    override fun onPlay() {
      HiddenAudioCore.emitAutoDiagnostic("android_auto_play_forced")
      HiddenAudioCore.playForcedFromSession()
    }

    override fun onPause() {
      HiddenAudioCore.emitAutoDiagnostic("android_auto_pause_forced")
      HiddenAudioCore.pauseForcedFromSession()
    }

    override fun onSkipToNext() {
      HiddenAudioCore.emitAutoDiagnostic("android_auto_next_received")
      HiddenAudioCore.emitRemoteCommand("next")
    }

    override fun onSkipToPrevious() {
      HiddenAudioCore.emitAutoDiagnostic("android_auto_previous_received")
      HiddenAudioCore.emitRemoteCommand("previous")
    }

    override fun onSeekTo(pos: Long) {
      HiddenAudioCore.seekTo(pos.coerceAtLeast(0L) / 1000.0)
    }

    override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
      val safeId = mediaId?.trim().orEmpty()
      if (safeId.isBlank()) return
      HiddenAudioCore.playFromAutoMediaId(safeId)
    }
  }
}
