package __LEADER_APP_PACKAGE__.tracking

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.PowerManager
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import org.traccar.client.sharedTracker
import java.net.HttpURLConnection
import java.net.URL

/** Lives with the Application / Traccar foreground process, not the React bridge.
 * No second GPS collector, service, notification or copy of the credential.
 * MainApplication also runs on sticky-service restart and BOOT_COMPLETED.
 */
object LeaderTrackingCommands {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var job: Job? = null
  private const val PREFERENCES = "leader_tracking_commands"

  @Synchronized
  fun configure(context: Context, enabled: Boolean) {
    // Intent only; the credential remains owned by the existing SDK.
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().putBoolean("enabled", enabled).commit()
    if (enabled) start(context) else { job?.cancel(); job = null }
  }

  @Synchronized
  fun start(context: Context) {
    if (job?.isActive == true || !context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getBoolean("enabled", false)) return
    val app = context.applicationContext
    job = scope.launch {
      val wakeLock = (app.getSystemService(Context.POWER_SERVICE) as PowerManager)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "leader:tracking-commands")
        .apply { setReferenceCounted(false) }
      var backoff = 15_000L
      var lastCredential: String? = null
      var lastRequest: String? = null
      var failure: JSONObject? = null
      try { while (isActive) {
        var waitMs = 15_000L
        try {
          val tracker = sharedTracker()
          if (tracker == null || !tracker.state.value.enabled) {
            // Do not repeatedly bootstrap an unconfigured SDK or revive a
            // paused tracker. Explicit configure(true) repairs it after login.
            return@launch
          }
          val credential = tracker.config.deviceId
          if (credential != lastCredential) {
            lastCredential = credential
            lastRequest = null
            failure = null
            backoff = 15_000L
          }
          // Only our configured API, never forward the credential to a redirect.
          val suffix = "/tracking/native/osmand"
          val server = tracker.config.serverUrl
          if (!credential.startsWith("lpt_") || !server.endsWith(suffix)) {
            if (wakeLock.isHeld) wakeLock.release()
            delay(60_000)
            continue
          }
          // Traccar releases its own lock when stationary. Keep command delivery
          // alive too, but bound each lease and release on pause/network failure.
          wakeLock.acquire(90_000)
          val connection = URL(server.removeSuffix(suffix) + "/tracking/native/commands").openConnection() as HttpURLConnection
          val response: JSONObject
          try {
            connection.requestMethod = "POST"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 8_000
            connection.readTimeout = 8_000
            connection.setRequestProperty("Content-Type", "application/json")
            connection.doOutput = true
            val body = JSONObject().put("credential", credential)
            failure?.let { body.put("failure", it) }
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            when (connection.responseCode) {
              401, 403 -> {
                // No endless auth retries. The authenticated app bootstrap can
                // provision a replacement credential and restart the tracker.
                tracker.stop()
                if (wakeLock.isHeld) wakeLock.release()
                continue
              }
              200 -> response = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
              else -> throw IllegalStateException("Command channel unavailable")
            }
          } finally {
            connection.disconnect()
          }
          failure = null
          backoff = 15_000L
          val command = response.optJSONObject("command")
          val requestId = command?.optString("id").orEmpty()
          val remainingMs = ((command?.optLong("validForSeconds") ?: 0) * 1000).coerceAtMost(35_000)
          if (requestId.isNotBlank() && requestId != lastRequest && remainingMs > 1_000
            && tracker.state.value.enabled && sharedTracker() === tracker) {
            lastRequest = requestId
            val permitted = ContextCompat.checkSelfPermission(app, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
              || ContextCompat.checkSelfPermission(app, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            val manager = app.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            var reason: String? = when {
              !permitted -> "LOCATION_PERMISSION_DENIED"
              !LocationManagerCompat.isLocationEnabled(manager) -> "LOCATION_SERVICES_DISABLED"
              else -> null
            }
            if (reason == null) {
              // Use the non-UI SDK method: background commands must not open
              // a permissions Activity. SDK owns the single-fix GPS + upload.
              val sent = withTimeoutOrNull(remainingMs - 500) {
                coroutineScope {
                  val fix = async { tracker.requestPosition("lp:$requestId") }
                  val pauseGuard = launch {
                    tracker.state.first { !it.enabled }
                    fix.cancel()
                  }
                  try {
                    fix.await()
                  } catch (error: CancellationException) {
                    if (tracker.state.value.enabled) throw error
                    false
                  } finally {
                    pauseGuard.cancel()
                  }
                }
              } == true
              if (!sent && tracker.state.value.enabled) reason = "LOCATION_FIX_FAILED"
            }
            if (reason != null) {
              failure = JSONObject().put("requestId", requestId).put("reason", reason)
              waitMs = 2_100 // promptly report a known failure, without a tight loop
            }
          }
        } catch (error: CancellationException) {
          if (!isActive) throw error
          // A React-side config refresh replaces the SDK's internal scope.
          // Reconnect on the next poll instead of permanently losing commands.
          if (wakeLock.isHeld) wakeLock.release()
        } catch (_: Exception) {
          // Network/Doze outages are expected; no sensitive URL/body logging.
          waitMs = backoff
          backoff = (backoff * 2).coerceAtMost(120_000)
          if (wakeLock.isHeld) wakeLock.release()
        }
        delay(waitMs)
      } } finally { if (wakeLock.isHeld) wakeLock.release() }
    }
  }
}
