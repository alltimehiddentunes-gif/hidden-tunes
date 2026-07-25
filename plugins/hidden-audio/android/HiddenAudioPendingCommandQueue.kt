package com.hiddentunes.app.audio

import android.os.SystemClock
import com.facebook.react.bridge.Arguments
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Bounded latest-wins pending remote-command queue for Android Auto process-start
 * before React Native is ready. Never auto-plays on connect alone.
 */
object HiddenAudioPendingCommandQueue {
  private const val MAX_PENDING = 4
  private const val COMMAND_TTL_MS = 45_000L

  data class PendingCommand(
    val command: String,
    val mediaId: String?,
    val transactionId: Long,
    val correlationId: String,
    val createdAtMs: Long
  )

  private val lock = Any()
  private val pending = ArrayDeque<PendingCommand>()
  private val reactReady = AtomicBoolean(false)

  fun markReactReady(ready: Boolean) {
    reactReady.set(ready)
    if (ready) {
      HiddenAudioCore.emitAutoDiagnostic("android_auto_react_ready")
    }
  }

  fun isReactReady(): Boolean = reactReady.get()

  fun enqueue(
    command: String,
    mediaId: String?,
    transactionId: Long,
    correlationId: String
  ) {
    val normalized = command.trim().lowercase()
    if (normalized.isBlank()) return
    // Connection alone must never enqueue play.
    if (normalized == "connect" || normalized == "connected") return

    synchronized(lock) {
      // Latest play_from_media_id / play wins — drop older playback selections.
      if (normalized == "play_from_media_id" || normalized == "play") {
        pending.removeAll {
          it.command == "play_from_media_id" || it.command == "play"
        }
      }
      while (pending.size >= MAX_PENDING) {
        pending.removeFirst()
      }
      pending.addLast(
        PendingCommand(
          command = normalized,
          mediaId = mediaId?.trim()?.takeIf { it.isNotEmpty() },
          transactionId = transactionId,
          correlationId = correlationId,
          createdAtMs = SystemClock.elapsedRealtime()
        )
      )
    }
    val data = Arguments.createMap()
    data.putString("command", normalized)
    if (!mediaId.isNullOrBlank()) data.putString("mediaId", mediaId)
    data.putDouble("transactionId", transactionId.toDouble())
    data.putString("correlationId", correlationId)
    HiddenAudioCore.emitAutoDiagnostic("android_auto_pending_command_enqueued", data)
  }

  fun drainDue(): List<PendingCommand> {
    val now = SystemClock.elapsedRealtime()
    val due = mutableListOf<PendingCommand>()
    synchronized(lock) {
      while (pending.isNotEmpty()) {
        val next = pending.removeFirst()
        if (now - next.createdAtMs > COMMAND_TTL_MS) {
          val data = Arguments.createMap()
          data.putString("command", next.command)
          data.putString("reason", "expired")
          data.putDouble("transactionId", next.transactionId.toDouble())
          HiddenAudioCore.emitAutoDiagnostic("android_auto_pending_command_expired", data)
          continue
        }
        due.add(next)
      }
    }
    return due
  }

  fun clear() {
    synchronized(lock) { pending.clear() }
  }
}
