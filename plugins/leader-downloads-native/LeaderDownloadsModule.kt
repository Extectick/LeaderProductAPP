package __LEADER_APP_PACKAGE__.downloads

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableNativeMap
import java.io.File

class LeaderDownloadsModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "LeaderDownloads"

  @ReactMethod
  fun enqueue(config: ReadableMap, promise: Promise) {
    try {
      val url = config.getString("url")?.trim().orEmpty()
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        throw IllegalArgumentException("Download URL must use HTTP or HTTPS")
      }

      val requestedName = config.getString("fileName")?.trim().orEmpty()
      val fileName = uniqueFileName(sanitizeFileName(requestedName))
      val mimeType = config.getString("mimeType")?.trim().orEmpty().ifBlank {
        "application/octet-stream"
      }
      val title = config.getString("title")?.trim().orEmpty().ifBlank { fileName }
      val description = config.getString("description")?.trim().orEmpty().ifBlank {
        "Скачивание файла"
      }

      val request = DownloadManager.Request(Uri.parse(url))
        .setTitle(title)
        .setDescription(description)
        .setMimeType(mimeType)
        .setAllowedOverMetered(true)
        .setAllowedOverRoaming(true)
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)

      if (config.hasKey("headers") && config.getType("headers") == ReadableType.Map) {
        val headers = config.getMap("headers")
        if (headers != null) addHeaders(request, headers)
      }

      val manager = reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
      val downloadId = manager.enqueue(request)
      val result = WritableNativeMap().apply {
        putString("downloadId", downloadId.toString())
        putString("fileName", fileName)
        putString("relativePath", "${Environment.DIRECTORY_DOWNLOADS}/$fileName")
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("DOWNLOAD_ENQUEUE_FAILED", error.message ?: "Could not start download", error)
    }
  }

  private fun addHeaders(request: DownloadManager.Request, headers: ReadableMap) {
    val iterator = headers.keySetIterator()
    while (iterator.hasNextKey()) {
      val name = iterator.nextKey()
      if (headers.getType(name) != ReadableType.String) continue
      val value = headers.getString(name)?.trim().orEmpty()
      if (name.isBlank() || value.isBlank() || name.contains('\n') || name.contains('\r') || value.contains('\n') || value.contains('\r')) continue
      request.addRequestHeader(name, value)
    }
  }

  private fun sanitizeFileName(value: String): String {
    val cleaned = value
      .replace(Regex("[\\u0000-\\u001F\\\\/:*?\"<>|]+"), "_")
      .trim()
      .trim('.')
    return cleaned.ifBlank { "download.pdf" }.take(180)
  }

  private fun uniqueFileName(fileName: String): String {
    val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    if (!File(downloads, fileName).exists()) return fileName

    val dot = fileName.lastIndexOf('.')
    val base = if (dot > 0) fileName.substring(0, dot) else fileName
    val extension = if (dot > 0) fileName.substring(dot) else ""
    for (index in 2..999) {
      val candidate = "$base ($index)$extension"
      if (!File(downloads, candidate).exists()) return candidate
    }
    return "${base}_${System.currentTimeMillis()}$extension"
  }
}
