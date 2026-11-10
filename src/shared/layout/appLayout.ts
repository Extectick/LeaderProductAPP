/** Window and pane thresholds shared by the web shell, catalog and Help. */
export const APP_LAYOUT = {
  compactMax: 767,
  wideMin: 1100,
  sidebarWidth: 72,
  sidebarExpandedWidth: 216,
  catalogMaxWidth: 1120,
  helpListWidth: 320,
  chatMaxWidth: 800,
} as const;

export type AppLayoutMode = 'compact' | 'medium' | 'wide';
export function appLayoutMode(width: number): AppLayoutMode {
  if (width <= APP_LAYOUT.compactMax) return 'compact';
  return width < APP_LAYOUT.wideMin ? 'medium' : 'wide';
}
