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
import android.view.WindowInsets
import android.view.WindowManager
import android.view.Window
import android.widget.ScrollView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.max
import kotlin.math.min
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.roundToInt

class LeaderHelpChatLayoutModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LeaderHelpChatLayout")
    Constants("tailMotionVersion" to 2, "imeInsetsVersion" to 3)
    View(LeaderHelpChatLayoutView::class) {
      Events("onImeInsetChange")
      Prop("scrollId") { view: LeaderHelpChatLayoutView, id: String -> view.scrollId = id }
      Prop("dockId") { view: LeaderHelpChatLayoutView, id: String -> view.dockId = id }
      Prop("viewportId") { view: LeaderHelpChatLayoutView, id: String -> view.viewportId = id }
      Prop("allowFollow") { view: LeaderHelpChatLayoutView, value: Boolean -> view.allowFollow = value }
      Prop("reducedMotion") { view: LeaderHelpChatLayoutView, value: Boolean -> view.reducedMotion = value }
      Prop("manageIme") { view: LeaderHelpChatLayoutView, value: Boolean -> view.manageIme = value }
      AsyncFunction("diagnostics") { view: LeaderHelpChatLayoutView -> view.diagnostics() }
      AsyncFunction("resetDiagnostics") { view: LeaderHelpChatLayoutView -> view.resetDiagnostics() }
    }
  }
}

/** Changes scroll range and bottom offset in the same native frame as the dock.
 * No onLayout -> JS state -> padding -> scrollToEnd round trip during resizing.
 */
class LeaderHelpChatLayoutView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onImeInsetChange by EventDispatcher()
  // adjustResize applies the target root height before/after the IME animation.
  // Keep this screen's window stable and use animated insets as the sole owner
  // of chat/dock geometry. Restore the Activity's mode on navigation away.
  private var managedWindow: Window? = null
  private var previousSoftInputMode = 0
  private var appliedSoftInputMode = 0
  var manageIme = false
    set(value) {
      if (field == value) return
      field = value
      updateImeOwnership()
    }
  private fun updateImeOwnership() {
    // API 30+ delivers IME insets independently of legacy adjustResize.
    // Older Android versions retain the existing resize compatibility path.
    if (manageIme && isAttachedToWindow && Build.VERSION.SDK_INT >= 30) {
      val window = appContext.currentActivity?.window ?: return
      if (managedWindow === window) return
      releaseImeOwnership()
      previousSoftInputMode = window.attributes.softInputMode
      appliedSoftInputMode = (previousSoftInputMode and WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST.inv()) or WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
      managedWindow = window
      window.setSoftInputMode(appliedSoftInputMode)
      ViewCompat.requestApplyInsets(this)
    } else releaseImeOwnership()
  }
  private fun releaseImeOwnership() {
    managedWindow?.let { window ->
      val current = window.attributes.softInputMode
      val mask = WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST
      if ((current and mask) == (appliedSoftInputMode and mask)) {
        window.setSoftInputMode((current and mask.inv()) or (previousSoftInputMode and mask))
      }
    }
    managedWindow = null
  }
  var scrollId = ""
  var dockId = ""
  var viewportId = ""
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
  private var viewport: View? = null
  private val density = resources.displayMetrics.density
  private val debug = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
  private val nativeIdKey = resources.getIdentifier("view_tag_native_id", "id", context.packageName)
  private var following = false
  private var lastScroll = 0
  private var lastContent = -1
  private var lastHeight = -1
  private var lastWidth = -1
  private var lastInset = -1
  private var settleFrames = 0
  private var suppressMotionFrames = 2
  private var motionContent: View? = null
  private var motionOffset = 0f
  private var motionVelocity = 0f
  private var motionFrameTime = 0L
  private var motionPosted = false
  private var imeMotionUntil = 0L
  private var geometryMotionUntil = 0L
  private var imeAnimating = false
  private var imeBottom = 0
  private var imeTargetBottom = 0
  private var lastEmittedImeInset = -1f
  private var dockImeTranslation = 0f
  // Edge-to-edge windows do not necessarily resize the React root for IME.
  // Follow the real keyboard on the UI thread, then publish its settled inset
  // so Yoga can reconcile the viewport once, without a per-frame JS round trip.
  private val imeAnimation = object : WindowInsetsAnimationCompat.Callback(WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
    override fun onPrepare(animation: WindowInsetsAnimationCompat) {
      if ((animation.typeMask and WindowInsetsCompat.Type.ime()) == 0) return
      // A canceled API 30 animation may never dispatch onStart/onEnd. Bound
      // suppression so a cancellation cannot disable message motion forever.
      imeMotionUntil = SystemClock.uptimeMillis() + 1500L
      imeAnimating = true
      stopMotion(false)
    }
    override fun onProgress(insets: WindowInsetsCompat, runningAnimations: MutableList<WindowInsetsAnimationCompat>): WindowInsetsCompat {
      if (runningAnimations.any { (it.typeMask and WindowInsetsCompat.Type.ime()) != 0 }) {
        imeMotionUntil = SystemClock.uptimeMillis() + 1500L
        imeAnimating = true
        imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
        stopMotion(false)
        synchronize()
      }
      return insets
    }
    override fun onEnd(animation: WindowInsetsAnimationCompat) {
      if ((animation.typeMask and WindowInsetsCompat.Type.ime()) == 0) return
      imeMotionUntil = SystemClock.uptimeMillis() + 100L
      imeAnimating = false
      imeBottom = imeTargetBottom
      settleFrames = max(settleFrames, 2)
      synchronize()
    }
  }
  // A critically damped presentation spring. Scroll range and the dock remain
  // pinned natively; only the incremental content displacement is eased.
  private val motionFrame = object : Choreographer.FrameCallback {
    override fun doFrame(frameTimeNanos: Long) {
      if (!isAttachedToWindow || !allowFollow || !following || reducedMotion || geometryOwnsMotion()) { stopMotion(false); return }
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
    if (delta == 0 || reducedMotion || geometryOwnsMotion() || Build.VERSION.SDK_INT >= 26 && !ValueAnimator.areAnimatorsEnabled()) return
    motionContent = content
    motionOffset = (motionOffset + delta).coerceIn(-heightLimit(), heightLimit())
    content.translationY = motionOffset
    if (!motionPosted) {
      motionPosted = true; motionFrameTime = 0L
      Choreographer.getInstance().postFrameCallback(motionFrame)
    }
  }
  private fun heightLimit(): Float = min(density * 120f, max(density * 24f, (scroll?.height ?: 0) * .8f))
  private fun geometryOwnsMotion(): Boolean {
    val now = SystemClock.uptimeMillis()
    return now < imeMotionUntil || now < geometryMotionUntil
  }
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
    ViewCompat.setWindowInsetsAnimationCallback(this, imeAnimation)
    updateImeOwnership()
    viewTreeObserver.addOnPreDrawListener(beforeDraw)
    ViewCompat.requestApplyInsets(this)
  }
  override fun onApplyWindowInsets(insets: WindowInsets): WindowInsets {
    imeTargetBottom = WindowInsetsCompat.toWindowInsetsCompat(insets, this).getInsets(WindowInsetsCompat.Type.ime()).bottom
    if (!imeAnimating) imeBottom = imeTargetBottom
    postInvalidateOnAnimation()
    return super.onApplyWindowInsets(insets)
  }
  override fun onDetachedFromWindow() {
    releaseImeOwnership()
    stopMotion(false); motionContent = null
    ViewCompat.setWindowInsetsAnimationCallback(this, null)
    imeMotionUntil = 0L; geometryMotionUntil = 0L
    dock?.translationY = 0f
    imeAnimating = false; imeBottom = 0; imeTargetBottom = 0; lastEmittedImeInset = -1f; dockImeTranslation = 0f
    if (viewTreeObserver.isAlive) viewTreeObserver.removeOnPreDrawListener(beforeDraw)
    dock?.removeOnLayoutChangeListener(dockLayout)
    scroll = null; dock = null; viewport = null
    super.onDetachedFromWindow()
  }

  private fun synchronize() {
    if (!manageIme) return
    if (managedWindow == null) updateImeOwnership()
    if (scroll?.isAttachedToWindow != true) scroll = findNativeView(rootView, scrollId) as? ScrollView
    if (dock?.isAttachedToWindow != true) {
      dock?.removeOnLayoutChangeListener(dockLayout)
      dock = findNativeView(rootView, dockId)
      dock?.addOnLayoutChangeListener(dockLayout)
    }
    val list = scroll ?: return
    val footer = dock ?: return
    val content = list.getChildAt(0) ?: return
    if (list.width == 0 || footer.height == 0) return
    if (!imeAnimating || SystemClock.uptimeMillis() >= imeMotionUntil) {
      imeAnimating = false
      ViewCompat.getRootWindowInsets(this)?.let { imeTargetBottom = it.getInsets(WindowInsetsCompat.Type.ime()).bottom }
      imeBottom = imeTargetBottom
    }
    val container = footer.parent as? View ?: return
    val containerBottom = layoutWindowTop(container) + container.height
    val keyboardTop = if (imeBottom > 0) windowHeight() - imeBottom else containerBottom
    // Subtract only the occlusion still inside this container. An OS-resized
    // root already ends at keyboardTop and must not receive the inset twice.
    val effectiveImeInset = max(0f, containerBottom - keyboardTop)
    val layoutDockBottom = layoutWindowTop(footer) + footer.height
    dockImeTranslation = containerBottom - effectiveImeInset - layoutDockBottom
    footer.translationY = dockImeTranslation
    if (viewport?.isAttachedToWindow != true) viewport = findNativeView(rootView, viewportId)
    viewport?.let { resizeViewport(list, it, layoutWindowTop(footer) + dockImeTranslation) }
    if (list.height == 0) return
    if (!imeAnimating && abs(effectiveImeInset - lastEmittedImeInset) > .5f) {
      lastEmittedImeInset = effectiveImeInset
      onImeInsetChange(mapOf("inset" to effectiveImeInset / density))
    }
    // Incoming/outgoing history windows may translate for a bounded jump animation.
    // Presentation transforms must not change scroll range or clamp the saved anchor.
    val listTop = layoutWindowTop(list)
    val dockTop = layoutWindowTop(footer) + dockImeTranslation
    val inset = max(0, (listTop + list.height - dockTop).roundToInt()) + (12 * density).roundToInt()
    val geometryChanged = inset != lastInset || list.height != lastHeight || list.width != lastWidth
    val changed = geometryChanged || content.height != lastContent
    // FlashList also changes content height while its viewport/composer is
    // being resized. That is geometry reconciliation, not a new-message entry.
    // Cancel the presentation spring and pin the tail in this very same frame.
    // Cover delayed Yoga/list measurements after the final keyboard frame too.
    if (geometryChanged) {
      geometryMotionUntil = SystemClock.uptimeMillis() + 100L
      stopMotion(false)
    }
    // Release on the very first upward movement from a settled tail. Being
    // within a "near bottom" threshold is not consent to keep snapping down
    // while the user starts reading history. Reacquisition belongs exclusively
    // to the explicit allowFollow false -> true transition from JS.
    // Ignore geometry/clamp corrections during the two settling frames: the
    // composer can change the range before Android has laid out its new padding.
    if (allowFollow && following && !changed && !geometryOwnsMotion() && settleFrames == 0 && list.scrollY < lastScroll) { following = false; stopMotion(true) }
    list.clipToPadding = false
    if (list.paddingBottom != inset) list.setPadding(list.paddingLeft, list.paddingTop, list.paddingRight, inset)
    val end = max(0, content.height + inset - list.height)
    if (allowFollow && following && !geometryOwnsMotion() && !geometryChanged && suppressMotionFrames == 0 && lastContent >= 0 && lastHeight > 0 && lastInset >= 0 && content.height != lastContent) {
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
    lastInset = inset; lastHeight = list.height; lastWidth = list.width; lastContent = content.height; lastScroll = list.scrollY
    if (debug) {
      val gap = dockTop - (listTop + content.bottom - list.scrollY)
      frames.addLast(mapOf("at" to SystemClock.uptimeMillis(), "following" to following, "allowFollow" to allowFollow,
        "geometryChanged" to changed, "geometryMotionSuppressed" to geometryOwnsMotion(), "settleFrames" to settleFrames, "offset" to list.scrollY / density,
        "end" to end / density, "inset" to inset / density, "gap" to gap / density, "dockTop" to dockTop / density,
        "presentationOffset" to motionOffset / density, "motionActive" to motionPosted,
        "imeBottom" to imeBottom / density, "imeAnimating" to imeAnimating,
        "dockImeTranslation" to dockImeTranslation / density))
      if (frames.size > 240) frames.removeFirst()
    }
  }
  private fun resizeViewport(list: ScrollView, visible: View, dockTop: Float) {
    // All nodes on this branch are flex:1 wrappers around the native scroll
    // view. Resize the same branch on the UI thread, including its clip/blur
    // target, so keyboard dismissal can reveal rows immediately as well.
    // Yoga receives the settled inset afterwards and converges to this layout.
    val branch = mutableListOf<View>()
    var child: View? = list
    while (child != null && child !== visible && branch.size < 32) {
      branch.add(child)
      child = child.parent as? View
    }
    if (child !== visible) return
    val newHeight = max(0, (dockTop - layoutWindowTop(visible)).roundToInt())
    if (visible.height != newHeight) visible.layout(visible.left, visible.top, visible.right, visible.top + newHeight)
    for (view in branch.asReversed()) {
      val parent = view.parent as? View ?: continue
      val bottom = max(view.top, parent.height - parent.paddingBottom)
      if (view.bottom != bottom) view.layout(view.left, view.top, view.right, bottom)
    }
  }
  private fun windowHeight(): Float = if (Build.VERSION.SDK_INT >= 30) {
    (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).currentWindowMetrics.bounds.height().toFloat()
  } else rootView.height.toFloat()
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
  fun diagnostics(): Map<String, Any> = if (!debug) emptyMap() else mapOf("following" to following, "tailMotionVersion" to 2, "imeInsetsVersion" to 3, "frames" to frames.toList())
  fun resetDiagnostics() { frames.clear() }
}
