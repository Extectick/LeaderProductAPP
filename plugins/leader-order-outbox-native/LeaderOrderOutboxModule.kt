package __LEADER_APP_PACKAGE__.orderoutbox

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.common.LifecycleState
import java.util.concurrent.TimeUnit

class LeaderOrderOutboxModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), LifecycleEventListener {
  init { context.addLifecycleEventListener(this) }
  override fun getName() = "LeaderOrderOutbox"
  @ReactMethod fun setPending(pending: Boolean, promise: Promise) {
    try {
      // Only a scheduling hint. Payloads and credentials remain in SQLite/SecureStore.
      if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("pending", pending).commit()) {
        throw IllegalStateException("Unable to persist outbox scheduling state")
      }
      if (pending && context.lifecycleState != LifecycleState.RESUMED) schedule(context)
      // Do not cancel a running worker after its last ACK: that cancels the JS
      // callback before WorkManager can mark it successful. Logout also clears
      // this hint; worker/session fencing prevents any further transmission.
      promise.resolve(null)
    } catch (e: Exception) { promise.reject("ORDER_OUTBOX_SCHEDULE", "Не удалось запланировать отправку", e) }
  }
  override fun onHostResume() {}
  override fun onHostPause() { if (pending(context)) schedule(context) }
  override fun onHostDestroy() {}
  override fun invalidate() { context.removeLifecycleEventListener(this); super.invalidate() }
  companion object {
    const val PREFS = "leader_order_outbox"
    const val WORK_NAME = "LEADER_ORDER_OUTBOX"
    fun pending(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("pending", false)
    fun schedule(context: Context) {
      val request = OneTimeWorkRequestBuilder<LeaderOrderOutboxWorker>()
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, request)
    }
  }
}
