const fs = require('node:fs');
const path = require('node:path');
const { withMainApplication, withDangerousMod } = require('expo/config-plugins');

function kotlinString(value) {
  return JSON.stringify(String(value)).replace(/\$/g, '\\$');
}

function nativeSource(dsn) {
  return `package com.leaderproduct.app.monitoring

import android.app.Application
import com.facebook.react.common.JavascriptException
import io.sentry.SentryOptions
import io.sentry.android.core.SentryAndroid
import io.sentry.protocol.User

object LeaderCrashReporting {
  fun initialize(application: Application) {
    try {
      SentryAndroid.init(application) { options ->
        options.dsn = ${kotlinString(dsn)}
        options.environment = "development"
        options.isSendDefaultPii = false
        options.isDebug = false
        options.tracesSampleRate = 0.0
        options.isEnableAutoSessionTracking = false
        options.isEnableUserInteractionBreadcrumbs = false
        options.isEnableSystemEventBreadcrumbs = false
        options.isEnableActivityLifecycleBreadcrumbs = true
        options.isAttachScreenshot = false
        options.isAttachViewHierarchy = false
        options.maxBreadcrumbs = 40
        options.maxCacheItems = 50
        options.beforeSend = SentryOptions.BeforeSendCallback { event, _ ->
          // React forwards fatal JS errors to Java too. JS SDK already captures
          // these after bootstrap; retain the native fallback before JS is ready.
          if (event.throwable is JavascriptException && event.getTag("js_monitoring_ready") == "true") {
            return@BeforeSendCallback null
          }
          event.request = null
          event.extras?.clear()
          val id = event.user?.id
          event.user = if (id == null) null else User().apply { this.id = id }
          event.breadcrumbs?.removeAll { it.category != "app" && it.category != "app.lifecycle" }
          event.exceptions?.forEach { exception ->
            exception.value = sanitize(exception.value)
            exception.stacktrace?.frames?.forEach { it.vars = null }
          }
          event.message?.let { it.formatted = sanitize(it.formatted); it.message = sanitize(it.message); it.params = null }
          event.contexts.device?.name = null
          event
        }
      }
    } catch (_: Throwable) {
      // Diagnostics must never prevent startup. Never log DSN or event bodies.
      android.util.Log.w("LeaderCrashReporting", "Crash reporting initialization failed")
    }
  }

  private fun sanitize(value: String?): String? = value
    ?.replace(Regex("eyJ[A-Za-z0-9_-]+\\\\.[A-Za-z0-9_-]+\\\\.[A-Za-z0-9_-]+"), "[redacted]")
    ?.replace(Regex("(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\\\\.[A-Z]{2,}"), "[email]")
    ?.replace(Regex("(?i)Bearer\\\\s+[^\\\\s,;]+"), "Bearer [redacted]")
    ?.replace(Regex("(?i)https?://[^\\\\s]+"), "[url]")
    ?.replace(Regex("(?i)(password|token|secret|api[_-]?key)[=:]\\\\s*[^\\\\s,;&]+"), "[redacted]")
    ?.take(2000)
}
`;
}

function patchMainApplication(source, enabled) {
  const line = '    com.leaderproduct.app.monitoring.LeaderCrashReporting.initialize(this)';
  const clean = source.replace(/\n[ \t]*com\.leaderproduct\.app\.monitoring\.LeaderCrashReporting\.initialize\(this\)/g, '');
  if (!enabled) return clean;
  if (!clean.includes('super.onCreate()')) throw new Error('Cannot configure early Sentry: MainApplication.onCreate not found');
  return clean.replace('super.onCreate()', `super.onCreate()\n${line}`);
}

module.exports = function withDevCrashReporting(config) {
  const enabled = process.env.EXPO_PUBLIC_UPDATE_CHANNEL === 'dev' && process.env.EXPO_PUBLIC_SENTRY_ENABLED === 'true';
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
  if (enabled && !/^https:\/\/[^\s]+$/.test(dsn)) throw new Error('Dev Sentry requires an HTTPS DSN');
  config = withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('Expected Kotlin MainApplication');
    mod.modResults.contents = patchMainApplication(mod.modResults.contents, enabled);
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    if (!enabled) return mod;
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java/com/leaderproduct/app/monitoring');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'LeaderCrashReporting.kt'), nativeSource(dsn));
    return mod;
  }]);
};
module.exports.patchMainApplication = patchMainApplication;
module.exports.nativeSource = nativeSource;
