package __LEADER_APP_PACKAGE__.tracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class LeaderTrackingBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    when (intent?.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED -> LeaderTrackingService.startIfEnabled(context)
    }
  }
}
