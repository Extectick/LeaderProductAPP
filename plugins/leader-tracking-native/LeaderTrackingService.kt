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

class LeaderTrackingService : Service() {
  private lateinit var fusedClient: FusedLocationProviderClient
  private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val flushing = AtomicBoolean(false)
  private var updatesStarted = false

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
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      serviceScope.launch {
        flushQueue(this@LeaderTrackingService, flushing)
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
    stopUpdates()
    serviceScope.cancel()
    serviceRunning.set(false)
    if (isEnabled(this)) scheduleRestart(this, 10_000L)
    super.onDestroy()
  }

  @SuppressLint("MissingPermission")
  private fun startUpdates() {
    if (updatesStarted) return
    if (!hasLocationPermission(this)) {
      saveLastError(this, "No location permission for native tracking")
      return
    }

    val interval = prefs(this).getLong(KEY_INTERVAL_MS, DEFAULT_INTERVAL_MS)
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, interval)
      .setMinUpdateIntervalMillis(5_000L)
      .setMinUpdateDistanceMeters(0f)
      .build()
    fusedClient.requestLocationUpdates(request, callback, Looper.getMainLooper())
    updatesStarted = true
    prefs(this).edit()
      .putLong(KEY_LAST_SERVICE_START_AT, System.currentTimeMillis())
      .remove(KEY_LAST_ERROR)
      .apply()
  }

  private fun stopUpdates() {
    if (!updatesStarted) return
    fusedClient.removeLocationUpdates(callback)
    updatesStarted = false
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
    const val DEFAULT_INTERVAL_MS = 15_000L

    private const val PREFS = "leader_native_tracking"
    private const val CHANNEL_ID = "leader_tracking_location"
    private const val NOTIFICATION_ID = 7301
    private const val MAX_QUEUE_POINTS = 2_000
    private const val BATCH_SIZE = 100
    private const val HTTP_TIMEOUT_MS = 15_000
    private const val KEY_ENABLED = "enabled"
    private const val KEY_API_BASE_URL = "apiBaseUrl"
    private const val KEY_TOKEN = "token"
    private const val KEY_ROUTE_ID = "routeId"
    private const val KEY_INTERVAL_MS = "intervalMs"
    private const val KEY_QUEUE = "queue"
    private const val KEY_LAST_SENT_AT = "lastSentAt"
    private const val KEY_LAST_RECORDED_AT = "lastRecordedAt"
    private const val KEY_LAST_ERROR = "lastError"
    private const val KEY_LAST_HTTP_STATUS = "lastHttpStatus"
    private const val KEY_LAST_SERVICE_START_AT = "lastServiceStartAt"
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

    fun saveConfig(context: Context, apiBaseUrl: String, token: String, routeId: Long, intervalMs: Long) {
      prefs(context).edit()
        .putBoolean(KEY_ENABLED, true)
        .putString(KEY_API_BASE_URL, apiBaseUrl.trimEnd('/'))
        .putString(KEY_TOKEN, token)
        .putLong(KEY_ROUTE_ID, routeId)
        .putLong(KEY_INTERVAL_MS, intervalMs.coerceAtLeast(5_000L))
        .remove(KEY_LAST_ERROR)
        .apply()
    }

    fun disable(context: Context) {
      prefs(context).edit().putBoolean(KEY_ENABLED, false).apply()
    }

    fun clearCredentials(context: Context) {
      prefs(context).edit().remove(KEY_TOKEN).remove(KEY_API_BASE_URL).apply()
    }

    fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, false)

    fun statusMap(context: Context): WritableNativeMap {
      val pref = prefs(context)
      return LeaderTrackingModule.mapOf(
        "available" to true,
        "enabled" to pref.getBoolean(KEY_ENABLED, false),
        "running" to serviceRunning.get(),
        "routeId" to pref.getLong(KEY_ROUTE_ID, 0L),
        "queueLength" to queueLength(context),
        "lastSentAt" to pref.getString(KEY_LAST_SENT_AT, null),
        "lastRecordedAt" to pref.getString(KEY_LAST_RECORDED_AT, null),
        "lastError" to pref.getString(KEY_LAST_ERROR, null),
        "lastHttpStatus" to pref.getInt(KEY_LAST_HTTP_STATUS, 0),
        "lastServiceStartAt" to pref.getLong(KEY_LAST_SERVICE_START_AT, 0L)
      )
    }

    fun hasLocationPermission(context: Context): Boolean {
      val fine = ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
      val coarse = ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
      return fine || coarse
    }

    fun scheduleRestart(context: Context, delayMs: Long) {
      if (!isEnabled(context)) return
      val intent = Intent(context, LeaderTrackingService::class.java).setAction(ACTION_START)
      val pendingIntent = PendingIntent.getService(
        context,
        7302,
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
      val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      alarm.setAndAllowWhileIdle(
        AlarmManager.ELAPSED_REALTIME_WAKEUP,
        SystemClock.elapsedRealtime() + delayMs,
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
      val recordedAt = isoFormatter.get()!!.format(Date(recordedAtMs))
      val recordedTimeZone = TimeZone.getDefault()
      val recordedTimezoneOffsetMinutes = recordedTimeZone.getOffset(recordedAtMs) / 60_000
      val point = JSONObject()
        .put("clientPointId", buildClientPointId(location))
        .put("latitude", location.latitude)
        .put("longitude", location.longitude)
        .put("recordedAt", recordedAt)
        .put("recordedTimeZone", recordedTimeZone.id)
        .put("recordedTimezoneOffsetMinutes", recordedTimezoneOffsetMinutes)
        .put("eventType", "MOVE")
      if (location.hasAccuracy()) point.put("accuracy", location.accuracy.toDouble())
      if (location.hasSpeed()) point.put("speed", location.speed.toDouble())
      if (location.hasBearing()) point.put("heading", location.bearing.toDouble())

      synchronized(queueLock) {
        val queue = readQueue(context)
        val compacted = JSONArray()
        val start = maxOf(0, queue.length() - MAX_QUEUE_POINTS + 1)
        for (index in start until queue.length()) compacted.put(queue.getJSONObject(index))
        compacted.put(point)
        writeQueue(context, compacted)
      }
      prefs(context).edit().putString(KEY_LAST_RECORDED_AT, recordedAt).apply()
    }

    private fun buildClientPointId(location: Location): String {
      val provider = location.provider ?: "native"
      val lat = String.format(Locale.US, "%.6f", location.latitude)
      val lon = String.format(Locale.US, "%.6f", location.longitude)
      return "native-${location.time}-$lat-$lon-$provider"
    }

    private fun queueLength(context: Context): Int = synchronized(queueLock) { readQueue(context).length() }

    private fun readQueue(context: Context): JSONArray {
      val raw = prefs(context).getString(KEY_QUEUE, "[]")
      return try { JSONArray(raw) } catch (_: Throwable) { JSONArray() }
    }

    private fun writeQueue(context: Context, queue: JSONArray) {
      prefs(context).edit().putString(KEY_QUEUE, queue.toString()).apply()
    }

    private fun takeBatch(context: Context): JSONArray = synchronized(queueLock) {
      val queue = readQueue(context)
      val batch = JSONArray()
      for (index in 0 until minOf(BATCH_SIZE, queue.length())) batch.put(queue.getJSONObject(index))
      batch
    }

    private fun dropBatch(context: Context, count: Int) = synchronized(queueLock) {
      val queue = readQueue(context)
      val next = JSONArray()
      for (index in count until queue.length()) next.put(queue.getJSONObject(index))
      writeQueue(context, next)
    }

    suspend fun flushQueue(context: Context, flushing: AtomicBoolean) {
      if (!flushing.compareAndSet(false, true)) return
      try {
        val pref = prefs(context)
        val token = pref.getString(KEY_TOKEN, null)?.takeIf { it.isNotBlank() } ?: return
        val apiBaseUrl = pref.getString(KEY_API_BASE_URL, null)?.takeIf { it.isNotBlank() } ?: return

        while (true) {
          val batch = takeBatch(context)
          if (batch.length() == 0) return
          val body = JSONObject().put("points", batch)
          val routeId = pref.getLong(KEY_ROUTE_ID, 0L)
          if (routeId > 0L) body.put("routeId", routeId) else body.put("startNewRoute", true)

          val response = postJson("$apiBaseUrl/tracking/native/points", token, body)
          pref.edit().putInt(KEY_LAST_HTTP_STATUS, response.status).apply()
          if (response.status !in 200..299) {
            saveLastError(context, "HTTP ${response.status}: ${response.body.take(240)}")
            return
          }

          val nextRouteId = JSONObject(response.body).optJSONObject("data")?.optLong("routeId", 0L) ?: 0L
          if (nextRouteId > 0L) pref.edit().putLong(KEY_ROUTE_ID, nextRouteId).apply()
          dropBatch(context, batch.length())
          pref.edit()
            .putString(KEY_LAST_SENT_AT, isoFormatter.get()!!.format(Date()))
            .remove(KEY_LAST_ERROR)
            .apply()
        }
      } catch (error: Throwable) {
        saveLastError(context, error.message ?: error.javaClass.simpleName)
      } finally {
        flushing.set(false)
      }
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
