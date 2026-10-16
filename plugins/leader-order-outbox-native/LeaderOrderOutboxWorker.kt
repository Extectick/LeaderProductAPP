package __LEADER_APP_PACKAGE__.orderoutbox

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import expo.modules.backgroundtask.BackgroundTaskScheduler
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout

class LeaderOrderOutboxWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    if (!LeaderOrderOutboxModule.pending(applicationContext)) return Result.success()
    // Foreground dispatcher is already active. Retain the job for the next pause.
    if (BackgroundTaskScheduler.inForeground) return Result.retry()
    return try {
      withTimeout(120_000L) { BackgroundTaskScheduler.runTasks(applicationContext, applicationContext.packageName) }
      if (LeaderOrderOutboxModule.pending(applicationContext)) Result.retry() else Result.success()
    } catch (e: TimeoutCancellationException) { Result.retry() }
      catch (e: CancellationException) { throw e }
      catch (e: Exception) { Result.retry() }
  }
  override suspend fun getForegroundInfo(): ForegroundInfo {
    val channelId = "leader_order_uploads"
    val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(channelId, "Отправка заказов", NotificationManager.IMPORTANCE_LOW))
    val icon = applicationContext.applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.stat_sys_upload
    val notification = NotificationCompat.Builder(applicationContext, channelId).setSmallIcon(icon)
      .setContentTitle("Отправка документов").setContentText("Сохраняем очередь в API")
      .setOngoing(true).setSilent(true).build()
    return if (Build.VERSION.SDK_INT >= 29) ForegroundInfo(21916, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      else ForegroundInfo(21916, notification)
  }
}
