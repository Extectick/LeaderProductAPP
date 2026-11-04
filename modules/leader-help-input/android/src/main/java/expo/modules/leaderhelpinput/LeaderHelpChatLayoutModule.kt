package expo.modules.leaderhelpinput

import android.content.Context
import android.graphics.Rect
import android.graphics.Color
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
import com.facebook.react.views.scroll.ReactScrollViewHelper
import com.facebook.react.views.scroll.ScrollEventType
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.max
import kotlin.math.min
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.roundToInt

/** OTA owns presentation policy; geometry ownership remains native. */
class HelpTailMotionConfig : Record {
  @Field var version = 1
  @Field var enabled = true
  @Field var durationMs = 220.0
  @Field var curve = "spring"
  @Field var maxViewport = 1.0
  @Field var entryDistanceDp = 24.0
}

class LeaderHelpChatLayoutModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LeaderHelpChatLayout")
    Constants("tailMotionVersion" to 3, "imeInsetsVersion" to 5, "dockControlsVersion" to 1)
    View(LeaderHelpChatLayoutView::class) {
      Events("onImeInsetChange")
      Prop("scrollId") { view: LeaderHelpChatLayoutView, id: String -> view.scrollId = id }
      Prop("dockId") { view: LeaderHelpChatLayoutView, id: String -> view.dockId = id }
      Prop("controlsId") { view: LeaderHelpChatLayoutView, id: String -> view.controlsId = id }
      Prop("viewportId") { view: LeaderHelpChatLayoutView, id: String -> view.viewportId = id }
      Prop("allowFollow") { view: LeaderHelpChatLayoutView, value: Boolean -> view.allowFollow = value }
      Prop("reducedMotion") { view: LeaderHelpChatLayoutView, value: Boolean -> view.reducedMotion = value }
      Prop("tailMotionConfig") { view: LeaderHelpChatLayoutView, value: HelpTailMotionConfig -> view.setTailMotionConfig(value) }
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
      if (Build.VERSION.SDK_INT >= 29) {
        window.isNavigationBarContrastEnforced = false
      }
      window.navigationBarColor = Color.TRANSPARENT
      window.setSoftInputMode(appliedSoftInputMode)
      ViewCompat.requestApplyInsets(this)
    } else releaseImeOwnership()
  }
  private fun releaseImeOwnership() {
    releaseControls()
    managedWindow?.let { window ->
      // Edge-to-edge chrome belongs to the app, not the temporary IME owner.
      // Restoring the Activity's old contrast scrim can flash a dark system-bar
      // layer on Help -> catalogue (some OEMs omit it from screen recordings).
      window.navigationBarColor = Color.TRANSPARENT
      if (Build.VERSION.SDK_INT >= 29) window.isNavigationBarContrastEnforced = false
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
  var controlsId = ""
    set(value) {
      if (field == value) return
      releaseControls()
      field = value
      postInvalidateOnAnimation()
    }
  var viewportId = ""
  var allowFollow = false
    set(value) {
      if (field != value) {
        field = value; following = value
        if (value) { nativeDragging = false; settleFrames = 2; suppressMotionFrames = 2; postInvalidateOnAnimation() }
        else stopMotion(true)
      }
    }
  var reducedMotion = false
    set(value) { field = value; if (value) stopMotion(false) }
  private var tailMotionEnabled = true
  private var tailDurationMs = 220f
  private var tailCurve = "spring"
  private var tailMaxViewport = 1f
  private var tailEntryDistanceDp = 24f
  fun setTailMotionConfig(value: HelpTailMotionConfig) {
    tailMotionEnabled = value.version == 1 && value.enabled
    tailDurationMs = if (value.durationMs.isFinite()) value.durationMs.toFloat().coerceIn(80f, 1200f) else 220f
    tailCurve = if (value.curve in setOf("spring", "cubic", "quint")) value.curve else "spring"
    tailMaxViewport = if (value.maxViewport.isFinite()) value.maxViewport.toFloat().coerceIn(0f, 3f) else 1f
    tailEntryDistanceDp = if (value.entryDistanceDp.isFinite()) value.entryDistanceDp.toFloat().coerceIn(0f, 1024f) else 24f
    if (!tailMotionEnabled || tailMaxViewport == 0f) stopMotion(false)
  }
  private var scroll: ScrollView? = null
  private var dock: View? = null
  private var controls: View? = null
  private var viewport: View? = null
  private val viewportClip = Rect()
  private var viewportClipHeight = -1
  private var viewportClipWidth = -1
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
  private var motionElapsed = 0f
  private var motionStartOffset = 0f
  private data class TailAnchor(val id: String, val view: View, val top: Int)
  private val tailAnchors = ArrayList<TailAnchor>(16)
  private var tailCellsDirty = true
  private var lastTailDelta = 0
  private var nativeDragging = false
  private var tailRangeRepairs = 0
  private var imeMotionUntil = 0L
  private var geometryMotionUntil = 0L
  private var imeAnimating = false
  private var imeBottom = 0
  private var imeTargetBottom = 0
  private var lastEmittedImeInset = -1f
  private var dockImeTranslation = 0f
  private var imePresentationContent: View? = null
  private fun releaseControls() {
    controls?.translationY = 0f
    controls = null
  }
  private fun keyboardTop(bottom: Int, containerBottom: Float): Float {
    if (bottom <= 0) return containerBottom
    // The stable dock already contains the resting navigation-bar safe area.
    // IME insets include that same bar; subtract it once before translating.
    val navigation = ViewCompat.getRootWindowInsets(this)
      ?.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.navigationBars())?.bottom ?: 0
    return windowHeight() - max(0, bottom - navigation)
  }
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
      if (!isAttachedToWindow || !allowFollow || !following || reducedMotion || !tailMotionEnabled || imeOwnsMotion()) { stopMotion(false); return }
      val dt = if (motionFrameTime == 0L) 1f / 60f else ((frameTimeNanos - motionFrameTime) / 1_000_000_000f).coerceIn(.001f, .05f)
      motionFrameTime = frameTimeNanos
      if (tailCurve == "spring") {
        // Critically damped and frame-rate independent. New geometry adds to
        // position while preserving velocity, including streamed answers.
        val omega = 6000f / tailDurationMs
        val term = motionVelocity + omega * motionOffset
        val decay = exp((-omega * dt).toDouble()).toFloat()
        motionVelocity = (motionVelocity - omega * term * dt) * decay
        motionOffset = (motionOffset + term * dt) * decay
      } else {
        motionElapsed += dt * 1000f
        val remaining = (1f - motionElapsed / tailDurationMs).coerceIn(0f, 1f)
        motionOffset = motionStartOffset * remaining.pow(if (tailCurve == "quint") 5 else 3)
        motionVelocity = 0f
      }
      if (abs(motionOffset) < .2f * density && abs(motionVelocity) < 3f * density) { stopMotion(false); return }
      motionContent?.translationY = motionOffset
      postInvalidateOnAnimation()
      Choreographer.getInstance().postFrameCallback(this)
    }
  }
  private fun moveContentBy(delta: Int, content: View) {
    if (delta == 0 || reducedMotion || !tailMotionEnabled || imeOwnsMotion() || Build.VERSION.SDK_INT >= 26 && !ValueAnimator.areAnimatorsEnabled()) return
    motionContent = content
    motionOffset = (motionOffset + delta).coerceIn(-heightLimit(), heightLimit())
    motionStartOffset = motionOffset; motionElapsed = 0f
    content.translationY = motionOffset
    if (!motionPosted) {
      motionPosted = true; motionFrameTime = 0L
      Choreographer.getInstance().postFrameCallback(motionFrame)
    }
  }
  private fun heightLimit(): Float = (scroll?.height ?: 0) * tailMaxViewport
  private fun geometryOwnsMotion(): Boolean {
    val now = SystemClock.uptimeMillis()
    return now < imeMotionUntil || now < geometryMotionUntil
  }
  private fun imeOwnsMotion(): Boolean = imeAnimating || SystemClock.uptimeMillis() < imeMotionUntil
  private fun stopMotion(preserveViewport: Boolean) {
    if (motionPosted) Choreographer.getInstance().removeFrameCallback(motionFrame)
    if (preserveViewport && abs(motionOffset) > .1f) scroll?.let { it.scrollTo(it.scrollX, max(0, (it.scrollY - motionOffset).roundToInt())) }
    motionContent?.translationY = 0f
    motionOffset = 0f; motionVelocity = 0f; motionFrameTime = 0L; motionPosted = false; motionElapsed = 0f; motionStartOffset = 0f
  }
  // Raw layout coordinates deliberately exclude every presentation transform.
  // A cell can be recycled to a new message: both its View and nativeID must
  // still match before it can anchor the previous viewport.
  private fun cellTop(view: View, content: View): Int? {
    var current = view
    var top = 0
    while (current !== content) {
      top += current.top
      current = current.parent as? View ?: return null
    }
    return top + content.top
  }
  private fun retainedTailAnchor(content: View): Pair<TailAnchor, Int>? {
    for (anchor in tailAnchors) {
      if (!anchor.view.isAttachedToWindow || anchor.view.height == 0 || anchor.view.getTag(nativeIdKey) != anchor.id) continue
      val top = cellTop(anchor.view, content) ?: continue
      return anchor to top
    }
    return null
  }
  private fun rememberTailAnchors(content: View, list: ScrollView) {
    tailAnchors.clear()
    if (nativeIdKey == 0) return
    val prefix = "$scrollId:cell:"
    val candidates = ArrayList<TailAnchor>()
    fun visit(view: View, top: Int) {
      val id = view.getTag(nativeIdKey) as? String
      if (id?.startsWith(prefix) == true) {
        val visualTop = top - list.scrollY
        // Include the presentation displacement so rows being animated out of
        // the viewport remain candidates until their visible pixels leave.
        if (view.height > 0 && visualTop + view.height + motionOffset > 0 && visualTop + motionOffset < list.height) candidates.add(TailAnchor(id, view, top))
        return // Never traverse the potentially large media/bubble subtree.
      }
      if (view is ViewGroup) for (index in 0 until view.childCount) {
        val child = view.getChildAt(index)
        visit(child, top + child.top)
      }
    }
    visit(content, content.top)
    candidates.sortBy { it.top }
    // Keep both ends of the visible window; removal of an AI placeholder or
    // recycling one end must not discard every retained logical anchor.
    if (candidates.size <= 16) tailAnchors.addAll(candidates)
    else { tailAnchors.addAll(candidates.take(8)); tailAnchors.addAll(candidates.takeLast(8)) }
    tailCellsDirty = false
  }
  private val frames = ArrayDeque<Map<String, Any>>()
  private val beforeDraw = ViewTreeObserver.OnPreDrawListener { synchronize(); true }
  private val afterLayout = ViewTreeObserver.OnGlobalLayoutListener { tailCellsDirty = true }
  private val dockLayout = View.OnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> synchronize() }
  // ReactScrollView publishes this on the UI thread when it intercepts the
  // real gesture, before moving any pixels and before JS receives begin-drag.
  // Offset changes alone are not intent: FlashList also writes scroll offsets
  // after measurement without changing the native content/viewport height.
  private val scrollIntent = object : ReactScrollViewHelper.ScrollListener {
    override fun onScroll(scrollView: ViewGroup?, scrollEventType: ScrollEventType?, xVelocity: Float, yVelocity: Float) {
      if (scrollView !== scroll) return
      when (scrollEventType) {
        ScrollEventType.BEGIN_DRAG -> {
          nativeDragging = true
          following = false
          stopMotion(true)
        }
        ScrollEventType.END_DRAG, ScrollEventType.MOMENTUM_END -> nativeDragging = false
        else -> Unit
      }
    }
    override fun onLayout(scrollView: ViewGroup?) {
      if (scrollView === scroll) tailCellsDirty = true
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    ViewCompat.setWindowInsetsAnimationCallback(this, imeAnimation)
    updateImeOwnership()
    viewTreeObserver.addOnPreDrawListener(beforeDraw)
    viewTreeObserver.addOnGlobalLayoutListener(afterLayout)
    ReactScrollViewHelper.addScrollListener(scrollIntent)
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
    viewport?.clipBounds = null
    stopMotion(false); motionContent = null
    imePresentationContent?.translationY = 0f; imePresentationContent = null
    ViewCompat.setWindowInsetsAnimationCallback(this, null)
    imeMotionUntil = 0L; geometryMotionUntil = 0L
    dock?.translationY = 0f
    imeAnimating = false; imeBottom = 0; imeTargetBottom = 0; lastEmittedImeInset = -1f; dockImeTranslation = 0f
    if (viewTreeObserver.isAlive) { viewTreeObserver.removeOnPreDrawListener(beforeDraw); viewTreeObserver.removeOnGlobalLayoutListener(afterLayout) }
    ReactScrollViewHelper.removeScrollListener(scrollIntent)
    nativeDragging = false
    tailAnchors.clear(); tailCellsDirty = true
    dock?.removeOnLayoutChangeListener(dockLayout)
    scroll = null; dock = null; viewport = null; viewportClipHeight = -1; viewportClipWidth = -1
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
    val currentKeyboardTop = keyboardTop(imeBottom, containerBottom)
    // Subtract only the occlusion still inside this container. An OS-resized
    // root already ends at keyboardTop and must not receive the inset twice.
    val effectiveImeInset = max(0f, containerBottom - currentKeyboardTop)
    val layoutDockBottom = layoutWindowTop(footer) + footer.height
    dockImeTranslation = containerBottom - effectiveImeInset - layoutDockBottom
    footer.translationY = dockImeTranslation
    // This sibling covers the full scene, so controls above the composer keep
    // valid Android touch/accessibility bounds. Move both in this same IME
    // callback/pre-draw; JS receives only settled insets and owns no IME frames.
    if (controls?.isAttachedToWindow != true) {
      releaseControls()
      controls = findNativeView(rootView, controlsId)
    }
    controls?.translationY = dockImeTranslation
    if (viewport?.isAttachedToWindow != true) {
      viewport = findNativeView(rootView, viewportId)
      viewportClipHeight = -1; viewportClipWidth = -1
    }
    viewport?.let { clipViewport(it, layoutWindowTop(footer) + dockImeTranslation) }
    if (list.height == 0) return
    if (!imeAnimating && abs(effectiveImeInset - lastEmittedImeInset) > .5f) {
      lastEmittedImeInset = effectiveImeInset
      onImeInsetChange(mapOf("inset" to effectiveImeInset / density))
    }
    // Incoming/outgoing history windows may translate for a bounded jump animation.
    // Presentation transforms must not change scroll range or clamp the saved anchor.
    val listTop = layoutWindowTop(list)
    val dockTop = layoutWindowTop(footer) + dockImeTranslation
    val visualInset = max(0, (listTop + list.height - dockTop).roundToInt()) + (12 * density).roundToInt()
    // Settle ScrollView's range once at the target IME geometry. While following
    // the tail, compensate only its presentation on animation frames: setPadding
    // on every frame requests a full list layout and competes with Fabric.
    val targetDockTop = layoutWindowTop(footer) + min(containerBottom, keyboardTop(imeTargetBottom, containerBottom)) - layoutDockBottom
    val targetInset = max(0, (listTop + list.height - targetDockTop).roundToInt()) + (12 * density).roundToInt()
    val inset = if (imeAnimating && allowFollow && following) targetInset else if (imeAnimating) list.paddingBottom else visualInset
    val geometryChanged = inset != lastInset || list.height != lastHeight || list.width != lastWidth
    val changed = geometryChanged || content.height != lastContent
    val retained = retainedTailAnchor(content)
    val cellMoved = retained != null && retained.first.top != retained.second
    // FlashList also changes content height while its viewport/composer is
    // being resized. That is geometry reconciliation, not a new-message entry.
    // Cancel the presentation spring and pin the tail in this very same frame.
    // Cover delayed Yoga/list measurements after the final keyboard frame too.
    if (geometryChanged) {
      geometryMotionUntil = SystemClock.uptimeMillis() + 100L
      // Composer animation is independent of message arrival. Preserve the
      // content spring while the dock changes size, so older rows move with
      // the arriving message instead of snapping to the new bottom offset.
      if (imeOwnsMotion() || list.height != lastHeight || list.width != lastWidth) stopMotion(false)
    }
    list.clipToPadding = false
    if (list.paddingBottom != inset) list.setPadding(list.paddingLeft, list.paddingTop, list.paddingRight, inset)
    val end = max(0, content.height + inset - list.height)
    // setPadding requests another Android layout. ScrollView may clamp against
    // the old range in this pass, so finish the same bottom anchor after layout.
    if (changed) settleFrames = 2
    // Owning the tail is an invariant, not a reaction to size notifications.
    // A late FlashList measurement can reset a short list's offset while its
    // content height stays equal to the viewport. Repair that write before
    // this draw; a genuine drag has already released ownership above.
    if (allowFollow && following && !nativeDragging && list.scrollY != end) {
      if (!changed && settleFrames == 0) tailRangeRepairs++
      list.scrollTo(list.scrollX, end)
    }
    // Pin and compensate in this same pre-draw pass, using actual retained
    // pixels instead of FlashList estimates or content-height notifications.
    // This captures short-list margin changes even when content.height and
    // scrollY are unchanged, and naturally ignores history prepends.
    lastTailDelta = 0
    val canMoveTail = allowFollow && following && !imeOwnsMotion() && list.height == lastHeight && list.width == lastWidth && suppressMotionFrames == 0 && lastInset >= 0
    if (retained != null && canMoveTail) {
      lastTailDelta = retained.first.top - retained.second + list.scrollY - lastScroll + lastInset - inset
      moveContentBy(lastTailDelta, content)
    }
    if (suppressMotionFrames > 0) suppressMotionFrames--
    if (imeAnimating && allowFollow && following) {
      imePresentationContent = content
      content.translationY = (inset - visualInset).toFloat()
    } else if (imePresentationContent != null) {
      imePresentationContent?.translationY = 0f
      imePresentationContent = null
    }
    if (!changed && settleFrames > 0) settleFrames--
    val wasEmpty = tailAnchors.isEmpty()
    if (tailCellsDirty || changed || cellMoved || list.scrollY != lastScroll || retained == null) rememberTailAnchors(content, list)
    if (canMoveTail && wasEmpty && tailAnchors.isNotEmpty()) {
      lastTailDelta = (tailEntryDistanceDp * density).roundToInt()
      moveContentBy(lastTailDelta, content)
    }
    lastInset = inset; lastHeight = list.height; lastWidth = list.width; lastContent = content.height; lastScroll = list.scrollY
    if (debug) {
      val gap = dockTop - (listTop + content.bottom - list.scrollY)
      frames.addLast(mapOf("at" to SystemClock.uptimeMillis(), "following" to following, "allowFollow" to allowFollow,
        "geometryChanged" to changed, "geometryMotionSuppressed" to geometryOwnsMotion(), "settleFrames" to settleFrames, "offset" to list.scrollY / density,
        "end" to end / density, "inset" to inset / density, "gap" to gap / density, "dockTop" to dockTop / density,
        "presentationOffset" to motionOffset / density, "motionActive" to motionPosted,
        "tailDelta" to lastTailDelta / density, "tailAnchors" to tailAnchors.size,
        "nativeDragging" to nativeDragging, "tailRangeRepairs" to tailRangeRepairs,
        "imeBottom" to imeBottom / density, "imeAnimating" to imeAnimating,
        "dockImeTranslation" to dockImeTranslation / density,
        "controlsAttached" to (controls?.isAttachedToWindow == true),
        "controlsImeTranslation" to (controls?.translationY ?: 0f) / density))
      if (frames.size > 240) frames.removeFirst()
    }
  }
  private fun clipViewport(visible: View, dockTop: Float) {
    // Keep FlashList's measured viewport stable during IME motion. Relaying
    // every frame through View.layout caused Fabric/FlashList measurement work
    // to race native scrolling. Padding owns the scroll range; clipping owns
    // visibility. Neither requires re-laying out the list's ancestor chain.
    val height = (dockTop - layoutWindowTop(visible)).roundToInt().coerceIn(0, visible.height)
    if (height == viewportClipHeight && visible.width == viewportClipWidth) return
    viewportClipHeight = height; viewportClipWidth = visible.width
    viewportClip.set(0, 0, visible.width, height)
    visible.clipBounds = if (height == visible.height) null else viewportClip
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
  fun diagnostics(): Map<String, Any> = if (!debug) emptyMap() else mapOf("following" to following, "tailMotionVersion" to 3, "imeInsetsVersion" to 5, "dockControlsVersion" to 1, "tailMotionEnabled" to tailMotionEnabled, "tailDurationMs" to tailDurationMs, "tailCurve" to tailCurve, "tailMaxViewport" to tailMaxViewport, "controlsAttached" to (controls?.isAttachedToWindow == true), "controlsImeTranslation" to (controls?.translationY ?: 0f) / density, "frames" to frames.toList())
  fun resetDiagnostics() { frames.clear() }
}
