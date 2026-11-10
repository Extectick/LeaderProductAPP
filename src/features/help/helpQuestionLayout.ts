export const HELP_QUESTION_NAVIGATION_HEIGHT=36;

type QuestionLayout = {
  /** The chat container height, before subtracting only its actual IME overlap. */
  viewportHeight: number;
  imeInset: number;
  headerHeight: number;
  /** Settled non-question input height; its own animation remains independent. */
  composerHeight?: number;
  /** Attachments, quotes, or other measured non-question rows, if present. */
  extraDockHeight?: number;
  /** Combined outer top/bottom dock padding, including any resting safe inset. */
  dockPadding?: number;
};

const positive = (value: number, fallback = 0) => Number.isFinite(value) ? Math.max(0, value) : fallback;

/**
 * Reserve the input/navigation and one visible AI-status row before sizing the
 * scrollable question body. IME movement still belongs to the existing native
 * owner: imeInset is its overlap with this container, never a second keyboard
 * inset derived here.
 */
export function helpQuestionBodyHeight({viewportHeight,imeInset,headerHeight,composerHeight=48,extraDockHeight=0,dockPadding=16}:QuestionLayout):number {
  const available=positive(viewportHeight)-positive(imeInset)-positive(headerHeight);
  const outsideBody=Math.max(48,positive(composerHeight,48))+positive(extraDockHeight)+positive(dockPadding,16)+8+HELP_QUESTION_NAVIGATION_HEIGHT;
  // 44dp status/touch row + 16dp breathing room for the chat above the dock.
  // On extremely short/initially unmeasured containers, retain the existing
  // 48dp minimum scroll body; all reservations cannot fit simultaneously there.
  return Math.max(48,Math.min(240,available-outsideBody-60));
}
