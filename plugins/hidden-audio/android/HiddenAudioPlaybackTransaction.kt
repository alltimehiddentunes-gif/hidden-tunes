package com.hiddentunes.app.audio

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.util.concurrent.atomic.AtomicLong

/**
 * Latest-wins playback transaction for Android Auto and phone remote commands.
 * Older transactions become stale and must ignore late completions.
 */
object HiddenAudioPlaybackTransaction {
  private val nextId = AtomicLong(1L)
  @Volatile private var currentId: Long = 0L
  @Volatile private var currentMediaId: String = ""
  @Volatile private var currentCorrelationId: String = ""

  data class Handle(
    val transactionId: Long,
    val mediaId: String,
    val correlationId: String
  )

  fun begin(mediaId: String, reason: String): Handle {
    val id = nextId.getAndIncrement()
    val correlation = "aa_${id}_${mediaId.hashCode().toUInt().toString(16)}"
    currentId = id
    currentMediaId = mediaId
    currentCorrelationId = correlation
    val data = Arguments.createMap()
    data.putDouble("transactionId", id.toDouble())
    data.putString("mediaId", mediaId)
    data.putString("correlationId", correlation)
    data.putString("reason", reason)
    HiddenAudioCore.emitAutoDiagnostic("playback_transaction_created", data)
    return Handle(id, mediaId, correlation)
  }

  fun isCurrent(transactionId: Long): Boolean = transactionId != 0L && transactionId == currentId

  fun current(): Handle? {
    val id = currentId
    if (id == 0L) return null
    return Handle(id, currentMediaId, currentCorrelationId)
  }

  fun markStaleIgnored(transactionId: Long, phase: String) {
    val data = Arguments.createMap()
    data.putDouble("transactionId", transactionId.toDouble())
    data.putDouble("currentTransactionId", currentId.toDouble())
    data.putString("phase", phase)
    data.putString("correlationId", currentCorrelationId)
    HiddenAudioCore.emitAutoDiagnostic("stale_transaction_ignored", data)
  }

  fun diagnosticBase(): WritableMap {
    val data = Arguments.createMap()
    data.putDouble("transactionId", currentId.toDouble())
    data.putString("mediaId", currentMediaId)
    data.putString("correlationId", currentCorrelationId)
    return data
  }
}
