package com.leaderproduct.app.diagnostics

import android.annotation.TargetApi
import android.app.ApplicationExitInfo
import android.os.Build
import java.io.ByteArrayOutputStream
import java.io.InputStream

/** Optional stack evidence from the OS trace. An unavailable trace still leaves the exit reason. */
@TargetApi(30)
object AppExitFrames {
  private const val maxInput = 2 * 1024 * 1024
  private const val maxFrames = 16
  private const val parseBudgetNanos = 200_000_000L
  private val processHeader = Regex("""^----- (?:pid |dumping pid: )(\d+) at\b""")
  private val mainThread = Regex("""^"main"\s+[^"]*?\btid=1\b""")
  private val managedFrame = Regex("""^\s*at\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\s*\(([^()]*)\)\s*$""")
  private val lineSuffix = Regex(""":(\d{1,9})$""")

  // Only system/APP binary names. App sandboxes and mmap'd documents may have arbitrary names.
  private val libraries = setOf(
    "libc", "libdl", "libm", "libart", "libartbase", "libbase", "libutils", "libcutils",
    "liblog", "libbinder", "libgui", "libui", "libhwui", "libandroid", "libandroid_runtime",
    "libc++", "libc++_shared", "libandroidx.graphics.path", "libanimation-decoder-gif",
    "libappmodules", "libavif_android", "libbarhopper_v3", "libdatastore_shared_counter",
    "libexpo-modules-core", "libexpo-modules-jsi", "libexpo-modules-v2", "libexpo-modules-worklets",
    "libexpo-sqlite", "libexpo-updates", "libfbjni", "libgesturehandler", "libgifimage",
    "libhermes", "libhermestooling", "libhermesvm", "libimage_processing_util_jni",
    "libimagepipeline", "libjsi", "libmaplibre", "libmmkv", "libnative-filters",
    "libnative-imagetranscoder", "libreact_codegen_rngesturehandler_codegen", "libreact_codegen_rnpicker",
    "libreact_codegen_rnscreens", "libreact_codegen_rnsvg", "libreact_codegen_safeareacontext",
    "libreactnative", "libreanimated", "librnscreens", "libsentry", "libsentry-android",
    "libsentry-tm-perf-logger", "libstatic-webp", "libsurface_util_jni", "libworklets", "libzstd-kmp"
  )

  fun read(exit: ApplicationExitInfo): List<String> = try {
    val deadline = System.nanoTime() + parseBudgetNanos
    when {
      exit.reason == ApplicationExitInfo.REASON_ANR ->
        exit.traceInputStream?.use { parseAnr(readPrefix(it, deadline), exit.pid, deadline) }.orEmpty()
      Build.VERSION.SDK_INT >= 31 && exit.reason == ApplicationExitInfo.REASON_CRASH_NATIVE ->
        exit.traceInputStream?.use { parseTombstone(readPrefix(it, deadline), exit.pid, deadline) }.orEmpty()
      else -> emptyList()
    }
  } catch (_: Exception) { emptyList() }

  private fun readPrefix(stream: InputStream, deadline: Long): ByteArray {
    val out = ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    while (out.size() < maxInput && System.nanoTime() - deadline < 0) {
      val n = stream.read(buffer, 0, minOf(buffer.size, maxInput - out.size()))
      if (n <= 0) break
      out.write(buffer, 0, n)
    }
    return out.toByteArray()
  }

  internal fun parseAnr(bytes: ByteArray, pid: Int, deadline: Long = System.nanoTime() + parseBudgetNanos): List<String> {
    var matchingProcess = false
    var inMain = false
    var start = 0
    val frames = mutableListOf<String>()
    for (end in 0 until minOf(bytes.size, maxInput)) {
      if ((end and 4095) == 0 && System.nanoTime() - deadline >= 0) break
      if (bytes[end] != 10.toByte()) continue
      val length = end - start
      val offset = start
      start = end + 1
      if (length > 1024) continue
      val line = String(bytes, offset, length, Charsets.UTF_8).trimEnd('\r')
      if (line.startsWith("----- ")) {
        if (inMain) break
        matchingProcess = processHeader.find(line)?.groupValues?.get(1)?.toIntOrNull() == pid
        continue
      }
      if (!matchingProcess) continue
      if (line.startsWith('"')) {
        if (inMain) break
        inMain = mainThread.containsMatchIn(line)
      } else if (inMain) {
        val frame = managedFrame.matchEntire(line) ?: continue
        val lineNo = lineSuffix.find(frame.groupValues[2])?.groupValues?.get(1)
        val symbol = frame.groupValues[1] + (lineNo?.let { ":$it" } ?: "")
        if (symbol.length <= 160) frames.add(symbol)
        if (frames.size == maxFrames) break
      }
    }
    return frames
  }

  // AOSP system/core/debuggerd/proto/tombstone.proto. Views share a bounded byte array.
  // Unknown fields (including memory, log buffers and abort text) are skipped by wire length.
  internal fun parseTombstone(bytes: ByteArray, pid: Int, deadline: Long = System.nanoTime() + parseBudgetNanos): List<String> {
    try {
      val end = minOf(bytes.size, maxInput)
      var process = 0L
      var tid = 0L
      var arch: Long? = null
      val header = Wire(bytes, 0, end, deadline)
      try {
        while (header.hasNext) {
          when (val tag = header.tag()) {
            8 -> arch = header.number()
            5 * 8 -> process = header.number()
            6 * 8 -> tid = header.number()
            else -> header.skip(tag)
          }
        }
        // ARM32 is proto3's omitted zero value. A capped prefix might omit a later arch.
        if (end < maxInput && arch == null) arch = 0
      } catch (invalid: IllegalArgumentException) {
        if (end < maxInput) throw invalid
      }
      if (process != pid.toLong() || tid !in 1..Int.MAX_VALUE.toLong()) return emptyList()
      val abi = when (arch) {
        0L -> "arm"
        1L -> "arm64"
        2L -> "x86"
        3L -> "x86_64"
        4L -> "riscv64"
        else -> "unknown"
      }
      val tombstone = Wire(bytes, 0, end, deadline)
      while (tombstone.hasNext) {
        val tag = tombstone.tag()
        if (tag != 16 * 8 + 2) { tombstone.skip(tag); continue }
        val entry = tombstone.part()
        var key = 0L
        var thread: Wire? = null
        while (entry.hasNext) {
          when (val mapTag = entry.tag()) {
            8 -> key = entry.number()
            18 -> thread = entry.part()
            else -> entry.skip(mapTag)
          }
        }
        if (key == tid && thread != null) return readThread(thread, abi)
      }
    } catch (_: IllegalArgumentException) { /* Unknown, oversized or truncated format. */ }
    return emptyList()
  }

  private fun readThread(thread: Wire, abi: String): List<String> {
    val frames = mutableListOf<String>()
    while (thread.hasNext && frames.size < maxFrames) {
      val tag = thread.tag()
      if (tag != 4 * 8 + 2) { thread.skip(tag); continue }
      val frame = thread.part()
      // Zero is a valid proto3 default for rel_pc.
      var pc = 0L
      var library: String? = null
      while (frame.hasNext) {
        when (val field = frame.tag()) {
          8 -> pc = frame.number()
          6 * 8 + 2 -> library = frame.part().libraryName()
          else -> frame.skip(field)
        }
      }
      if (library != null && pc in 0..999_999_999L) frames.add("native.$abi.$library.so:$pc")
    }
    return frames
  }

  private class Wire(private val bytes: ByteArray, private var pos: Int, private val end: Int, private val deadline: Long) {
    val hasNext get() = pos < end

    fun number(): Long {
      var value = 0L
      for (shift in 0..63 step 7) {
        require(hasNext)
        val octet = bytes[pos++].toInt() and 255
        require(shift < 63 || octet <= 1)
        value = value or ((octet and 127).toLong() shl shift)
        if (octet < 128) return value
      }
      throw IllegalArgumentException()
    }

    fun tag(): Int {
      require(System.nanoTime() - deadline < 0)
      val tag = number()
      require(tag in 8..Int.MAX_VALUE.toLong())
      return tag.toInt()
    }

    fun part(): Wire {
      val len = number()
      require(len in 0..(end - pos).toLong())
      val start = pos
      pos += len.toInt()
      return Wire(bytes, start, pos, deadline)
    }

    fun skip(tag: Int) {
      when (tag and 7) {
        0 -> number()
        1 -> { require(end - pos >= 8); pos += 8 }
        2 -> part()
        5 -> { require(end - pos >= 4); pos += 4 }
        else -> throw IllegalArgumentException()
      }
    }

    fun libraryName(): String? {
      if (end - pos !in 4..1024) return null
      var start = end
      while (start > pos && bytes[start - 1] != '/'.code.toByte() && bytes[start - 1] != '!'.code.toByte()) start--
      if (end - start !in 4..80) return null
      val name = String(bytes, start, end - start, Charsets.US_ASCII)
      if (!name.endsWith(".so")) return null
      // Map punctuation in known NDK basenames to identifier characters for the API wire format.
      val base = name.removeSuffix(".so")
      return if (base in libraries) base.replace("+", "p").replace('-', '_') else null
    }
  }
}
