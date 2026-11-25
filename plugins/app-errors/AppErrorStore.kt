package com.leaderproduct.app.diagnostics

import android.app.ActivityManager
import android.app.Application
import android.app.ApplicationExitInfo
import android.os.Build
import android.os.Process
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** Private, bounded crash journal. Nothing in the failing process attempts a network request. */
object AppErrorStore {
  private const val environment = "__LEADER_APP_ERROR_ENV__"
  private const val lifetime = 7L * 24 * 60 * 60 * 1000
  private val identifier = Regex("[A-Za-z_$][A-Za-z0-9_$]*(?:\\.[A-Za-z_$][A-Za-z0-9_$]*)+")
  private val ownerId = Regex("[1-9][0-9]{0,15}")
  private val screens = setOf("orders", "help", "profile", "auth", "services", "home", "admin", "unknown")
  private val session = UUID.randomUUID().toString().replace("-", "")
  private lateinit var app: Application
  private lateinit var dir: File
  @Volatile private var active: Snapshot? = null

  private data class Snapshot(val owner: String, val screen: String, val version: String,
                              val build: String, val runtime: String, val update: String,
                              val started: Long, val pid: Int) {
    fun json() = JSONObject().put("ownerId", owner).put("screen", screen).put("appVersion", version)
      .put("buildNumber", build).put("runtimeVersion", runtime).put("updateId", update)
      .put("started", started).put("pid", pid).put("environment", environment)
  }

  @Synchronized fun initialize(application: Application) {
    if (active != null) return
    try {
      if (Build.VERSION.SDK_INT >= 28 && Application.getProcessName() != application.packageName) return
      app = application
      dir = File(app.noBackupFilesDir, "leader_app_errors").apply { mkdirs() }
      val pkg = app.packageManager.getPackageInfo(app.packageName, 0)
      val version = pkg.versionName ?: "unknown"
      val build = if (Build.VERSION.SDK_INT >= 28) pkg.longVersionCode else pkg.versionCode.toLong()
      active = Snapshot("", "unknown", version, build.toString(), version, "embedded", System.currentTimeMillis(), Process.myPid())
      val previous = Thread.getDefaultUncaughtExceptionHandler() ?: return
      Thread.setDefaultUncaughtExceptionHandler { thread, error ->
        try { saveException(error) } catch (_: Throwable) { /* Always invoke Android's handler below. */ }
        finally { previous.uncaughtException(thread, error) }
      }
      if (Build.VERSION.SDK_INT >= 30) try {
        app.getSystemService(ActivityManager::class.java).setProcessStateSummary(session.toByteArray(Charsets.US_ASCII))
      } catch (_: RuntimeException) { /* Match the recorded process lifetime if the OS throttles this. */ }
      prune()
    } catch (_: Exception) { /* Diagnostics must never prevent startup. */ }
  }

  @Synchronized fun setIdentity(value: String) = change { it.copy(owner = value.takeIf(ownerId::matches) ?: "") }
  @Synchronized fun setScreen(value: String) = change { it.copy(screen = value.takeIf(screens::contains) ?: "unknown") }
  @Synchronized fun setRuntime(runtime: String, update: String) = change {
    it.copy(runtime = runtime.takeIf { n -> n.matches(Regex("[0-9]{1,4}(?:\\.[0-9]{1,4}){1,3}")) } ?: it.version,
      update = update.takeIf { n -> n.matches(Regex("[0-9a-fA-F-]{36}")) } ?: "embedded")
  }

  private fun change(transform: (Snapshot) -> Snapshot) {
    val old = active ?: return
    val next = transform(old)
    if (old == next) return
    active = next
    // Called on the native-module queue. Persist logout even when the next user never signs in.
    try { write(File(dir, "session_$session"), next.json()) } catch (_: Exception) { }
  }

  private fun saveException(error: Throwable) {
    val snapshot = active ?: return
    if (snapshot.owner.isEmpty()) return
    val cause = generateSequence(error) { it.cause }.take(8).last()
    val evidence = JSONObject().put("androidApi", Build.VERSION.SDK_INT)
    cause.javaClass.name.takeIf { it.length <= 160 && identifier.matches(it) }?.let { evidence.put("exceptionClass", it) }
    val frames = JSONArray()
    for (frame in cause.stackTrace.take(16)) {
      val symbol = frame.className + "." + frame.methodName
      if (symbol.length > 148 || !identifier.matches(symbol)) continue
      frames.put(if (frame.lineNumber > 0) "$symbol:${frame.lineNumber}" else symbol)
    }
    evidence.put("frames", frames)
    write(File(dir, "event_$session"), event(session, snapshot.json(), System.currentTimeMillis(), "java_exception", evidence))
  }

  private fun event(id: String, context: JSONObject, time: Long, kind: String, evidence: JSONObject): JSONObject {
    return JSONObject(context.toString()).apply {
      remove("pid"); remove("started")
      put("eventId", id); put("occurredAt", time); put("kind", kind); put("nativeEvidence", evidence)
    }
  }

  private fun write(file: File, json: JSONObject) {
    val atomic = AtomicFile(file)
    val stream = atomic.startWrite()
    try { stream.write(json.toString().toByteArray(Charsets.UTF_8)); atomic.finishWrite(stream) }
    catch (failure: Throwable) { atomic.failWrite(stream); throw failure }
  }

  private fun read(file: File): JSONObject? = try {
    JSONObject(AtomicFile(file).openRead().bufferedReader().use { it.readText() })
  } catch (_: Exception) { null }

  private fun prune() {
    val now = System.currentTimeMillis()
    for (prefix in listOf("event_", "session_")) {
      val files = dir.listFiles { f -> f.name.matches(Regex(prefix + "[a-f0-9]{32}")) } ?: continue
      files.sortedByDescending { it.lastModified() }.forEachIndexed { i, file ->
        if (i >= 24 || now - file.lastModified() > lifetime) AtomicFile(file).delete()
      }
    }
  }

  @android.annotation.TargetApi(30)
  private fun importSystemExits() {
    val sessions = dir.listFiles { f -> f.name.matches(Regex("session_[a-f0-9]{32}")) && f.name != "session_$session" }
      ?.mapNotNull { f -> read(f)?.let { f to it } } ?: return
    if (sessions.isEmpty()) return
    val exits = app.getSystemService(ActivityManager::class.java).getHistoricalProcessExitReasons(app.packageName, 0, 32)
    for (exit in exits) {
      if (exit.processName != app.packageName) continue
      val kind = when (exit.reason) {
        ApplicationExitInfo.REASON_CRASH -> "java_exception"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "native_crash"
        ApplicationExitInfo.REASON_ANR -> "anr"
        else -> continue
      }
      val stamp = exit.processStateSummary?.toString(Charsets.US_ASCII)
      val candidates = sessions.filter { (_, s) -> s.optInt("pid") == exit.pid && s.optLong("started") <= exit.timestamp }
      val (file, old) = if (stamp?.matches(Regex("[a-f0-9]{32}")) == true)
        candidates.find { it.first.name == "session_$stamp" } ?: continue
      else candidates.maxByOrNull { it.second.optLong("started") } ?: continue
      if (!file.exists() || exit.timestamp >= (active?.started ?: 0)) continue
      val id = file.name.removePrefix("session_")
      val target = File(dir, "event_$id")
      if (!old.optString("ownerId").matches(ownerId) || old.optString("environment") != environment) continue
      if (!target.exists()) {
        val evidence = JSONObject().put("androidApi", Build.VERSION.SDK_INT).put("exitReason", exit.reason)
        if (kind == "native_crash" && exit.status in 1..127) evidence.put("signal", exit.status)
        if (kind == "native_crash" || kind == "anr") {
          val frames = AppExitFrames.read(exit)
          if (frames.isNotEmpty()) evidence.put("frames", JSONArray(frames))
        }
        write(target, event(id, old, exit.timestamp, kind, evidence))
      }
      // Removing the snapshot makes each system record importable only once.
      AtomicFile(file).delete()
    }
  }

  fun pending(owner: String): String {
    if (active == null || !ownerId.matches(owner)) return "[]"
    prune()
    if (Build.VERSION.SDK_INT >= 30) try { importSystemExits() } catch (_: Exception) { /* Retry on next drain. */ }
    val result = JSONArray()
    dir.listFiles { f -> f.name.matches(Regex("event_[a-f0-9]{32}")) }?.forEach { f ->
      read(f)?.takeIf { it.optString("ownerId") == owner && it.optString("environment") == environment }?.let { result.put(it) }
    }
    return result.toString()
  }

  fun acknowledge(owner: String, id: String) {
    if (active == null || !id.matches(Regex("[a-f0-9]{32}")) || !ownerId.matches(owner)) return
    val file = File(dir, "event_$id")
    val saved = read(file) ?: return
    if (saved.optString("ownerId") != owner || saved.optString("environment") != environment) return
    AtomicFile(File(dir, "session_$id")).delete()
    AtomicFile(file).delete()
  }
}
