package expo.modules.leaderhelpinput

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.res.ColorStateList
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.LinearGradient
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Shader
import android.os.SystemClock
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
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
    var scrollListener: (() -> Unit)? = null
    var touchListener: (() -> Unit)? = null
    // TextView's pre-draw caret reveal otherwise scrolls a new line instantly,
    // independently of the owner's height/scroll animator.
    override fun bringPointIntoView(offset: Int): Boolean = false
    override fun onTouchEvent(event: MotionEvent): Boolean {
      if (event.actionMasked == MotionEvent.ACTION_DOWN) touchListener?.invoke()
      return super.onTouchEvent(event)
    }
    override fun onSelectionChanged(start: Int, end: Int) {
      super.onSelectionChanged(start, end)
      selectionListener?.invoke()
    }
    override fun onScrollChanged(left: Int, top: Int, oldLeft: Int, oldTop: Int) {
      super.onScrollChanged(left, top, oldLeft, oldTop)
      scrollListener?.invoke()
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
  val onSelectionChanged by EventDispatcher<Map<String, Any>>()
  var reducedMotion = false
  private var suppressChange = false
  private var eventCount = 0
  private var dirtyText = true
  private var lastWidth = 0
  private var textHeight = px(22f)
  // Keep EditText's own viewport unchanged across wraps. Resizing it to the
  // next line before the outer animation lets Android scroll/reveal the caret
  // against a different viewport and can pan the entire Activity.
  private val viewportHeight = px(HelpInputGeometry.viewport)
  private var visualHeight = 46f
  private var targetHeight = 46f
  private var visualScroll = 0f
  private var targetScroll = 0f
  private var applyingScroll = false
  private var animation: ValueAnimator? = null
  private var revealCaret = false
  private var disposed = false
  private var testGeneration = 0
  private var frames = ArrayDeque<Map<String, Any>>()
  private var clippedFrames = 0
  private var observedFrames = 0
  private var topFadeStrength = 0f
  private var bottomFadeStrength = 0f
  private val transitions = ArrayDeque<Map<String, Any>>()
  private val scrollbarPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x88627185.toInt() }
  private val fadeHeight = px(16f).toFloat()
  private val topFadePaint = Paint().apply {
    shader = LinearGradient(0f, 0f, 0f, fadeHeight, Color.BLACK, Color.TRANSPARENT, Shader.TileMode.CLAMP)
    xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_OUT)
  }
  private val bottomFadePaint = Paint().apply {
    shader = LinearGradient(0f, 0f, 0f, fadeHeight, Color.TRANSPARENT, Color.BLACK, Shader.TileMode.CLAMP)
    xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_OUT)
  }
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
    // Some OEM EditText themes have no ScrollBarDrawable. Enabling the platform
    // scrollbar crashes View.onDrawScrollBars on realme Android 13. Draw the
    // indicator ourselves; EditText still owns touch scrolling and selection.
    isVerticalScrollBarEnabled = false
    setPadding(0, 0, px(5f), 0)
    overScrollMode = View.OVER_SCROLL_NEVER
    contentDescription = "Сообщение"
  }

  init {
    clipChildren = true
    clipToPadding = false
    addView(editor)
    editor.scrollListener = {
      if (!applyingScroll && animation == null && !dirtyText && !revealCaret) {
        visualScroll = dp(editor.scrollY)
        targetScroll = visualScroll
      }
      invalidate()
    }
    editor.touchListener = {
      animation?.cancel(); animation = null
      visualScroll = dp(editor.scrollY); targetScroll = visualScroll
      // Finish a pending size change, but let the user's finger own scrolling.
      applyGeometry(targetHeight, visualScroll)
    }
    editor.selectionListener = {
      revealCaret = true; requestLayout()
      onSelectionChanged(mapOf("start" to editor.selectionStart, "end" to editor.selectionEnd))
    }
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
  fun setHintColor(value: String) {
    val color = Color.parseColor(value)
    editor.setHintTextColor(color)
    scrollbarPaint.color = (color and 0x00FFFFFF) or 0x88000000.toInt()
    invalidate()
  }
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
    val reconcile = dirtyText || revealCaret || width != lastWidth
    if (dirtyText || width != lastWidth) {
      lastWidth = width
      dirtyText = false
      editor.measure(MeasureSpec.makeMeasureSpec(inputWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
      textHeight = max(px(22f), editor.layout?.height ?: editor.measuredHeight)
    }
    editor.measure(MeasureSpec.makeMeasureSpec(inputWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(viewportHeight, MeasureSpec.EXACTLY))
    if (reconcile && editor.layout != null) {
      revealCaret = false
      val next = HelpInputGeometry.outerHeight(dp(textHeight))
      val visible = next - HelpInputGeometry.topInset - HelpInputGeometry.bottomInsetForOuter(next)
      val layout = editor.layout
      val line = layout.getLineForOffset(editor.selectionEnd.coerceIn(0, editor.length()))
      val scroll = HelpInputGeometry.revealScroll(visualScroll, dp(layout.getLineTop(line)), dp(layout.getLineBottom(line)), dp(textHeight), visible)
      animateGeometry(next, scroll)
    }
    setMeasuredDimension(width, max(px(46f), MeasureSpec.getSize(heightSpec)))
  }

  private fun currentBottomInset() = px(HelpInputGeometry.bottomInsetForOuter(visualHeight))

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    // The text follows the top edge, whose screen position is animated by the
    // growing dock. Raw textHeight must never move the editor before that edge.
    val editorTop = px(HelpInputGeometry.topInset)
    editor.layout(px(45f), editorTop, width - px(47f), editorTop + viewportHeight)
    applyScroll(visualScroll)
  }

  // The native chat owner already keeps input above IME. A second window pan
  // would add an independent movement to the same caret transition.
  override fun requestChildRectangleOnScreen(child: View, rectangle: Rect, immediate: Boolean): Boolean = false

  private fun animateGeometry(nextHeight: Float, nextScroll: Float) {
    if (abs(nextHeight - targetHeight) < .1f && abs(nextScroll - targetScroll) < .1f) return
    animation?.cancel(); animation = null
    targetHeight = nextHeight; targetScroll = nextScroll
    if (debug) {
      transitions.addLast(mapOf("from" to visualHeight, "to" to nextHeight, "scrollFrom" to visualScroll, "scrollTo" to nextScroll,
        "length" to editor.length(), "reduced" to reducedMotion, "animatorsEnabled" to ValueAnimator.areAnimatorsEnabled(), "at" to SystemClock.uptimeMillis()))
      if (transitions.size > 80) transitions.removeFirst()
    }
    if (reducedMotion || !ValueAnimator.areAnimatorsEnabled() || width == 0 || height == 0) {
      applyGeometry(nextHeight, nextScroll)
      return
    }
    val fromHeight = visualHeight; val fromScroll = visualScroll
    animation = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 180
      interpolator = PathInterpolator(.25f, .1f, .25f, 1f)
      addUpdateListener {
        val fraction = it.animatedValue as Float
        applyGeometry(HelpInputGeometry.interpolate(fromHeight, nextHeight, fraction), HelpInputGeometry.interpolate(fromScroll, nextScroll, fraction))
        if (fraction >= 1f) animation = null
      }
      start()
    }
  }
  private fun applyScroll(value: Float) {
    applyingScroll = true
    editor.scrollTo(0, px(value))
    applyingScroll = false
  }
  private fun applyGeometry(value: Float, scroll: Float) {
    val sizeChanged = abs(value - visualHeight) > .001f
    visualHeight = value; visualScroll = scroll
    applyScroll(scroll)
    if (sizeChanged) {
      shadowNodeProxy.setStyleSize(null, value.toDouble())
      requestLayout()
    }
    invalidate()
    if (abs(value - targetHeight) < .1f && abs(scroll - targetScroll) < .1f)
      onGeometry(mapOf("height" to value, "contentHeight" to dp(textHeight), "lines" to editor.lineCount))
  }

  override fun dispatchDraw(canvas: Canvas) {
    val save = canvas.save()
    val clipTop = px(HelpInputGeometry.topInset)
    val clipBottom = height - currentBottomInset()
    val textLeft = px(45f).toFloat()
    val textRight = (width - px(47f)).toFloat()
    canvas.clipRect(textLeft, clipTop.toFloat(), textRight, clipBottom.toFloat())
    // Fade only where text actually continues outside the visible edge. The same
    // native frame knows both EditText scroll and its animated clipping bounds;
    // a JS overlay would lag scrolling and dim the first line at rest.
    val visibleTop = max(clipTop, editor.top).toFloat()
    val hiddenTop = max(0, clipTop - editor.top + editor.scrollY).toFloat()
    val hiddenBottom = max(0, editor.top + textHeight - editor.scrollY - clipBottom).toFloat()
    topFadeStrength = (hiddenTop / fadeHeight).coerceIn(0f, 1f)
    bottomFadeStrength = (hiddenBottom / fadeHeight).coerceIn(0f, 1f)
    val fade = min(fadeHeight, (clipBottom - visibleTop).coerceAtLeast(0f))
    val layer = if ((hiddenTop > 0f || hiddenBottom > 0f) && fade > 0f && textRight > textLeft)
      canvas.saveLayer(textLeft, visibleTop, textRight, clipBottom.toFloat(), null) else -1
    super.dispatchDraw(canvas)
    if (layer >= 0) {
      topFadePaint.alpha = (255f * topFadeStrength).roundToInt()
      canvas.save()
      canvas.translate(0f, visibleTop)
      canvas.drawRect(textLeft, 0f, textRight, fade, topFadePaint)
      canvas.restore()
      bottomFadePaint.alpha = (255f * bottomFadeStrength).roundToInt()
      canvas.save()
      canvas.translate(0f, clipBottom - fadeHeight)
      canvas.drawRect(textLeft, 0f, textRight, fadeHeight, bottomFadePaint)
      canvas.restore()
      canvas.restoreToCount(layer)
    }
    if (textHeight > viewportHeight) {
      val top = max(clipTop, editor.top).toFloat()
      val bottom = min(height - currentBottomInset(), editor.bottom).toFloat()
      val track = (bottom - top).coerceAtLeast(1f)
      val thumb = max(px(18f).toFloat(), track * viewportHeight / textHeight).coerceAtMost(track)
      val progress = (editor.scrollY.toFloat() / (textHeight - viewportHeight)).coerceIn(0f, 1f)
      val y = top + (track - thumb) * progress
      canvas.drawRoundRect((width - px(50f)).toFloat(), y, (width - px(48f)).toFloat(), y + thumb, px(1f).toFloat(), px(1f).toFloat(), scrollbarPaint)
    }
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
      "viewportHeight" to dp(editor.height), "topFadeStrength" to topFadeStrength, "bottomFadeStrength" to bottomFadeStrength,
      "editorTop" to dp(editor.top), "scrollY" to dp(editor.scrollY), "visualScroll" to visualScroll, "targetScroll" to targetScroll,
      "screenTextTop" to dp(position[1] + editor.top - editor.scrollY), "animating" to (animation != null),
      "lines" to editor.lineCount, "length" to editor.length(), "caretTop" to dp(caretTop), "caretBottom" to dp(caretBottom),
      "visibleTop" to 12f, "visibleBottom" to dp(bottom), "screenCaretBottom" to dp(position[1] + caretBottom), "clipped" to clipped))
    if (frames.size > 240) frames.removeFirst()
  }

  fun focusInput() {
    editor.requestFocus()
    (context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(editor, InputMethodManager.SHOW_IMPLICIT)
  }
  fun restoreInput(text: String, start: Int, end: Int) {
    if (editor.text.toString() != text) editor.setText(text)
    editor.setSelection(start.coerceIn(0, editor.length()), end.coerceIn(0, editor.length()))
    focusInput()
  }
  fun diagnostics(): Map<String, Any> = if (!debug) emptyMap() else mapOf(
    "engine" to "native", "composerMotionVersion" to 3, "viewportHeight" to dp(editor.height), "topFadeStrength" to topFadeStrength, "bottomFadeStrength" to bottomFadeStrength,
      "editorTop" to dp(editor.top), "scrollY" to dp(editor.scrollY), "visualScroll" to visualScroll, "targetScroll" to targetScroll,
    "focused" to editor.hasFocus(), "eventCount" to eventCount, "length" to editor.length(), "lines" to editor.lineCount,
    "selectionStart" to editor.selectionStart, "selectionEnd" to editor.selectionEnd, "height" to dp(height),
    "contentHeight" to dp(textHeight), "targetHeight" to targetHeight,
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
