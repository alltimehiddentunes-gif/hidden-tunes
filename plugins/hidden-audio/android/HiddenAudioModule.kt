package com.hiddentunes.app.audio

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

  @ReactMethod
  fun setup(promise: Promise) {
    try {
      HiddenAudioCore.attachReactContext(reactContext)
      emitDiagnostic("android_foreground_service_status", simpleData("status", "not_started_by_hidden_audio_module"))
      HiddenAudioCore.setup(reactContext)
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("HIDDEN_AUDIO_SETUP_FAILED", error)
    }
  }

  @ReactMethod
  fun loadTrack(track: ReadableMap, promise: Promise) {
    try {
      HiddenAudioCore.attachReactContext(reactContext)
      emitDiagnostic("hidden_audio_load_track_start")
      HiddenAudioCore.loadTrack(reactContext, track)
      emitDiagnostic("hidden_audio_load_track_success")
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("HIDDEN_AUDIO_LOAD_TRACK_FAILED", error)
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

      HiddenAudioCore.attachReactContext(reactContext)
      emitDiagnostic("hidden_audio_load_track_start")
      HiddenAudioCore.loadTrack(reactContext, track)
      emitDiagnostic("hidden_audio_load_track_success")
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("HIDDEN_AUDIO_LOAD_QUEUE_FAILED", error)
    }
  }

  @ReactMethod
  fun play(promise: Promise) {
    try {
      emitDiagnostic("hidden_audio_play_start")
      HiddenAudioCore.play()
      emitDiagnostic("android_player_state_changed", simpleData("state", "play_requested"))
      emitDiagnostic("hidden_audio_play_confirmed")
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("HIDDEN_AUDIO_PLAY_FAILED", error)
    }
  }

  @ReactMethod
  fun pause(promise: Promise) {
    try {
      emitDiagnostic("hidden_audio_pause_called")
      HiddenAudioCore.pause()
      emitDiagnostic("android_player_state_changed", simpleData("state", "pause_requested"))
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("HIDDEN_AUDIO_PAUSE_FAILED", error)
    }
  }

  @ReactMethod
  fun resume(promise: Promise) {
    play(promise)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      emitDiagnostic("hidden_audio_stop_called")
      HiddenAudioCore.stop()
      emitDiagnostic("android_player_state_changed", simpleData("state", "stop_requested"))
      emitDiagnostic("hidden_audio_unload_called")
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("HIDDEN_AUDIO_STOP_FAILED", error)
    }
  }

  @ReactMethod
  fun seekTo(seconds: Double, promise: Promise) {
    try {
      HiddenAudioCore.seekTo(seconds)
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("HIDDEN_AUDIO_SEEK_FAILED", error)
    }
  }

  @ReactMethod
  fun next(promise: Promise) {
    promise.resolve(null)
  }

  @ReactMethod
  fun previous(promise: Promise) {
    promise.resolve(null)
  }

  @ReactMethod
  fun getState(promise: Promise) {
    promise.resolve(HiddenAudioCore.state())
  }

  @ReactMethod
  fun getProgress(promise: Promise) {
    promise.resolve(HiddenAudioCore.progress())
  }

  @ReactMethod
  fun getActiveTrack(promise: Promise) {
    promise.resolve(HiddenAudioCore.activeTrackMap())
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
