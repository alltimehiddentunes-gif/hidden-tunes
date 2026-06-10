package com.hiddentunes.app.audio

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments

class HiddenAudioModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "HiddenAudioModule"

  private val mainHandler = Handler(Looper.getMainLooper())

  private fun emitDiagnostic(eventName: String, data: WritableMap = Arguments.createMap()) {
    val body = Arguments.createMap()
    body.putString("type", "diagnostic")
    body.putString("eventName", eventName)
    body.putMap("data", data)
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("HiddenAudioDiagnostic", body)
  }

  private fun simpleData(key: String, value: String): WritableMap {
    val data = Arguments.createMap()
    data.putString(key, value)
    return data
  }

  private fun errorData(error: Throwable): WritableMap {
    val data = Arguments.createMap()
    data.putString("message", error.message ?: error.javaClass.simpleName)
    data.putString("name", error.javaClass.simpleName)
    return data
  }

  private fun runOnMain(
    promise: Promise,
    failureCode: String,
    failureEvent: String,
    block: () -> Unit
  ) {
    mainHandler.post {
      try {
        block()
        promise.resolve(null)
      } catch (error: Throwable) {
        emitDiagnostic(failureEvent, errorData(error))
        promise.reject(failureCode, error)
      }
    }
  }

  @ReactMethod
  fun setup(promise: Promise) {
    runOnMain(promise, "HIDDEN_AUDIO_SETUP_FAILED", "hidden_audio_setup_failed") {
      HiddenAudioCore.attachReactContext(reactContext)
      emitDiagnostic("android_foreground_service_status", simpleData("status", "not_started_by_hidden_audio_module"))
      HiddenAudioCore.setup(reactContext)
    }
  }

  @ReactMethod
  fun loadTrack(track: ReadableMap, promise: Promise) {
    runOnMain(promise, "HIDDEN_AUDIO_LOAD_TRACK_FAILED", "hidden_audio_load_track_failed") {
      HiddenAudioCore.attachReactContext(reactContext)
      emitDiagnostic("hidden_audio_load_track_start")
      HiddenAudioCore.loadTrack(reactContext, track)
      emitDiagnostic("hidden_audio_load_track_success")
    }
  }

  @ReactMethod
  fun loadQueue(tracks: ReadableArray, startIndex: Int, promise: Promise) {
    try {
      if (tracks.size() <= 0) {
        promise.reject("HIDDEN_AUDIO_EMPTY_QUEUE", "Queue is empty")
        return
      }

      val safeIndex = startIndex.coerceIn(0, tracks.size() - 1)
      val track = tracks.getMap(safeIndex)

      if (track == null) {
        promise.reject("E_INVALID_TRACK", "Track payload is required")
        return
      }

      runOnMain(promise, "HIDDEN_AUDIO_LOAD_QUEUE_FAILED", "hidden_audio_load_track_failed") {
        HiddenAudioCore.attachReactContext(reactContext)
        emitDiagnostic("hidden_audio_load_track_start")
        HiddenAudioCore.loadTrack(reactContext, track)
        emitDiagnostic("hidden_audio_load_track_success")
      }
    } catch (error: Throwable) {
      emitDiagnostic("hidden_audio_load_track_failed", errorData(error))
      promise.reject("HIDDEN_AUDIO_LOAD_QUEUE_FAILED", error)
    }
  }


  @ReactMethod
  fun notifyAppBackgrounded(promise: Promise) {
    runOnMain(promise, "HIDDEN_AUDIO_BACKGROUND_NOTIFY_FAILED", "android_background_notify_failed") {
      HiddenAudioCore.notifyAppBackgrounded()
    }
  }

  @ReactMethod
  fun play(promise: Promise) {
    runOnMain(promise, "HIDDEN_AUDIO_PLAY_FAILED", "hidden_audio_play_failed") {
      emitDiagnostic("hidden_audio_play_start")
      HiddenAudioCore.play()
      emitDiagnostic("android_player_state_changed", simpleData("state", "play_requested"))
      emitDiagnostic("hidden_audio_play_confirmed")
    }
  }

  @ReactMethod
  fun pause(promise: Promise) {
    runOnMain(promise, "HIDDEN_AUDIO_PAUSE_FAILED", "hidden_audio_pause_failed") {
      emitDiagnostic("hidden_audio_pause_called")
      HiddenAudioCore.pause()
      emitDiagnostic("android_player_state_changed", simpleData("state", "pause_requested"))
    }
  }

  @ReactMethod
  fun resume(promise: Promise) {
    play(promise)
  }

  @ReactMethod
  fun reassertBackgroundPlayback(promise: Promise) {
    runOnMain(promise, "HIDDEN_AUDIO_REASSERT_FAILED", "android_background_play_reassert_failed") {
      HiddenAudioCore.reassertBackgroundPlayback("js_background_reassert")
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    runOnMain(promise, "HIDDEN_AUDIO_STOP_FAILED", "hidden_audio_stop_failed") {
      emitDiagnostic("hidden_audio_stop_called")
      HiddenAudioCore.stop()
      emitDiagnostic("android_player_state_changed", simpleData("state", "stop_requested"))
      emitDiagnostic("hidden_audio_unload_called")
    }
  }

  @ReactMethod
  fun seekTo(seconds: Double, promise: Promise) {
    runOnMain(promise, "HIDDEN_AUDIO_SEEK_FAILED", "hidden_audio_seek_failed") {
      HiddenAudioCore.seekTo(seconds)
    }
  }

  @ReactMethod
  fun next(promise: Promise) {
    try {
      HiddenAudioCore.emitRemoteCommand("next")
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("HIDDEN_AUDIO_NEXT_FAILED", error)
    }
  }

  @ReactMethod
  fun previous(promise: Promise) {
    try {
      HiddenAudioCore.emitRemoteCommand("previous")
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("HIDDEN_AUDIO_PREVIOUS_FAILED", error)
    }
  }

  @ReactMethod
  fun getState(promise: Promise) {
    mainHandler.post {
      try {
        promise.resolve(HiddenAudioCore.state())
      } catch (error: Throwable) {
        emitDiagnostic("hidden_audio_get_state_failed", errorData(error))
        promise.reject("HIDDEN_AUDIO_GET_STATE_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun getProgress(promise: Promise) {
    mainHandler.post {
      try {
        promise.resolve(HiddenAudioCore.progress())
      } catch (error: Throwable) {
        emitDiagnostic("hidden_audio_get_progress_failed", errorData(error))
        promise.reject("HIDDEN_AUDIO_GET_PROGRESS_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun getActiveTrack(promise: Promise) {
    mainHandler.post {
      try {
        promise.resolve(HiddenAudioCore.activeTrackMap())
      } catch (error: Throwable) {
        emitDiagnostic("hidden_audio_get_active_track_failed", errorData(error))
        promise.reject("HIDDEN_AUDIO_GET_ACTIVE_TRACK_FAILED", error)
      }
    }
  }


  @ReactMethod
  fun syncAndroidAutoCatalog(snapshot: ReadableMap, promise: Promise) {
    mainHandler.post {
      try {
        HiddenAudioAutoCatalog.applySnapshot(snapshot)
        emitDiagnostic("android_auto_catalog_synced")
        promise.resolve(null)
      } catch (error: Throwable) {
        emitDiagnostic("android_auto_media_session_error", errorData(error))
        promise.reject("ANDROID_AUTO_CATALOG_SYNC_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required by NativeEventEmitter.
  }
}
