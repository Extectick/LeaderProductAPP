package expo.modules.leaderhelpinput

import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.ScrollView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView
import kotlin.math.max
import kotlin.math.roundToInt

class LeaderHelpChatLayoutModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LeaderHelpChatLayout")
    View(LeaderHelpChatLayoutView::class) {
      Prop("scrollId") { view: LeaderHelpChatLayoutView, id: String -> view.scrollId = id }
      Prop("dockId") { view: LeaderHelpChatLayoutView, id: String -> view.dockId = id }
      Prop("allowFollow") { view: LeaderHelpChatLayoutView, value: Boolean -> view.allowFollow = value }
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
        if (value) { settleFrames = 2; postInvalidateOnAnimation() }
      }
    }
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
  private val frames = ArrayDeque<Map<String, Any>>()
  private val beforeDraw = ViewTreeObserver.OnPreDrawListener { synchronize(); true }
  private val dockLayout = View.OnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> synchronize() }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnPreDrawListener(beforeDraw)
  }
  override fun onDetachedFromWindow() {
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
    if (allowFollow && following && !changed && settleFrames == 0 && list.scrollY < lastScroll) following = false
    list.clipToPadding = false
    if (list.paddingBottom != inset) list.setPadding(list.paddingLeft, list.paddingTop, list.paddingRight, inset)
    val end = max(0, content.height + inset - list.height)
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
        "end" to end / density, "inset" to inset / density, "gap" to gap / density, "dockTop" to dockTop / density))
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
  fun diagnostics(): Map<String, Any> = if (!debug) emptyMap() else mapOf("following" to following, "frames" to frames.toList())
  fun resetDiagnostics() { frames.clear() }
}
