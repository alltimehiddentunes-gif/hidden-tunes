package com.hiddentunes.app.automotive

import android.car.Car
import android.car.drivingstate.CarUxRestrictions
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.pm.PackageManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class AutomotiveSafetyModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext),
  CarUxRestrictionsManager.OnUxRestrictionsChangedListener {
  private var car: Car? = null
  private var manager: CarUxRestrictionsManager? = null
  private var current: CarUxRestrictions? = null

  override fun getName() = "HiddenTunesAutomotiveSafety"

  override fun initialize() {
    super.initialize()
    if (!reactContext.packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)) {
      emitState("not_automotive")
      return
    }
    try {
      val connectedCar = Car.createCar(reactContext)
      val restrictionsManager = connectedCar.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE)
        as? CarUxRestrictionsManager
      car = connectedCar
      manager = restrictionsManager
      restrictionsManager?.registerListener(this)
      current = restrictionsManager?.currentCarUxRestrictions
      emitState(if (current == null) "restrictions_unavailable" else "ready")
    } catch (_: Throwable) {
      // Unknown, disconnected, or unavailable always blocks video.
      current = null
      emitState("car_api_unavailable")
    }
  }

  override fun onUxRestrictionsChanged(restrictions: CarUxRestrictions) {
    current = restrictions
    emitState("restriction_changed")
  }

  @ReactMethod
  fun getSafetyState(promise: com.facebook.react.bridge.Promise) {
    promise.resolve(buildState("snapshot"))
  }

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  private fun isParkedVideoAllowed(): Boolean {
    val restrictions = current ?: return false
    return !restrictions.isRequiresDistractionOptimization
  }

  private fun buildState(reason: String): WritableMap = Arguments.createMap().apply {
    putBoolean("isAutomotive", reactContext.packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE))
    putBoolean("videoAllowed", isParkedVideoAllowed())
    putBoolean("audioWhileDrivingAllowed", false)
    putString("reason", reason)
  }

  private fun emitState(reason: String) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("hiddenTunesAutomotiveSafetyChanged", buildState(reason))
  }

  override fun invalidate() {
    try { manager?.unregisterListener() } catch (_: Throwable) {}
    try { car?.disconnect() } catch (_: Throwable) {}
    manager = null
    car = null
    current = null
    super.invalidate()
  }
}
