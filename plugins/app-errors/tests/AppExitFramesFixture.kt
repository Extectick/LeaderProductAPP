package com.leaderproduct.app.diagnostics

import java.io.ByteArrayOutputStream

/** JVM fixtures for an Android API 31+ Tombstone and an API 30+ ART thread dump. */
object AppExitFramesFixture {
  private fun number(value: Long): ByteArray {
    var v = value
    return ByteArrayOutputStream().apply {
      while (v >= 128) { write((v.toInt() and 127) or 128); v = v ushr 7 }
      write(v.toInt())
    }.toByteArray()
  }

  private fun scalar(id: Int, v: Long) = number((id * 8).toLong()) + number(v)
  private fun field(id: Int, bytes: ByteArray) =
    number((id * 8 + 2).toLong()) + number(bytes.size.toLong()) + bytes
  private fun text(id: Int, value: String) = field(id, value.toByteArray())
  private fun frame(name: String, pc: Long) =
    field(4, text(6, name) + text(4, "secret_function") + scalar(2, 90001) + scalar(1, pc))
  private fun thread(key: Int, frames: ByteArray) =
    field(16, field(2, text(2, "private_thread_name") + frames) + scalar(1, key.toLong()))

  @JvmStatic fun main(args: Array<String>) {
    val bad = thread(2, frame("libhermes.so", 4567))
    val frames = frame("/data/users/private/path/libc.so", 63) +
      frame("/data/app/base.apk!libexpo-updates.so", 123) +
      frame("/private/libcustomername.so", 88) + frame("libhwui.so", 1000000000) +
      frame("/private/libreactnative.so", 416235)
    val tombstone = text(14, "private_abort_text") + bad + thread(42, frames) + scalar(5, 3) + scalar(6, 42) + scalar(1, 3)
    check(AppExitFrames.parseTombstone(tombstone, 3) == listOf(
      "native.x86_64.libc.so:63", "native.x86_64.libexpo_updates.so:123", "native.x86_64.libreactnative.so:416235"
    ))
    check(AppExitFrames.parseTombstone(tombstone, 42).isEmpty())
    check(AppExitFrames.parseTombstone(tombstone.copyOf(tombstone.size - 1), 3).isEmpty())
    check(AppExitFrames.parseTombstone(byteArrayOf(0xFF.toByte(), 0xFF.toByte()), 3).isEmpty())
    check(AppExitFrames.parseTombstone(scalar(5, 1) + scalar(6, 2) + bad, 1, System.nanoTime() - 1).isEmpty())
    val many = ByteArrayOutputStream().apply { repeat(40) { write(frame("libc.so", it.toLong())) } }.toByteArray()
    val capped = AppExitFrames.parseTombstone(scalar(5, 1) + scalar(6, 1) + thread(1, many), 1)
    check(capped.size == 16 && capped.first() == "native.arm.libc.so:0" && capped.last() == "native.arm.libc.so:15")
    val unknown = scalar(1, 42) + scalar(5, 1) + scalar(6, 2) + bad
    check(AppExitFrames.parseTombstone(unknown, 1) == listOf("native.unknown.libhermes.so:4567"))
    val dump = """
      ----- pid 2 at 2026-01-02 -----
      "main" tid=1 Native
        at Wrong.Process.thing(Wrong.java:11)
      ----- end 2 -----
      ----- dumping pid: 3 at 1000
      ----- pid 3 at 2026-01-02 -----
      Cmd line: secret
      "worker" prio=5 tid=14
        at Unrelated.Thread.run(Other.java:3)
      "main" prio=5 tid=1 Native
        native: #00 pc deadbeef /private/path.so (secret_target+666)
        at android.os.MessageQueue.nativePollOnce (Native method)
        at com.leaderproduct.app.View.draw(PrivateFile.java:281)
        - locked <secret>
      "binder" tid=3 Waiting
        at org.example.Private.call(secret.java:7)
    """.trimIndent() + "\n"
    val bytes = dump.toByteArray()
    check(AppExitFrames.parseAnr(bytes, 3) == listOf("android.os.MessageQueue.nativePollOnce", "com.leaderproduct.app.View.draw:281"))
    check(AppExitFrames.parseAnr(bytes, 1).isEmpty())
    check(AppExitFrames.parseAnr(bytes, 3, System.nanoTime() - 1).isEmpty())
    val beyondPrefix = ByteArray(2 * 1024 * 1024) + bytes
    check(AppExitFrames.parseAnr(beyondPrefix, 3).isEmpty())
    println("AppExitFrames fixtures passed")
  }
}
