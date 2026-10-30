export type HelpLatestAffordance = { visible: boolean; up: number; down: number };
export const HELP_LATEST_SCROLL_THRESHOLD = 100;
export const hiddenHelpLatest = (): HelpLatestAffordance => ({ visible: false, up: 0, down: 0 });

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
  return { visible: previous.visible && down < HELP_LATEST_SCROLL_THRESHOLD && (input.hasNewer || input.gap > 40), up: 0, down };
}
