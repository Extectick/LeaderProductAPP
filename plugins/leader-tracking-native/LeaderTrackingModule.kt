package __LEADER_APP_PACKAGE__.tracking

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeMap

class LeaderTrackingModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "LeaderTracking"

  @ReactMethod
  fun start(config: ReadableMap, promise: Promise) {
    try {
      val apiBaseUrl = config.getString("apiBaseUrl")?.trim().orEmpty()
      val token = config.getString("token")?.trim().orEmpty()
      val routeId = if (config.hasKey("routeId") && !config.isNull("routeId")) config.getDouble("routeId").toLong() else 0L
      val intervalMs = if (config.hasKey("intervalMs") && !config.isNull("intervalMs")) config.getDouble("intervalMs").toLong() else LeaderTrackingService.DEFAULT_INTERVAL_MS

      if (apiBaseUrl.isBlank()) {
        promise.reject("E_TRACKING_CONFIG", "apiBaseUrl is required")
        return
      }
      if (token.isBlank()) {
        promise.reject("E_TRACKING_CONFIG", "tracking token is required")
        return
      }

      LeaderTrackingService.saveConfig(reactContext, apiBaseUrl, token, routeId, intervalMs)
      ContextCompat.startForegroundService(
        reactContext,
        Intent(reactContext, LeaderTrackingService::class.java).setAction(LeaderTrackingService.ACTION_START)
      )
      promise.resolve(LeaderTrackingService.statusMap(reactContext))
    } catch (error: Throwable) {
      promise.reject("E_TRACKING_START", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      LeaderTrackingService.disable(reactContext)
      reactContext.startService(
        Intent(reactContext, LeaderTrackingService::class.java).setAction(LeaderTrackingService.ACTION_STOP)
      )
      promise.resolve(LeaderTrackingService.statusMap(reactContext))
    } catch (error: Throwable) {
      promise.reject("E_TRACKING_STOP", error)
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      promise.resolve(LeaderTrackingService.statusMap(reactContext))
    } catch (error: Throwable) {
      promise.reject("E_TRACKING_STATUS", error)
    }
  }

  companion object {
    fun mapOf(vararg values: Pair<String, Any?>): WritableNativeMap {
      val map = WritableNativeMap()
      for ((key, value) in values) {
        when (value) {
          null -> map.putNull(key)
          is Boolean -> map.putBoolean(key, value)
          is Int -> map.putInt(key, value)
          is Long -> map.putDouble(key, value.toDouble())
          is Double -> map.putDouble(key, value)
          is String -> map.putString(key, value)
          else -> map.putString(key, value.toString())
        }
      }
      return map
    }
  }
}
