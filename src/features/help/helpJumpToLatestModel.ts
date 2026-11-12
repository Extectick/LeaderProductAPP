export type HelpLatestAffordance = { visible: boolean; up: number; down: number };
export const HELP_LATEST_SCROLL_THRESHOLD = 24;
export const hiddenHelpLatest = (): HelpLatestAffordance => ({ visible: false, up: 0, down: 0 });

// Telegram's RecyclerAnimationScrollHelper animates only the outgoing/incoming
// viewport with EASE_OUT_QUINT; it never flies through every intervening row.
export const HELP_LATEST_SCROLL_BEZIER = [.23, 1, .32, 1] as const;
export type HelpLatestNavigationMotion = { mode: 'none' | 'instant' | 'near' | 'viewport'; duration: number; distance: number };
export function helpLatestNavigationMotion(input: {
  gap: number; viewportHeight: number; hasNewer: boolean; reducedMotion?: boolean;
}): HelpLatestNavigationMotion {
  const viewport = Number.isFinite(input.viewportHeight) ? Math.max(1, input.viewportHeight) : 1;
  const gap = Number.isFinite(input.gap) ? Math.max(0, input.gap) : viewport;
  if (!input.hasNewer && gap <= 2) return { mode: 'none', duration: 0, distance: 0 };
  if (input.reducedMotion) return { mode: 'instant', duration: 0, distance: 0 };
  // A loaded nearby tail retains its actual geometry. A far or unloaded tail
  // gets one bounded viewport transition once the destination has laid out.
  if (!input.hasNewer && gap < viewport) return { mode: 'near', duration: 600, distance: gap };
  const distance = viewport;
  const duration = Math.min(1300, Math.max(300, Math.floor((distance / viewport + 1) * 200)));
  return { mode: 'viewport', duration, distance };
}

/** Follow ownership is separate from this affordance. Layout changes, keyboard
 * movement and opening a saved anchor are not a manual scroll through history. */
export function updateHelpLatestAffordance(previous: HelpLatestAffordance, input: {
  delta: number; gap: number; manual: boolean; hasNewer: boolean;
}): HelpLatestAffordance {
  if (!input.hasNewer && input.gap <= 2) return hiddenHelpLatest();
  if (!input.manual || !Number.isFinite(input.delta) || Math.abs(input.delta) < .5) return previous;
  if (input.delta < 0) {
    const up = previous.up - input.delta;
    return { visible: previous.visible || up >= HELP_LATEST_SCROLL_THRESHOLD && (input.hasNewer || input.gap >= HELP_LATEST_SCROLL_THRESHOLD), up, down: 0 };
  }
  const down = previous.down + input.delta;
  return { visible: previous.visible && down < HELP_LATEST_SCROLL_THRESHOLD && (input.hasNewer || input.gap > 8), up: 0, down };
}
