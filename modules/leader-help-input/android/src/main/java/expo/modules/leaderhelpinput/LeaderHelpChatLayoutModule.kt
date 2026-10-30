package expo.modules.leaderhelpinput

import android.content.Context
import android.animation.ValueAnimator
import android.content.pm.ApplicationInfo
import android.os.Build
import android.os.SystemClock
import android.view.Choreographer
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.ScrollView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView
import kotlin.math.max
import kotlin.math.min
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.roundToInt

class LeaderHelpChatLayoutModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LeaderHelpChatLayout")
    Constants("tailMotionVersion" to 1)
    View(LeaderHelpChatLayoutView::class) {
      Prop("scrollId") { view: LeaderHelpChatLayoutView, id: String -> view.scrollId = id }
      Prop("dockId") { view: LeaderHelpChatLayoutView, id: String -> view.dockId = id }
      Prop("allowFollow") { view: LeaderHelpChatLayoutView, value: Boolean -> view.allowFollow = value }
      Prop("reducedMotion") { view: LeaderHelpChatLayoutView, value: Boolean -> view.reducedMotion = value }
      AsyncFunction("diagnostics") { view: LeaderHelpChatLayoutView -> view.diagnostics() }
      AsyncFunction("resetDiagnostics") { view: LeaderHelpChatLayoutView -> view.resetDiagnostics() }
    }
  }
}

/** Changes scroll range and bottom offset in the same native frame as the dock.
 * No onLayout -> JS state -> padding -> scrollToEnd round trip during resizing.
 */
class LeaderHelpChatLayoutView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var scrollId = ""
  var dockId = ""
  var allowFollow = false
    set(value) {
      if (field != value) {
        field = value; following = value
        if (value) { settleFrames = 2; suppressMotionFrames = 2; postInvalidateOnAnimation() }
        else stopMotion(true)
      }
    }
  var reducedMotion = false
    set(value) { field = value; if (value) stopMotion(false) }
  private var scroll: ScrollView? = null
  private var dock: View? = null
  private val density = resources.displayMetrics.density
  private val debug = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
  private val nativeIdKey = resources.getIdentifier("view_tag_native_id", "id", context.packageName)
  private var following = false
  private var lastScroll = 0
  private var lastContent = -1
  private var lastHeight = -1
  private var lastInset = -1
  private var settleFrames = 0
  private var suppressMotionFrames = 2
  private var motionContent: View? = null
  private var motionOffset = 0f
  private var motionVelocity = 0f
  private var motionFrameTime = 0L
  private var motionPosted = false
  // A critically damped presentation spring. Scroll range and the dock remain
  // pinned natively; only the incremental content displacement is eased.
  private val motionFrame = object : Choreographer.FrameCallback {
    override fun doFrame(frameTimeNanos: Long) {
      if (!isAttachedToWindow || !allowFollow || !following || reducedMotion) { stopMotion(false); return }
      val dt = if (motionFrameTime == 0L) 1f / 60f else ((frameTimeNanos - motionFrameTime) / 1_000_000_000f).coerceIn(.001f, .05f)
      motionFrameTime = frameTimeNanos
      val omega = 26f
      val term = motionVelocity + omega * motionOffset
      val decay = exp((-omega * dt).toDouble()).toFloat()
      motionVelocity = (motionVelocity - omega * term * dt) * decay
      motionOffset = (motionOffset + term * dt) * decay
      if (abs(motionOffset) < .2f * density && abs(motionVelocity) < 3f * density) { stopMotion(false); return }
      motionContent?.translationY = motionOffset
      postInvalidateOnAnimation()
      Choreographer.getInstance().postFrameCallback(this)
    }
  }
  private fun moveContentBy(delta: Int, content: View) {
    if (delta == 0 || reducedMotion || Build.VERSION.SDK_INT >= 26 && !ValueAnimator.areAnimatorsEnabled()) return
    motionContent = content
    motionOffset = (motionOffset + delta).coerceIn(-heightLimit(), heightLimit())
    content.translationY = motionOffset
    if (!motionPosted) {
      motionPosted = true; motionFrameTime = 0L
      Choreographer.getInstance().postFrameCallback(motionFrame)
    }
  }
  private fun heightLimit(): Float = min(density * 120f, max(density * 24f, (scroll?.height ?: 0) * .8f))
  private fun stopMotion(preserveViewport: Boolean) {
    if (motionPosted) Choreographer.getInstance().removeFrameCallback(motionFrame)
    if (preserveViewport && abs(motionOffset) > .1f) scroll?.let { it.scrollTo(it.scrollX, max(0, (it.scrollY - motionOffset).roundToInt())) }
    motionContent?.translationY = 0f
    motionOffset = 0f; motionVelocity = 0f; motionFrameTime = 0L; motionPosted = false
  }
  private val frames = ArrayDeque<Map<String, Any>>()
  private val beforeDraw = ViewTreeObserver.OnPreDrawListener { synchronize(); true }
  private val dockLayout = View.OnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> synchronize() }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnPreDrawListener(beforeDraw)
  }
  override fun onDetachedFromWindow() {
    stopMotion(false); motionContent = null
    if (viewTreeObserver.isAlive) viewTreeObserver.removeOnPreDrawListener(beforeDraw)
    dock?.removeOnLayoutChangeListener(dockLayout)
    scroll = null; dock = null
    super.onDetachedFromWindow()
  }

  private fun synchronize() {
    if (scroll?.isAttachedToWindow != true) scroll = findNativeView(rootView, scrollId) as? ScrollView
    if (dock?.isAttachedToWindow != true) {
      dock?.removeOnLayoutChangeListener(dockLayout)
      dock = findNativeView(rootView, dockId)
      dock?.addOnLayoutChangeListener(dockLayout)
    }
    val list = scroll ?: return
    val footer = dock ?: return
    val content = list.getChildAt(0) ?: return
    if (list.height == 0 || footer.height == 0) return
    // Incoming/outgoing history windows may translate for a bounded jump animation.
    // Presentation transforms must not change scroll range or clamp the saved anchor.
    val listTop = layoutWindowTop(list)
    val dockTop = layoutWindowTop(footer)
    val inset = max(0, (listTop + list.height - dockTop).roundToInt()) + (12 * density).roundToInt()
    val changed = inset != lastInset || list.height != lastHeight || content.height != lastContent
    // Release on the very first upward movement from a settled tail. Being
    // within a "near bottom" threshold is not consent to keep snapping down
    // while the user starts reading history. Reacquisition belongs exclusively
    // to the explicit allowFollow false -> true transition from JS.
    // Ignore geometry/clamp corrections during the two settling frames: the
    // composer can change the range before Android has laid out its new padding.
    if (allowFollow && following && !changed && settleFrames == 0 && list.scrollY < lastScroll) { following = false; stopMotion(true) }
    list.clipToPadding = false
    if (list.paddingBottom != inset) list.setPadding(list.paddingLeft, list.paddingTop, list.paddingRight, inset)
    val end = max(0, content.height + inset - list.height)
    if (allowFollow && following && suppressMotionFrames == 0 && lastContent >= 0 && lastHeight > 0 && lastInset >= 0 && content.height != lastContent) {
      val previousEnd = max(0, lastContent + lastInset - lastHeight)
      val contentOnlyEnd = max(0, content.height + lastInset - lastHeight)
      moveContentBy(contentOnlyEnd - previousEnd, content)
    }
    if (suppressMotionFrames > 0) suppressMotionFrames--
    // setPadding requests another Android layout. ScrollView may clamp against
    // the old range in this pass, so finish the same bottom anchor after layout.
    if (changed) settleFrames = 2
    if (allowFollow && following && (changed || settleFrames > 0)) list.scrollTo(list.scrollX, end)
    if (!changed && settleFrames > 0) settleFrames--
    lastInset = inset; lastHeight = list.height; lastContent = content.height; lastScroll = list.scrollY
    if (debug) {
      val gap = dockTop - (listTop + content.bottom - list.scrollY)
      frames.addLast(mapOf("at" to SystemClock.uptimeMillis(), "following" to following, "allowFollow" to allowFollow,
        "geometryChanged" to changed, "settleFrames" to settleFrames, "offset" to list.scrollY / density,
        "end" to end / density, "inset" to inset / density, "gap" to gap / density, "dockTop" to dockTop / density,
        "presentationOffset" to motionOffset / density, "motionActive" to motionPosted))
      if (frames.size > 240) frames.removeFirst()
    }
  }
  private fun layoutWindowTop(view: View): Float {
    val location = IntArray(2); view.getLocationInWindow(location)
    var offset = 0f
    var current: View? = view
    while (current != null) { offset += current.translationY; current = current.parent as? View }
    return location[1] - offset
  }
  private fun findNativeView(root: View, id: String): View? {
    if (nativeIdKey == 0 || id.isEmpty()) return null
    if (root.getTag(nativeIdKey) == id) return root
    if (root is ViewGroup) for (index in 0 until root.childCount) {
      findNativeView(root.getChildAt(index), id)?.let { return it }
    }
    return null
  }
  fun diagnostics(): Map<String, Any> = if (!debug) emptyMap() else mapOf("following" to following, "tailMotionVersion" to 1, "frames" to frames.toList())
  fun resetDiagnostics() { frames.clear() }
}
