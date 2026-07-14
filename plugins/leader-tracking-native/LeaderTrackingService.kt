package __LEADER_APP_PACKAGE__.tracking

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.WritableNativeMap
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min
import kotlin.random.Random

class LeaderTrackingService : Service() {
  private lateinit var fusedClient: FusedLocationProviderClient
  private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val flushing = AtomicBoolean(false)
  private var updatesStarted = false
  private var requestedMode = MODE_MOVING
  private var connectivityCallback: ConnectivityManager.NetworkCallback? = null

  private val callback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      for (location in result.locations) enqueueLocation(this@LeaderTrackingService, location)
      serviceScope.launch { flushQueue(this@LeaderTrackingService, flushing) }
    }
  }

  override fun onCreate() {
    super.onCreate()
    serviceRunning.set(true)
    fusedClient = LocationServices.getFusedLocationProviderClient(this)
    createChannel()
    registerConnectivityCallback()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      serviceScope.launch {
        flushQueue(this@LeaderTrackingService, flushing, force = true)
        clearCredentials(this@LeaderTrackingService)
        stopUpdates()
        stopForeground(STOP_FOREGROUND_REMOVE_COMPAT)
        stopSelf()
      }
      return START_NOT_STICKY
    }

    if (!isEnabled(this)) {
      stopSelf()
      return START_NOT_STICKY
    }

    startForeground(NOTIFICATION_ID, buildNotification())
    startUpdates()
    serviceScope.launch { flushQueue(this@LeaderTrackingService, flushing) }
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onTaskRemoved(rootIntent: Intent?) {
    if (isEnabled(this)) scheduleRestart(this, 3_000L)
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    unregisterConnectivityCallback()
    stopUpdates()
    serviceScope.cancel()
    serviceRunning.set(false)
    if (isEnabled(this)) scheduleRestart(this, 10_000L)
    super.onDestroy()
  }

  @SuppressLint("MissingPermission")
  private fun startUpdates(mode: String = requestedMode) {
    if (!hasLocationPermission(this)) {
      saveLastError(this, "No location permission for native tracking")
      return
    }
    if (updatesStarted && mode == requestedMode) return
    if (updatesStarted) fusedClient.removeLocationUpdates(callback)

    requestedMode = mode
    val configuredInterval = prefs(this).getLong(KEY_INTERVAL_MS, DEFAULT_MOVING_INTERVAL_MS)
      .coerceAtLeast(MIN_MOVING_INTERVAL_MS)
    val interval = if (mode == MODE_STATIONARY) {
      maxOf(DEFAULT_STATIONARY_INTERVAL_MS, configuredInterval)
    } else {
      configuredInterval
    }
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, interval)
      .setMinUpdateIntervalMillis(interval)
      .setMinUpdateDistanceMeters(0f)
      .build()
    fusedClient.requestLocationUpdates(request, callback, Looper.getMainLooper())
    updatesStarted = true
    prefs(this).edit()
      .putString(KEY_MODE, requestedMode)
      .putLong(KEY_LAST_SERVICE_START_AT, System.currentTimeMillis())
      .remove(KEY_LAST_ERROR)
      .apply()
  }

  private fun stopUpdates() {
    if (!updatesStarted) return
    fusedClient.removeLocationUpdates(callback)
    updatesStarted = false
  }

  private fun switchLocationMode(mode: String) {
    if (mode != requestedMode) startUpdates(mode)
  }

  private fun registerConnectivityCallback() {
    if (connectivityCallback != null) return
    val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
    val callback = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        serviceScope.launch { flushQueue(this@LeaderTrackingService, flushing, force = true) }
      }

      override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
        if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
          serviceScope.launch { flushQueue(this@LeaderTrackingService, flushing, force = true) }
        }
      }
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        manager.registerDefaultNetworkCallback(callback)
      } else {
        manager.registerNetworkCallback(NetworkRequest.Builder().build(), callback)
      }
      connectivityCallback = callback
    } catch (error: Throwable) {
      saveLastError(this, "Network callback unavailable: ${error.message ?: error.javaClass.simpleName}")
    }
  }

  private fun unregisterConnectivityCallback() {
    val callback = connectivityCallback ?: return
    val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    try {
      manager?.unregisterNetworkCallback(callback)
    } catch (_: Throwable) {
      // Android may already unregister the callback while the process dies.
    } finally {
      connectivityCallback = null
    }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Route tracking",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Leader Product records route coordinates while tracking is enabled."
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle("Route tracking is enabled")
      .setContentText("Leader Product records coordinates in the background.")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(pendingIntent)
      .build()
  }

  companion object {
    const val ACTION_START = "__LEADER_APP_PACKAGE__.tracking.START"
    const val ACTION_STOP = "__LEADER_APP_PACKAGE__.tracking.STOP"
    const val ACTION_FLUSH = "__LEADER_APP_PACKAGE__.tracking.FLUSH"
    const val DEFAULT_MOVING_INTERVAL_MS = 15_000L
    const val DEFAULT_INTERVAL_MS = DEFAULT_MOVING_INTERVAL_MS

    private const val MIN_MOVING_INTERVAL_MS = 15_000L
    private const val DEFAULT_STATIONARY_INTERVAL_MS = 60_000L
    private const val STATIONARY_ALIVE_INTERVAL_MS = 90_000L
    private const val MIN_MOVEMENT_METERS = 12f
    private const val MOVING_DISTANCE_METERS = 25f
    private const val MOVING_SPEED_METERS_PER_SECOND = 1.0f
    private const val MAX_ACCURACY_METERS = 100f
    private const val PREFS = "leader_native_tracking"
    private const val CHANNEL_ID = "leader_tracking_location"
    private const val NOTIFICATION_ID = 7301
    private const val MAX_QUEUE_POINTS = 2_000
    private const val BATCH_SIZE = 100
    private const val HTTP_TIMEOUT_MS = 15_000
    private const val MAX_RETRY_DELAY_MS = 5 * 60_000L
    private const val KEY_ENABLED = "enabled"
    private const val KEY_API_BASE_URL = "apiBaseUrl"
    private const val KEY_TOKEN = "token"
    private const val KEY_TOKEN_EXPIRES_AT = "tokenExpiresAt"
    private const val KEY_TOKEN_INVALID = "tokenInvalid"
    private const val KEY_ROUTE_ID = "routeId"
    private const val KEY_INTERVAL_MS = "intervalMs"
    private const val KEY_QUEUE = "queue"
    private const val KEY_LAST_SENT_AT = "lastSentAt"
    private const val KEY_LAST_RECORDED_AT = "lastRecordedAt"
    private const val KEY_LAST_ACCEPTED_AT = "lastAcceptedAt"
    private const val KEY_LAST_ACCEPTED_LAT = "lastAcceptedLat"
    private const val KEY_LAST_ACCEPTED_LON = "lastAcceptedLon"
    private const val KEY_LAST_ERROR = "lastError"
    private const val KEY_LAST_HTTP_STATUS = "lastHttpStatus"
    private const val KEY_LAST_SERVICE_START_AT = "lastServiceStartAt"
    private const val KEY_NEXT_RETRY_AT = "nextRetryAt"
    private const val KEY_LAST_RETRY_AT = "lastRetryAt"
    private const val KEY_RETRY_ATTEMPT = "retryAttempt"
    private const val KEY_DISCARDED_POINTS = "discardedPoints"
    private const val KEY_MODE = "mode"
    private const val MODE_MOVING = "moving"
    private const val MODE_STATIONARY = "stationary"
    private val queueLock = Any()
    private val serviceRunning = AtomicBoolean(false)
    private val isoFormatter = ThreadLocal.withInitial {
      SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
      }
    }
    private val STOP_FOREGROUND_REMOVE_COMPAT =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) Service.STOP_FOREGROUND_REMOVE else 1

    fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun saveConfig(
      context: Context,
      apiBaseUrl: String,
      token: String,
      routeId: Long,
      intervalMs: Long,
      tokenExpiresAt: Long = 0L
    ) {
      val pref = prefs(context)
      LeaderTrackingSecureStore.put(context, pref, KEY_API_BASE_URL, apiBaseUrl.trimEnd('/'))
      LeaderTrackingSecureStore.put(context, pref, KEY_TOKEN, token)
      pref.edit()
        .putBoolean(KEY_ENABLED, true)
        .putLong(KEY_ROUTE_ID, routeId)
        .putLong(KEY_INTERVAL_MS, intervalMs.coerceAtLeast(MIN_MOVING_INTERVAL_MS))
        .putLong(KEY_TOKEN_EXPIRES_AT, tokenExpiresAt)
        .putBoolean(KEY_TOKEN_INVALID, false)
        .remove(KEY_LAST_ERROR)
        .apply()
    }

    fun updateRoute(context: Context, routeId: Long) {
      prefs(context).edit().putLong(KEY_ROUTE_ID, routeId).apply()
    }

    fun disable(context: Context) {
      prefs(context).edit().putBoolean(KEY_ENABLED, false).apply()
    }

    fun clearCredentials(context: Context) {
      val pref = prefs(context)
      LeaderTrackingSecureStore.remove(pref, KEY_TOKEN)
      LeaderTrackingSecureStore.remove(pref, KEY_API_BASE_URL)
      LeaderTrackingSecureStore.remove(pref, KEY_QUEUE)
      pref.edit()
        .remove(KEY_TOKEN_EXPIRES_AT)
        .remove(KEY_NEXT_RETRY_AT)
        .remove(KEY_RETRY_ATTEMPT)
        .apply()
    }

    fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, false)

    fun statusMap(context: Context): WritableNativeMap {
      val pref = prefs(context)
      val expiresAt = pref.getLong(KEY_TOKEN_EXPIRES_AT, 0L)
      return LeaderTrackingModule.mapOf(
        "available" to true,
        "enabled" to pref.getBoolean(KEY_ENABLED, false),
        "running" to serviceRunning.get(),
        "hasCredentials" to (!LeaderTrackingSecureStore.get(context, pref, KEY_TOKEN).isNullOrBlank() &&
          !LeaderTrackingSecureStore.get(context, pref, KEY_API_BASE_URL).isNullOrBlank()),
        "tokenInvalid" to pref.getBoolean(KEY_TOKEN_INVALID, false),
        "tokenExpiresAt" to expiresAt,
        "routeId" to pref.getLong(KEY_ROUTE_ID, 0L),
        "queueLength" to queueLength(context),
        "lastSentAt" to pref.getString(KEY_LAST_SENT_AT, null),
        "lastRecordedAt" to pref.getString(KEY_LAST_RECORDED_AT, null),
        "lastError" to pref.getString(KEY_LAST_ERROR, null),
        "lastHttpStatus" to pref.getInt(KEY_LAST_HTTP_STATUS, 0),
        "lastServiceStartAt" to pref.getLong(KEY_LAST_SERVICE_START_AT, 0L),
        "lastRetryAt" to pref.getLong(KEY_LAST_RETRY_AT, 0L),
        "nextRetryAt" to pref.getLong(KEY_NEXT_RETRY_AT, 0L),
        "retryAttempt" to pref.getInt(KEY_RETRY_ATTEMPT, 0),
        "discardedPoints" to pref.getInt(KEY_DISCARDED_POINTS, 0),
        "mode" to pref.getString(KEY_MODE, MODE_MOVING),
        "secureStorage" to (LeaderTrackingSecureStore.isEncrypted(pref, KEY_TOKEN) &&
          LeaderTrackingSecureStore.isEncrypted(pref, KEY_QUEUE))
      )
    }

    fun hasLocationPermission(context: Context): Boolean {
      val fine = ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
      val coarse = ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
      return fine || coarse
    }

    fun scheduleRestart(context: Context, delayMs: Long) {
      scheduleService(context, ACTION_START, delayMs)
    }

    private fun scheduleFlush(context: Context, delayMs: Long) {
      scheduleService(context, ACTION_FLUSH, delayMs)
    }

    private fun scheduleService(context: Context, action: String, delayMs: Long) {
      if (!isEnabled(context)) return
      val intent = Intent(context, LeaderTrackingService::class.java).setAction(action)
      val pendingIntent = PendingIntent.getService(
        context,
        if (action == ACTION_FLUSH) 7303 else 7302,
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
      val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      alarm.setAndAllowWhileIdle(
        AlarmManager.ELAPSED_REALTIME_WAKEUP,
        SystemClock.elapsedRealtime() + delayMs.coerceAtLeast(1_000L),
        pendingIntent
      )
    }

    fun startIfEnabled(context: Context) {
      if (!isEnabled(context)) return
      ContextCompat.startForegroundService(
        context,
        Intent(context, LeaderTrackingService::class.java).setAction(ACTION_START)
      )
    }

    private fun enqueueLocation(context: Context, location: Location) {
      val recordedAtMs = location.time.takeIf { it > 0 } ?: System.currentTimeMillis()
      val pref = prefs(context)
      if (location.hasAccuracy() && location.accuracy > MAX_ACCURACY_METERS) {
        incrementDiscarded(pref)
        return
      }

      val lastAt = pref.getLong(KEY_LAST_ACCEPTED_AT, 0L)
      val lastLat = pref.getString(KEY_LAST_ACCEPTED_LAT, null)?.toDoubleOrNull()
      val lastLon = pref.getString(KEY_LAST_ACCEPTED_LON, null)?.toDoubleOrNull()
      val elapsed = if (lastAt > 0L) (recordedAtMs - lastAt).coerceAtLeast(0L) else Long.MAX_VALUE
      val distance = if (lastLat != null && lastLon != null) {
        val result = FloatArray(1)
        Location.distanceBetween(lastLat, lastLon, location.latitude, location.longitude, result)
        result[0]
      } else 0f
      val estimatedSpeed = if (elapsed in 1..Long.MAX_VALUE / 2) distance / (elapsed / 1_000f) else 0f
      val speed = if (location.hasSpeed()) location.speed else estimatedSpeed
      val moving = speed >= MOVING_SPEED_METERS_PER_SECOND || distance >= MOVING_DISTANCE_METERS
      val desiredMode = if (moving) MODE_MOVING else MODE_STATIONARY
      (context as? LeaderTrackingService)?.switchLocationMode(desiredMode)

      val minimumElapsed = if (moving) MIN_MOVING_INTERVAL_MS else STATIONARY_ALIVE_INTERVAL_MS
      if (lastAt > 0L && elapsed < minimumElapsed && distance < MIN_MOVEMENT_METERS) {
        incrementDiscarded(pref)
        return
      }

      val recordedAt = isoFormatter.get()!!.format(Date(recordedAtMs))
      val recordedTimeZone = TimeZone.getDefault()
      val point = JSONObject()
        .put("clientPointId", buildClientPointId(location))
        .put("latitude", location.latitude)
        .put("longitude", location.longitude)
        .put("recordedAt", recordedAt)
        .put("recordedTimeZone", recordedTimeZone.id)
        .put("recordedTimezoneOffsetMinutes", recordedTimeZone.getOffset(recordedAtMs) / 60_000)
        .put("eventType", "MOVE")
      if (location.hasAccuracy()) point.put("accuracy", location.accuracy.toDouble())
      if (location.hasSpeed()) point.put("speed", location.speed.toDouble())
      if (location.hasBearing()) point.put("heading", location.bearing.toDouble())

      synchronized(queueLock) {
        val queue = readQueue(context)
        val next = JSONArray()
        val keepFrom = maxOf(0, queue.length() - MAX_QUEUE_POINTS + 1)
        if (keepFrom > 0) incrementDiscarded(pref, keepFrom)
        for (index in keepFrom until queue.length()) next.put(queue.getJSONObject(index))
        next.put(point)
        writeQueue(context, next)
      }
      pref.edit()
        .putString(KEY_LAST_RECORDED_AT, recordedAt)
        .putLong(KEY_LAST_ACCEPTED_AT, recordedAtMs)
        .putString(KEY_LAST_ACCEPTED_LAT, location.latitude.toString())
        .putString(KEY_LAST_ACCEPTED_LON, location.longitude.toString())
        .putString(KEY_MODE, desiredMode)
        .apply()
    }

    private fun buildClientPointId(location: Location): String {
      val provider = location.provider ?: "native"
      val lat = String.format(Locale.US, "%.6f", location.latitude)
      val lon = String.format(Locale.US, "%.6f", location.longitude)
      return "native-${location.time}-$lat-$lon-$provider"
    }

    private fun incrementDiscarded(pref: android.content.SharedPreferences, amount: Int = 1) {
      pref.edit().putInt(KEY_DISCARDED_POINTS, pref.getInt(KEY_DISCARDED_POINTS, 0) + amount).apply()
    }

    private fun queueLength(context: Context): Int = synchronized(queueLock) { readQueue(context).length() }

    private fun readQueue(context: Context): JSONArray {
      val raw = LeaderTrackingSecureStore.get(context, prefs(context), KEY_QUEUE) ?: "[]"
      return try { JSONArray(raw) } catch (_: Throwable) { JSONArray() }
    }

    private fun writeQueue(context: Context, queue: JSONArray) {
      LeaderTrackingSecureStore.put(context, prefs(context), KEY_QUEUE, queue.toString())
    }

    private fun takeBatch(context: Context): JSONArray = synchronized(queueLock) {
      val queue = readQueue(context)
      val batch = JSONArray()
      for (index in 0 until min(BATCH_SIZE, queue.length())) batch.put(queue.getJSONObject(index))
      batch
    }

    private fun dropBatch(context: Context, count: Int) = synchronized(queueLock) {
      val queue = readQueue(context)
      val next = JSONArray()
      for (index in count until queue.length()) next.put(queue.getJSONObject(index))
      writeQueue(context, next)
    }

    suspend fun flushQueue(context: Context, flushing: AtomicBoolean, force: Boolean = false) {
      if (!flushing.compareAndSet(false, true)) return
      try {
        val pref = prefs(context)
        if (pref.getBoolean(KEY_TOKEN_INVALID, false)) return
        val now = System.currentTimeMillis()
        if (!force && now < pref.getLong(KEY_NEXT_RETRY_AT, 0L)) return
        val token = LeaderTrackingSecureStore.get(context, pref, KEY_TOKEN)?.takeIf { it.isNotBlank() } ?: return
        val apiBaseUrl = LeaderTrackingSecureStore.get(context, pref, KEY_API_BASE_URL)?.takeIf { it.isNotBlank() } ?: return

        while (true) {
          val batch = takeBatch(context)
          if (batch.length() == 0) return
          val body = JSONObject().put("points", batch)
          val routeId = pref.getLong(KEY_ROUTE_ID, 0L)
          if (routeId > 0L) body.put("routeId", routeId) else body.put("startNewRoute", true)

          val response = postJson("$apiBaseUrl/tracking/native/points", token, body)
          pref.edit().putInt(KEY_LAST_HTTP_STATUS, response.status).apply()
          if (response.status !in 200..299) {
            if (response.status == 401 || response.status == 403) {
              pref.edit()
                .putBoolean(KEY_TOKEN_INVALID, true)
                .putLong(KEY_LAST_RETRY_AT, System.currentTimeMillis())
                .putInt(KEY_RETRY_ATTEMPT, 0)
                .remove(KEY_NEXT_RETRY_AT)
                .apply()
              saveLastError(context, "Tracking credential requires renewal (HTTP ${response.status})")
            } else {
              scheduleRetry(context, "HTTP ${response.status}: ${response.body.take(240)}")
            }
            return
          }

          val nextRouteId = JSONObject(response.body).optJSONObject("data")?.optLong("routeId", 0L) ?: 0L
          if (nextRouteId > 0L) pref.edit().putLong(KEY_ROUTE_ID, nextRouteId).apply()
          dropBatch(context, batch.length())
          pref.edit()
            .putString(KEY_LAST_SENT_AT, isoFormatter.get()!!.format(Date()))
            .putLong(KEY_LAST_RETRY_AT, 0L)
            .putInt(KEY_RETRY_ATTEMPT, 0)
            .remove(KEY_NEXT_RETRY_AT)
            .remove(KEY_LAST_ERROR)
            .apply()
        }
      } catch (error: Throwable) {
        scheduleRetry(context, error.message ?: error.javaClass.simpleName)
      } finally {
        flushing.set(false)
      }
    }

    private fun scheduleRetry(context: Context, message: String) {
      val pref = prefs(context)
      val attempt = (pref.getInt(KEY_RETRY_ATTEMPT, 0) + 1).coerceAtMost(10)
      val baseDelay = min(MAX_RETRY_DELAY_MS, 5_000L * (1L shl min(6, attempt - 1)))
      val jitter = Random.nextLong(0L, maxOf(1L, baseDelay / 4L))
      val delay = min(MAX_RETRY_DELAY_MS, baseDelay + jitter)
      val retryAt = System.currentTimeMillis() + delay
      pref.edit()
        .putLong(KEY_LAST_RETRY_AT, System.currentTimeMillis())
        .putLong(KEY_NEXT_RETRY_AT, retryAt)
        .putInt(KEY_RETRY_ATTEMPT, attempt)
        .putString(KEY_LAST_ERROR, message)
        .apply()
      scheduleFlush(context, delay)
    }

    private fun postJson(url: String, token: String, body: JSONObject): HttpResult {
      val connection = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = HTTP_TIMEOUT_MS
        readTimeout = HTTP_TIMEOUT_MS
        doOutput = true
        setRequestProperty("Content-Type", "application/json; charset=utf-8")
        setRequestProperty("Authorization", "Bearer $token")
      }
      return try {
        connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        HttpResult(status, text)
      } finally {
        connection.disconnect()
      }
    }

    private fun saveLastError(context: Context, message: String) {
      prefs(context).edit().putString(KEY_LAST_ERROR, message).apply()
    }
  }

  data class HttpResult(val status: Int, val body: String)
}
