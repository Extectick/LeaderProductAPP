package expo.modules.leaderhelpinput

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.res.ColorStateList
import android.graphics.Canvas
import android.graphics.Color
import android.os.SystemClock
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewTreeObserver
import android.view.animation.PathInterpolator
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class HelpEditText(context: Context) : EditText(context) {
    var selectionListener: (() -> Unit)? = null
    override fun onSelectionChanged(start: Int, end: Int) {
      super.onSelectionChanged(start, end)
      selectionListener?.invoke()
    }

}

/** One native layout/animation clock. No text mirror or JS-driven height. */
@SuppressLint("ViewConstructor")
class LeaderHelpInputView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true
  private val density = resources.displayMetrics.density
  private fun px(dp: Float) = (dp * density).roundToInt()
  private fun dp(px: Int) = px / density
  private val debug = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
  val onTextEdited by EventDispatcher<Map<String, Any>>()
  val onGeometry by EventDispatcher<Map<String, Any>>()
  var reducedMotion = false
  private var suppressChange = false
  private var eventCount = 0
  private var dirtyText = true
  private var lastWidth = 0
  private var textHeight = px(22f)
  private var viewportHeight = px(22f)
  private var visualHeight = 46f
  private var targetHeight = 46f
  private var animation: ValueAnimator? = null
  private var revealCaret = false
  private var disposed = false
  private var testGeneration = 0
  private var frames = ArrayDeque<Map<String, Any>>()
  private var clippedFrames = 0
  private var observedFrames = 0
  private val transitions = ArrayDeque<Map<String, Any>>()
  // Expo's requestLayout posts its layout pass. Flush pending text layout before
  // drawing too: otherwise a keystroke can paint one frame with yesterday's size.
  private val beforeDraw = ViewTreeObserver.OnPreDrawListener {
    if (dirtyText || revealCaret) {
      measureAndLayout()
      onLayout(false, left, top, right, bottom)
    }
    true
  }

  val editor = HelpEditText(context).apply {
    background = null
    setPadding(0, 0, 0, 0)
    includeFontPadding = false
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
    val line = 22f * resources.displayMetrics.scaledDensity
    setLineSpacing(line - (paint.fontMetricsInt.descent - paint.fontMetricsInt.ascent), 1f)
    gravity = Gravity.TOP or Gravity.START
    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
    imeOptions = EditorInfo.IME_FLAG_NO_EXTRACT_UI
    setHorizontallyScrolling(false)
    breakStrategy = android.text.Layout.BREAK_STRATEGY_SIMPLE
    isVerticalScrollBarEnabled = false
    overScrollMode = View.OVER_SCROLL_NEVER
    contentDescription = "Сообщение"
  }

  init {
    clipChildren = true
    clipToPadding = false
    addView(editor)
    editor.selectionListener = { revealCaret = true; requestLayout() }
    editor.addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
      override fun afterTextChanged(s: Editable?) {
        dirtyText = true
        revealCaret = true
        requestLayout()
        if (!suppressChange) {
          eventCount++
          onTextEdited(mapOf("text" to (s?.toString() ?: ""), "eventCount" to eventCount))
        }
      }
    })
  }

  fun setTextState(state: HelpInputState) {
    // A delayed React render must never overwrite a newer keystroke or IME span.
    if (state.eventCount < eventCount || state.text == editor.text.toString()) return
    suppressChange = true
    editor.setText(state.text)
    editor.setSelection(editor.length())
    suppressChange = false
  }
  fun setTextColor(value: String) { editor.setTextColor(Color.parseColor(value)) }
  fun setHintColor(value: String) { editor.setHintTextColor(Color.parseColor(value)) }
  fun setAccentColor(value: String) {
    val color = Color.parseColor(value)
    editor.highlightColor = (color and 0x00FFFFFF) or 0x55000000
    if (android.os.Build.VERSION.SDK_INT >= 29) editor.textCursorDrawable?.setTintList(ColorStateList.valueOf(color))
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnPreDrawListener(beforeDraw)
    post { if (!disposed) shadowNodeProxy.setStyleSize(null, visualHeight.toDouble()) }
  }
  override fun onDetachedFromWindow() {
    if (viewTreeObserver.isAlive) viewTreeObserver.removeOnPreDrawListener(beforeDraw)
    super.onDetachedFromWindow()
  }

  override fun onMeasure(widthSpec: Int, heightSpec: Int) {
    val width = MeasureSpec.getSize(widthSpec)
    val inputWidth = max(1, width - px(92f))
    if (dirtyText || width != lastWidth) {
      lastWidth = width
      dirtyText = false
      editor.measure(MeasureSpec.makeMeasureSpec(inputWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
      textHeight = max(px(22f), editor.layout?.height ?: editor.measuredHeight)
      viewportHeight = min(textHeight, px(145f))
      val contentDp = dp(viewportHeight)
      val next = max(46f, contentDp + 12f + bottomInset(contentDp))
      if (abs(next - targetHeight) > .1f) animateHeight(next)
    }
    editor.measure(MeasureSpec.makeMeasureSpec(inputWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(viewportHeight, MeasureSpec.EXACTLY))
    setMeasuredDimension(width, max(px(46f), MeasureSpec.getSize(heightSpec)))
  }

  private fun bottomInset(content: Float) = 12f * (1f - ((content - 132f) / 13f).coerceIn(0f, 1f))
  private fun currentBottomInset(): Int {
    // Invert the continuous content-height -> outer-height mapping at the cap.
    val content = if (visualHeight <= 156f) visualHeight - 24f else 132f + (visualHeight - 156f) * 13f
    return px(bottomInset(content.coerceAtMost(145f)))
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val available = max(px(22f), height - px(12f) - currentBottomInset())
    // Place the fully laid-out editor against the bottom before the first draw.
    // A newly wrapped line is visible immediately, while the top opens upward.
    val editorTop = if (textHeight <= px(22f)) (height - viewportHeight) / 2 else height - currentBottomInset() - viewportHeight
    editor.layout(px(45f), editorTop, width - px(47f), editorTop + viewportHeight)
    if (revealCaret && editor.layout != null) {
      revealCaret = false
      editor.bringPointIntoView(editor.selectionEnd.coerceAtLeast(0))
      val layout = editor.layout
      val line = layout.getLineForOffset(editor.selectionEnd.coerceIn(0, editor.length()))
      val clipTop = max(0, viewportHeight - available)
      val lineTop = layout.getLineTop(line)
      val lineBottom = layout.getLineBottom(line)
      val scroll = editor.scrollY.coerceIn(max(0, lineBottom - viewportHeight), max(0, lineTop - clipTop))
      editor.scrollTo(0, scroll)
    }
  }

  private fun animateHeight(next: Float) {
    animation?.cancel()
    targetHeight = next
    if (debug) {
      transitions.addLast(mapOf("from" to visualHeight, "to" to next, "length" to editor.length(), "reduced" to reducedMotion, "animatorsEnabled" to ValueAnimator.areAnimatorsEnabled(), "at" to SystemClock.uptimeMillis()))
      if (transitions.size > 80) transitions.removeFirst()
    }
    if (reducedMotion || width == 0 || height == 0) {
      applyHeight(next)
      return
    }
    animation = ValueAnimator.ofFloat(visualHeight, next).apply {
      duration = 180
      interpolator = PathInterpolator(.25f, .1f, .25f, 1f)
      addUpdateListener { applyHeight(it.animatedValue as Float) }
      start()
    }
  }
  private fun applyHeight(value: Float) {
    visualHeight = value
    shadowNodeProxy.setStyleSize(null, value.toDouble())
    requestLayout()
    invalidate()
    if (abs(value - targetHeight) < .1f) onGeometry(mapOf("height" to value, "contentHeight" to dp(textHeight), "lines" to editor.lineCount))
  }

  override fun dispatchDraw(canvas: Canvas) {
    val save = canvas.save()
    val clipTop = if (textHeight <= px(22f)) min(px(12f), editor.top.coerceAtLeast(0)) else px(12f)
    canvas.clipRect(px(45f), clipTop, width - px(47f), height - currentBottomInset())
    super.dispatchDraw(canvas)
    canvas.restoreToCount(save)
    if (debug && editor.layout != null) recordFrame()
  }

  private fun recordFrame() {
    val layout = editor.layout ?: return
    val line = layout.getLineForOffset(editor.selectionEnd.coerceIn(0, editor.length()))
    val caretTop = editor.top + layout.getLineTop(line) - editor.scrollY
    val caretBottom = editor.top + layout.getLineBottom(line) - editor.scrollY
    val bottom = height - currentBottomInset()
    val visibleTop = if (textHeight <= px(22f)) min(px(12f), editor.top) else px(12f)
    val clipped = editor.hasFocus() && (caretTop < visibleTop - 1 || caretBottom > bottom + 1)
    if (clipped) clippedFrames++
    observedFrames++
    val position = IntArray(2); getLocationInWindow(position)
    frames.addLast(mapOf("at" to SystemClock.uptimeMillis(), "height" to dp(height), "target" to targetHeight,
      "lines" to editor.lineCount, "length" to editor.length(), "caretTop" to dp(caretTop), "caretBottom" to dp(caretBottom),
      "visibleTop" to 12f, "visibleBottom" to dp(bottom), "screenCaretBottom" to dp(position[1] + caretBottom), "clipped" to clipped))
    if (frames.size > 240) frames.removeFirst()
  }

  fun focusInput() {
    editor.requestFocus()
    (context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(editor, InputMethodManager.SHOW_IMPLICIT)
  }
  fun diagnostics(): Map<String, Any> = if (!debug) emptyMap() else mapOf(
    "engine" to "native", "focused" to editor.hasFocus(), "eventCount" to eventCount, "length" to editor.length(), "lines" to editor.lineCount,
    "selectionStart" to editor.selectionStart, "selectionEnd" to editor.selectionEnd, "height" to dp(height),
    "contentHeight" to dp(textHeight), "targetHeight" to targetHeight, "scrollY" to dp(editor.scrollY),
    "observedFrames" to observedFrames, "clippedFrames" to clippedFrames, "frames" to frames.toList(), "transitions" to transitions.toList())
  fun resetDiagnostics() { frames.clear(); transitions.clear(); clippedFrames = 0; observedFrames = 0 }
  fun testSelection(start: Int, end: Int) {
    check(debug)
    editor.setSelection(start.coerceIn(0, editor.length()), end.coerceIn(0, editor.length()))
  }
  fun testDelete(count: Int) {
    check(debug)
    val connection = editor.onCreateInputConnection(EditorInfo()) ?: return
    repeat(count.coerceIn(0, 1000)) { connection.deleteSurroundingText(1, 0) }
  }
  fun testInput(text: String, interval: Int) {
    check(debug)
    val generation = ++testGeneration
    val connection = editor.onCreateInputConnection(EditorInfo()) ?: return
    if (interval == 0) { connection.commitText(text, 1); return }
    val chars = text.codePoints().toArray()
    fun typeAt(index: Int) {
      if (disposed || generation != testGeneration || index >= chars.size) return
      connection.commitText(String(Character.toChars(chars[index])), 1)
      postDelayed({ typeAt(index + 1) }, interval.coerceIn(1, 250).toLong())
    }
    typeAt(0)
  }
  fun dispose() { disposed = true; testGeneration++; animation?.cancel() }
}
