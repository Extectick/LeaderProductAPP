const HORIZONTAL_PADDING = 22;
const STAMP_GAP = 8;
// Yoga and Android text measure at different precision. Do not make the
// bubble width exactly equal to the sum: a rounded-down pixel would move the
// stamp to a new row, then enlarge the cell during scrolling.
const ROUNDING_RESERVE = 1;

export type HelpTextLineMeasurement = {
  end: number;
  maxEnd: number;
  count: number;
};

/** Independently implemented from Telegram's last-line/time-width approach. */
export function helpTextStampLayout({ availableWidth, contentWidth, lines, stampWidth, allowExpansion = true }: {
  availableWidth: number;
  contentWidth: number;
  lines: HelpTextLineMeasurement | null;
  stampWidth: number;
  allowExpansion?: boolean;
}) {
  if (!lines || stampWidth <= 0 || contentWidth <= 0) return { minWidth: 90, inline: false };
  const requiredContent = lines.end + stampWidth + STAMP_GAP;
  const minWidth = allowExpansion
    ? Math.min(availableWidth, Math.ceil(Math.max(90, lines.maxEnd + HORIZONTAL_PADDING, requiredContent + HORIZONTAL_PADDING + ROUNDING_RESERVE)))
    : 90;
  return { minWidth, inline: requiredContent <= contentWidth + .25 };
}
