import { Platform } from 'react-native';

const HEADER_TOP_PADDING_WEB = 10;
const HEADER_TOP_PADDING_NATIVE_EXTRA = 4;
const HEADER_WRAP_BOTTOM = 8;
const HEADER_CARD_VERTICAL = 24;
const HEADER_ROW_BASE_HEIGHT = 38;
const HEADER_ROW_SUBTITLE_BONUS = 12;
const HEADER_CONTENT_GAP = 8;

type HeaderOffsetOptions = {
  compact?: boolean;
  hasSubtitle?: boolean;
  extraGap?: number;
};

export function getAppHeaderPageTopOffset(
  topInset: number,
  { compact = false, hasSubtitle = false, extraGap = HEADER_CONTENT_GAP }: HeaderOffsetOptions = {}
) {
  const topPadding = Platform.OS === 'web' ? HEADER_TOP_PADDING_WEB : topInset + HEADER_TOP_PADDING_NATIVE_EXTRA;
  const cardVertical = compact ? 20 : HEADER_CARD_VERTICAL;
  const rowHeight = HEADER_ROW_BASE_HEIGHT + (hasSubtitle && !compact ? HEADER_ROW_SUBTITLE_BONUS : 0);
  return Math.round(topPadding + HEADER_WRAP_BOTTOM + cardVertical + rowHeight + extraGap);
}

