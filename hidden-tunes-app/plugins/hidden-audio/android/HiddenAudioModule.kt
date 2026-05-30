package com.hiddentunes.app.audio

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap

class HiddenAudioModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "HiddenAudioModule"

  @ReactMethod
  fun setup(promise: Promise) {
    try {
      HiddenAudioCore.attachReactContext(reactContext)
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
      HiddenAudioCore.loadTrack(reactContext, track)
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

      HiddenAudioCore.attachReactContext(reactContext)
      HiddenAudioCore.loadQueue(reactContext, tracks, startIndex)
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("HIDDEN_AUDIO_LOAD_QUEUE_FAILED", error)
    }
  }

  @ReactMethod
  fun play(promise: Promise) {
    try {
      HiddenAudioCore.play()
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("HIDDEN_AUDIO_PLAY_FAILED", error)
    }
  }

  @ReactMethod
  fun pause(promise: Promise) {
    try {
      HiddenAudioCore.pause()
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
      HiddenAudioCore.stop()
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
    try {
      HiddenAudioCore.next()
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("HIDDEN_AUDIO_NEXT_FAILED", error)
    }
  }

  @ReactMethod
  fun previous(promise: Promise) {
    try {
      HiddenAudioCore.previous()
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("HIDDEN_AUDIO_PREVIOUS_FAILED", error)
    }
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
