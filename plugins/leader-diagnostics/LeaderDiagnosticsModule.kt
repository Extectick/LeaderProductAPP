package com.leaderproduct.app.monitoring

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class LeaderDiagnosticsModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "LeaderDiagnostics"
  override fun getConstants(): MutableMap<String, Any> = LeaderCrashReporting.constants()
  @ReactMethod fun setUser(id: String?, promise: Promise) = LeaderCrashReporting.setUser(id, promise)
  @ReactMethod fun setRuntime(runtime: String, update: String) = LeaderCrashReporting.setRuntime(runtime, update)
  @ReactMethod fun setScreen(screen: String) = LeaderCrashReporting.setScreen(screen)
  @ReactMethod fun recordAction(action: String) = LeaderCrashReporting.recordAction(action)
}
