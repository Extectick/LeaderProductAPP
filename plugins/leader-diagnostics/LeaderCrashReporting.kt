package com.leaderproduct.app.monitoring

import android.app.ActivityManager
import android.app.Application
import android.app.ApplicationExitInfo
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.common.JavascriptException
import io.sentry.Breadcrumb
import io.sentry.Sentry
import io.sentry.SentryEvent
import io.sentry.SentryLevel
import io.sentry.SentryOptions
import io.sentry.android.core.SentryAndroid
import io.sentry.protocol.Message
import io.sentry.protocol.SentryId
import io.sentry.protocol.User
import org.json.JSONArray
import org.json.JSONObject
import java.util.Date
import java.util.UUID
import java.util.concurrent.Executors

object LeaderCrashReporting {
  private val worker = Executors.newSingleThreadExecutor()
  private val historyWorker = Executors.newSingleThreadExecutor()
  private lateinit var prefs: SharedPreferences
  private lateinit var application: Application
  @Volatile private var initialized = false
  @Volatile private var userId = ""
  private var installationId = ""
  private val sessionId = UUID.randomUUID().toString()
  private val context = JSONObject()
  private val actions = JSONArray()
  private val tagNames = setOf("app_version", "build_number", "runtime_version", "ota_update_id", "screen", "capture_mode", "installation_id", "app_session_id", "exit_reason", "last_action", "js_monitoring_ready", "qa_smoke")

  @Synchronized fun initialize(app: Application) {
    if (initialized) return
    try {
    application = app
    prefs = app.getSharedPreferences("leader_diagnostics_v1", Context.MODE_PRIVATE)
    installationId = prefs.getString("installation_id", null) ?: UUID.randomUUID().toString().also {
      prefs.edit().putString("installation_id", it).commit()
    }
    userId = prefs.getString("user_id", "")?.takeIf { it.matches(Regex("[0-9]{1,20}")) } ?: ""
      val info = app.packageManager.getPackageInfo(app.packageName, 0)
      val version = info.versionName ?: "unknown"
      val build = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode.toString() else info.versionCode.toString()
      context.put("user", userId).put("app_version", version).put("build_number", build)
        .put("runtime_version", version).put("ota_update_id", "unknown").put("app_session_id", sessionId)
        .put("started_at", System.currentTimeMillis())
      SentryAndroid.init(app) { options ->
        options.dsn = __LEADER_DSN__
        options.environment = "development"
        options.release = "${app.packageName}@$version+$build"
        options.dist = build
        options.isSendDefaultPii = false
        options.isDebug = false
        options.tracesSampleRate = 0.0
        options.isEnableAutoSessionTracking = false
        options.isEnableUserInteractionBreadcrumbs = false
        options.isEnableSystemEventBreadcrumbs = false
        options.isEnableActivityLifecycleBreadcrumbs = true
        options.isEnableUncaughtExceptionHandler = true
        options.isEnableNdk = true
        options.isEnableScopeSync = true
        options.isAnrEnabled = true
        options.isAttachScreenshot = false
        options.isAttachViewHierarchy = false
        options.isAttachThreads = false
        options.maxBreadcrumbs = 40
        options.maxCacheItems = 100
        options.maxQueueSize = 100
        options.beforeSend = SentryOptions.BeforeSendCallback { event, _ ->
          if (event.throwable is JavascriptException && event.getTag("js_monitoring_ready") == "true") null
          else sanitizeEvent(event)
        }
      }
      initialized = true
      Sentry.configureScope { scope ->
        scope.user = user(userId)
        scope.setTag("installation_id", installationId)
        scope.setTag("app_session_id", sessionId)
        scope.setTag("app_version", version)
        scope.setTag("build_number", build)
        scope.setTag("runtime_version", version)
        scope.setTag("capture_mode", "native")
      }
      // Opaque session ID only, below Android's 128-byte limit; never personal data.
      if (Build.VERSION.SDK_INT >= 30) try {
        app.getSystemService(ActivityManager::class.java).setProcessStateSummary(sessionId.toByteArray(Charsets.UTF_8))
      } catch (_: RuntimeException) { /* OEM may throttle this diagnostic API. */ }
      enqueue {
        persistContext()
        historyWorker.execute {
          try { collectPreviousExits() } catch (_: Exception) { /* Retry history on the next launch. */ }
        }
      }
    } catch (_: Throwable) {
      android.util.Log.w("LeaderCrashReporting", "Diagnostics initialization failed")
    }
  }

  fun constants(): MutableMap<String, Any> = mutableMapOf("enabled" to initialized, "version" to 1,
    "installationId" to installationId, "sessionId" to sessionId, "userId" to userId)

  fun setUser(id: String?, promise: Promise) {
    val safe = id?.takeIf { it.matches(Regex("[0-9]{1,20}")) } ?: ""
    worker.execute {
      try {
        if (userId != safe) synchronized(context) {
          while (actions.length() > 0) actions.remove(0)
          context.remove("last_action")
        }
        userId = safe
        prefs.edit().putString("user_id", safe).commit()
        synchronized(context) { context.put("user", safe) }
        Sentry.configureScope { it.user = user(safe) }
        persistContext()
        promise.resolve(null)
      } catch (_: Exception) { promise.reject("DIAGNOSTICS_IDENTITY", "Cannot persist diagnostic identity") }
    }
  }
  fun setRuntime(runtime: String, update: String) {
    if (!initialized) return
    enqueue {
      val safeRuntime = runtime.take(64)
      val safeUpdate = update.takeIf { it == "embedded" || it.matches(Regex("[a-fA-F0-9-]{36}")) } ?: "unknown"
      synchronized(context) { context.put("runtime_version", safeRuntime).put("ota_update_id", safeUpdate) }
      Sentry.setTag("runtime_version", safeRuntime)
      Sentry.setTag("ota_update_id", safeUpdate)
      Sentry.setTag("js_monitoring_ready", "true")
      persistContext()
    }
  }
  fun setScreen(screen: String) {
    if (!initialized || !screen.matches(Regex("[a-zA-Z0-9_()/\\[\\].-]{0,160}"))) return
    enqueue {
      synchronized(context) { context.put("screen", screen) }
      Sentry.setTag("screen", screen)
      persistContext()
    }
  }
  fun recordAction(action: String) {
    if (!initialized || !action.matches(Regex("[a-z_.:/-]{1,80}"))) return
    enqueue {
      // JS SDK already forwards the live breadcrumb; only persist the exit history here.
      synchronized(context) {
        if (actions.length() >= 30) actions.remove(0)
        actions.put(JSONObject().put("action", action).put("time", System.currentTimeMillis()))
        context.put("last_action", action)
      }
      persistContext()
    }
  }
  private fun persistContext() {
    val value = synchronized(context) { context.put("actions", actions).toString() }
    prefs.edit().putString("session_$sessionId", value).apply()
    val keys = prefs.all.keys.filter { it.startsWith("session_") && it != "session_$sessionId" }
      .sortedBy { try { JSONObject(prefs.getString(it, "{}")!!).optLong("started_at") } catch (_: Exception) { 0L } }
    if (keys.size > 15) {
      val editor = prefs.edit()
      keys.take(keys.size - 15).forEach { editor.remove(it) }
      editor.apply()
    }
  }
  private fun enqueue(action: () -> Unit) {
    worker.execute { try { action() } catch (_: Exception) { /* Diagnostics must never crash the app. */ } }
  }
  private fun collectPreviousExits() {
    if (Build.VERSION.SDK_INT < 30) return
    if (!prefs.contains("exit_checkpoint")) {
      prefs.edit().putLong("exit_checkpoint", System.currentTimeMillis()).commit()
      return // Pre-install exits have no reliable installation/session identity.
    }
    val after = prefs.getLong("exit_checkpoint", 0)
    val manager = application.getSystemService(ActivityManager::class.java)
    val records = manager.getHistoricalProcessExitReasons(application.packageName, 0, 16)
      .filter { it.timestamp > after && it.processName == application.packageName }.sortedBy { it.timestamp }
    for (exit in records) {
      val previousId = exit.processStateSummary?.toString(Charsets.UTF_8)
        ?.takeIf { it.matches(Regex("[a-fA-F0-9-]{36}")) }
      val old = previousId?.let { prefs.getString("session_$it", null) }?.let { JSONObject(it) }
      val reason = when (exit.reason) {
        ApplicationExitInfo.REASON_CRASH -> "java_crash"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "native_crash"
        ApplicationExitInfo.REASON_ANR -> "anr"
        ApplicationExitInfo.REASON_LOW_MEMORY -> "low_memory"
        ApplicationExitInfo.REASON_USER_REQUESTED -> "user_requested"
        ApplicationExitInfo.REASON_USER_STOPPED -> "user_stopped"
        ApplicationExitInfo.REASON_EXIT_SELF -> "exit_self"
        ApplicationExitInfo.REASON_SIGNALED -> "signal"
        ApplicationExitInfo.REASON_PACKAGE_UPDATED -> "package_updated"
        else -> "system_${exit.reason}"
      }
      val event = SentryEvent(Date(exit.timestamp))
      event.eventId = SentryId(UUID.nameUUIDFromBytes("$installationId:${exit.pid}:${exit.timestamp}:${exit.reason}".toByteArray()))
      event.message = Message().apply { formatted = "Android process exit: $reason" }
      event.level = if (reason in setOf("java_crash", "native_crash", "anr", "low_memory")) SentryLevel.WARNING else SentryLevel.INFO
      event.user = user(old?.optString("user") ?: "")
      event.release = "${application.packageName}@${old?.optString("app_version") ?: "unknown"}+${old?.optString("build_number") ?: "unknown"}"
      event.dist = old?.optString("build_number") ?: "unknown"
      event.setTag("installation_id", installationId)
      event.setTag("app_session_id", previousId ?: "unknown")
      event.setTag("capture_mode", "process_exit")
      event.setTag("exit_reason", reason)
      for (key in listOf("app_version", "build_number", "runtime_version", "ota_update_id", "screen", "last_action")) {
        event.setTag(key, old?.optString(key)?.takeIf { it.isNotEmpty() } ?: "unknown")
      }
      event.contexts["android_exit"] = mapOf("reason" to exit.reason, "status" to exit.status,
        "pss_kb" to exit.pss, "rss_kb" to exit.rss, "importance" to exit.importance)
      event.breadcrumbs = mutableListOf<Breadcrumb>().also { list ->
        val saved = old?.optJSONArray("actions") ?: JSONArray()
        for (i in 0 until saved.length()) {
          val item = saved.getJSONObject(i)
          list.add(Breadcrumb(Date(item.getLong("time"))).apply { category = "app"; message = item.getString("action") })
        }
      }
      Sentry.withScope { scope -> scope.clear(); Sentry.captureEvent(event) }
      // Native transport owns the durable offline envelope queue. Never wait on the UI thread.
      Sentry.flush(2000)
      prefs.edit().putLong("exit_checkpoint", exit.timestamp).commit()
    }
  }
  private fun user(value: String): User? = if (value.matches(Regex("[0-9]{1,20}"))) User().apply { id = value } else null
  private fun sanitizeEvent(event: SentryEvent): SentryEvent {
    event.request = null
    event.extras?.clear()
    event.serverName = null
    event.transaction = null
    event.user = user(event.user?.id ?: "")
    event.tags?.keys?.toList()?.filter { it !in tagNames }?.forEach { event.removeTag(it) }
    event.contexts.keys.toList().filter { it !in setOf("app", "device", "os", "runtime", "react_native_context", "android_exit") }.forEach { event.contexts.remove(it) }
    event.contexts.device?.name = null
    event.contexts.device?.id = null
    event.breadcrumbs?.removeAll { it.category != "app" && it.category != "app.lifecycle" }
    event.breadcrumbs?.forEach { crumb ->
      crumb.data.keys.toList().forEach { crumb.removeData(it) }
      crumb.message = crumb.message?.takeIf { it.matches(Regex("[a-zA-Z_.:/-]{1,80}")) } ?: "app_event"
    }
    event.exceptions?.forEach { exception ->
      exception.value = sanitize(exception.value)
      exception.stacktrace?.frames?.forEach { it.vars = null }
    }
    event.message?.let { it.formatted = sanitize(it.formatted); it.message = sanitize(it.message); it.params = null }
    return event
  }
  private fun sanitize(value: String?): String? = value
    ?.replace(Regex("(?s)(\\{|\\[\\s*\\{).*"), "[structured data omitted]")
    ?.replace(Regex("eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+"), "[redacted]")
    ?.replace(Regex("(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}"), "[email]")
    ?.replace(Regex("(?i)Bearer\\s+[^\\s,;]+"), "Bearer [redacted]")
    ?.replace(Regex("(?i)https?://[^\\s]+"), "[url]")
    ?.replace(Regex("(?i)(password|token|secret|api[_-]?key)[\\\"']?\\s*[=:]\\s*[\\\"']?[^\\s,;&\\\"']+"), "[redacted]")
    ?.take(2000)
}
