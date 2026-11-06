package expo.modules.leaderhelpinput

import kotlin.math.max

/** Coordinates are dp; EditText itself keeps a fixed viewport and top inset. */
internal object HelpInputGeometry {
  const val topInset = 12f
  const val viewport = 145f
  fun bottomInset(content: Float) = 12f * (1f - ((content - 132f) / 13f).coerceIn(0f, 1f))
  fun outerHeight(content: Float): Float {
    val visible = content.coerceIn(22f, viewport)
    return max(46f, topInset + visible + bottomInset(visible))
  }
  fun bottomInsetForOuter(outer: Float): Float {
    val content = if (outer <= 156f) outer - 24f else 132f + (outer - 156f) * 13f
    return bottomInset(content.coerceAtMost(viewport))
  }
  fun revealScroll(current: Float, lineTop: Float, lineBottom: Float, content: Float, visible: Float): Float {
    val minimum = max(0f, lineBottom - visible)
    val maximum = max(minimum, lineTop)
    return current.coerceIn(minimum, maximum).coerceIn(0f, max(0f, content - visible))
  }
  fun interpolate(from: Float, to: Float, fraction: Float) = from + (to - from) * fraction.coerceIn(0f, 1f)
}
