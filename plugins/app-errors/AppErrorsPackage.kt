package com.leaderproduct.app.diagnostics

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import java.util.concurrent.Executors

class AppErrorsPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(AppErrorsModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class AppErrorsModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  // OS tombstone reads must not stall the shared React Native module queue.
  private val reader = Executors.newSingleThreadExecutor()
  override fun invalidate() { reader.shutdown(); super.invalidate() }
  override fun getName() = "LeaderAppErrors"
  @ReactMethod fun setIdentity(owner: String) = AppErrorStore.setIdentity(owner)
  @ReactMethod fun setScreen(screen: String) = AppErrorStore.setScreen(screen)
  @ReactMethod fun setRuntime(runtime: String, update: String) = AppErrorStore.setRuntime(runtime, update)
  @ReactMethod fun pending(owner: String, promise: Promise) = reader.execute {
    try { promise.resolve(AppErrorStore.pending(owner)) }
    catch (_: Exception) { promise.reject("DIAGNOSTICS_READ", "Cannot read diagnostics") }
  }
  @ReactMethod fun acknowledge(owner: String, id: String, promise: Promise) = reader.execute {
    try { AppErrorStore.acknowledge(owner, id); promise.resolve(null) }
    catch (_: Exception) { promise.reject("DIAGNOSTICS_ACK", "Cannot acknowledge diagnostics") }
  }
}
