package expo.modules.leaderhelpinput

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HelpInputGeometryTest {
  @Test fun wrappingMovesExistingTextWithTheBorder() {
    val from = HelpInputGeometry.outerHeight(22f)
    val to = HelpInputGeometry.outerHeight(44f)
    val bottom = 600f
    val firstLineBefore = bottom - from + HelpInputGeometry.topInset
    for (fraction in listOf(0f, .1f, .5f, .9f, 1f)) {
      val outer = HelpInputGeometry.interpolate(from, to, fraction)
      val firstLine = bottom - outer + HelpInputGeometry.topInset
      assertEquals((to - from) * fraction, firstLineBefore - firstLine, .001f)
    }
    assertEquals(46f, from, .001f)
    assertEquals(68f, to, .001f)
  }

  @Test fun capDoesNotReplaceBottomPaddingInOneFrame() {
    val heights = (132..145).map { HelpInputGeometry.outerHeight(it.toFloat()) }
    assertEquals(156f, heights.first(), .001f)
    assertEquals(157f, heights.last(), .001f)
    heights.zipWithNext().forEach { (a, b) -> assertTrue(b >= a && b - a < .1f) }
    for (content in 22..145) {
      val outer = HelpInputGeometry.outerHeight(content.toFloat())
      assertEquals(content.toFloat(), outer - HelpInputGeometry.topInset - HelpInputGeometry.bottomInsetForOuter(outer), .001f)
    }
  }

  @Test fun newlineAtTheCapScrollsGraduallyWithoutMovingTheBorder() {
    val outer = HelpInputGeometry.outerHeight(176f)
    val target = HelpInputGeometry.revealScroll(9f, 154f, 176f, 176f, 145f)
    assertEquals(31f, target, .001f)
    val halfway = HelpInputGeometry.interpolate(9f, target, .5f)
    assertEquals(20f, halfway, .001f)
    assertTrue(halfway > 9f && halfway < target)
    assertEquals(outer, HelpInputGeometry.outerHeight(154f), .001f)
  }

  @Test fun retargetStartsAtThePresentedScrollAndDeletionReturnsToZero() {
    val presented = HelpInputGeometry.interpolate(9f, 31f, .4f)
    assertEquals(presented, HelpInputGeometry.interpolate(presented, 53f, 0f), .001f)
    val target = HelpInputGeometry.revealScroll(presented, 22f, 44f, 44f, 44f)
    assertEquals(0f, target, .001f)
    assertEquals(presented / 2, HelpInputGeometry.interpolate(presented, target, .5f), .001f)
  }

  @Test fun selectionAboveOrBelowViewportRevealsOnlyTheRequiredDistance() {
    assertEquals(22f, HelpInputGeometry.revealScroll(100f, 22f, 44f, 400f, 145f), .001f)
    assertEquals(185f, HelpInputGeometry.revealScroll(100f, 308f, 330f, 400f, 145f), .001f)
    assertEquals(100f, HelpInputGeometry.revealScroll(100f, 110f, 132f, 400f, 145f), .001f)
  }
}
