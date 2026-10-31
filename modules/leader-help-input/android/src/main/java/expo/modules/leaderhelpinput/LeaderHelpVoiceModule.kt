package expo.modules.leaderhelpinput

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

/** Local voice drafts survive screen unmounts. No network or shared storage. */
class LeaderHelpVoiceModule : Module() {
  private data class Segment(val file: File, val duration: Long)
  private data class Draft(val segments: MutableList<Segment> = mutableListOf(), var limited: Boolean = false)
  private val drafts = mutableMapOf<String, Draft>()
  private val guard = Any()
  private val handler = Handler(Looper.getMainLooper())
  private var recorder: MediaRecorder? = null
  private var recordingKey: String? = null
  private var recordingFile: File? = null
  private var startedAt = 0L
  private var loaded = false
  private val limit = Runnable { synchronized(guard) {
    recordingKey?.let { drafts[it]?.limited = true }
    runCatching { pauseRecording() }
  }; Unit }
  private fun cacheFile() = File(requireNotNull(appContext.reactContext).cacheDir, "help-voice-${UUID.randomUUID()}.m4a")
  private fun total(key: String): Long { loadDrafts(); return drafts[key]?.segments?.sumOf { it.duration } ?: 0L }

  private fun manifest() = File(requireNotNull(appContext.reactContext).cacheDir, "help-voice-drafts.json")
  private fun loadDrafts() {
    if (loaded) return
    loaded = true
    try {
      val index = JSONObject(manifest().readText())
      for (key in index.keys()) {
        val entries = index.getJSONArray(key)
        val segments = mutableListOf<Segment>()
        var limited = false
        for (i in 0 until entries.length()) {
          val entry = entries.getJSONObject(i)
          val name = entry.getString("file")
          if (!Regex("help-voice-[a-f0-9-]+\\.m4a").matches(name)) continue
          val file = File(manifest().parentFile, name)
          val duration = entry.getLong("duration")
          limited = limited || entry.optBoolean("limited", false)
          if (file.isFile && duration > 0) segments.add(Segment(file, duration))
        }
        if (segments.isNotEmpty()) drafts[key] = Draft(segments, limited)
      }
    } catch (_: Exception) { /* A cache may be cleared independently of the app. */ }
  }
  private fun saveDrafts() {
    val index = JSONObject()
    drafts.forEach { (key, draft) ->
      val entries = JSONArray()
      draft.segments.forEach { entries.put(JSONObject().put("file", it.file.name).put("duration", it.duration).put("limited", draft.limited)) }
      if (entries.length() > 0) index.put(key, entries)
    }
    val target = manifest()
    val temporary = File(target.parentFile, "help-voice-drafts.tmp")
    temporary.writeText(index.toString())
    check(temporary.renameTo(target)) { "Не удалось сохранить черновик записи" }
  }

  override fun definition() = ModuleDefinition {
    Name("LeaderHelpVoice")
    Constants("apiVersion" to 1)
    AsyncFunction("snapshot") { key: String -> synchronized(guard) { snapshot(key) } }
    AsyncFunction("start") { key: String -> synchronized(guard) {
      pauseRecording()
      check(total(key) < 60000 && drafts[key]?.limited != true) { "Достигнут лимит записи — 1 минута" }
      val file = cacheFile()
      @Suppress("DEPRECATION")
      val next = MediaRecorder()
      try {
        next.setAudioSource(MediaRecorder.AudioSource.MIC)
        next.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        next.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        next.setAudioChannels(1)
        next.setAudioSamplingRate(44100)
        next.setAudioEncodingBitRate(96000)
        next.setOutputFile(file.absolutePath)
        next.prepare()
        next.start()
        drafts.getOrPut(key) { Draft() }
        recorder = next; recordingKey = key; recordingFile = file
        startedAt = SystemClock.elapsedRealtime()
        handler.postDelayed(limit, 60000 - total(key))
      } catch (error: Exception) { next.release(); file.delete(); throw error }
      snapshot(key)
    } }
    AsyncFunction("pause") { key: String -> synchronized(guard) {
      if (recordingKey == key) pauseRecording()
      snapshot(key)
    } }
    AsyncFunction("discard") { key: String -> synchronized(guard) {
      loadDrafts()
      if (recordingKey == key) pauseRecording()
      drafts.remove(key)?.segments?.forEach { it.file.delete() }
      saveDrafts()
    } }
    AsyncFunction("exportAudio") { key: String, fromMs: Double, toMs: Double -> synchronized(guard) {
      check(recordingKey != key) { "Сначала приостановите запись" }
      exportAudio(key, fromMs.toLong(), toMs.toLong())
    } }
    OnActivityEntersBackground { synchronized(guard) { runCatching { pauseRecording() } }; Unit }
    OnDestroy { synchronized(guard) { runCatching { pauseRecording() } }; Unit }
  }

  private fun snapshot(key: String): Map<String, Any> {
    loadDrafts()
    val active = recordingKey == key && recorder != null
    val elapsed = if (active) SystemClock.elapsedRealtime() - startedAt else 0L
    val amplitude = if (active) try { recorder?.maxAmplitude ?: 0 } catch (_: Exception) { 0 } else 0
    val duration = if (drafts[key]?.limited == true) 60000L else (total(key) + elapsed).coerceAtMost(60000)
    return mapOf("recording" to active, "durationMs" to duration,
      "amplitude" to amplitude / 32767.0, "hasDraft" to (total(key) > 0 || active))
  }

  private fun pauseRecording() {
    val current = recorder ?: return
    val key = recordingKey!!
    val file = recordingFile!!
    recorder = null; recordingKey = null; recordingFile = null
    handler.removeCallbacks(limit)
    var valid = false
    var released = false
    val elapsed = SystemClock.elapsedRealtime() - startedAt
    try {
      current.stop()
      current.release()
      released = true
      val metadata = MediaMetadataRetriever()
      val duration = try {
        FileInputStream(file).use { metadata.setDataSource(it.fd) }
        metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0
      } finally { metadata.release() }
      if (duration > 0) {
        drafts.getOrPut(key) { Draft() }.segments.add(Segment(file, duration))
        valid = true
      }
      check(valid || elapsed < 250) { "Не удалось прочитать длительность записи" }
    } catch (error: Exception) {
      if (elapsed >= 250) {
        Log.e("LeaderHelpVoice", "Cannot finalize recording after ${elapsed}ms (${file.length()} bytes)", error)
        throw IllegalStateException("Не удалось сохранить голосовую запись", error)
      }
    }
    finally { if (!released) current.release(); if (!valid) file.delete(); saveDrafts() }
  }

  /** AAC sample boundaries: <24ms precision at 44.1kHz; output contains only selected samples. */
  private fun exportAudio(key: String, fromMs: Long, toMs: Long): Map<String, Any> {
    loadDrafts()
    val segments = drafts[key]?.segments ?: error("Нет записи")
    val duration = total(key).coerceAtMost(60000)
    val from = fromMs.coerceIn(0, duration)
    val to = toMs.coerceIn(from, duration)
    check(to - from >= 250) { "Выберите не менее четверти секунды" }
    val output = cacheFile()
    val muxer = MediaMuxer(output.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var muxerStarted = false
    var track = -1
    var offsetUs = 0L
    var firstUs = -1L
    var lastWrittenUs = -1L
    val buffer = ByteBuffer.allocateDirect(1024 * 1024)
    val info = MediaCodec.BufferInfo()
    try {
      for (segment in segments) {
        val extractor = MediaExtractor()
        try {
          FileInputStream(segment.file).use { extractor.setDataSource(it.fd) }
          val audioTrack = (0 until extractor.trackCount).first {
            extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
          }
          if (!muxerStarted) {
            track = muxer.addTrack(extractor.getTrackFormat(audioTrack))
            muxer.start(); muxerStarted = true
          }
          extractor.selectTrack(audioTrack)
          if (from * 1000 > offsetUs) extractor.seekTo(from * 1000 - offsetUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
          while (true) {
            val sampleUs = extractor.sampleTime
            if (sampleUs < 0) break
            val positionUs = offsetUs + sampleUs
            if (positionUs >= to * 1000) break
            if (positionUs >= from * 1000) {
              buffer.clear()
              val size = extractor.readSampleData(buffer, 0)
              if (size < 0) break
              if (firstUs < 0) firstUs = positionUs
              val pts = (positionUs - firstUs).coerceAtLeast(lastWrittenUs + 1)
              info.set(0, size, pts, 0)
              muxer.writeSampleData(track, buffer, info)
              lastWrittenUs = pts
            }
            extractor.advance()
          }
        } finally { extractor.release() }
        offsetUs += segment.duration * 1000
        if (offsetUs >= to * 1000) break
      }
      check(lastWrittenUs >= 0) { "В выбранном диапазоне нет звука" }
      muxer.stop(); muxerStarted = false
      return mapOf("uri" to "file://${output.absolutePath}", "size" to output.length(), "durationMs" to (lastWrittenUs / 1000 + 23))
    } catch (error: Exception) { output.delete(); throw error }
    finally { if (muxerStarted) try { muxer.stop() } catch (_: Exception) {}; muxer.release() }
  }
}
