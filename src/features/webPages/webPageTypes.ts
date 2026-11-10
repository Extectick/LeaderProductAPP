export type WebPageControls = {
  canGoBack: boolean;
  goBack: () => void;
  reload: () => void;
  /** Cross-origin browser frames cannot expose their current address/history. */
  locationIsExact?: boolean;
};

export type WebPageContentProps = {
  url: string;
  title?: string;
  topInset?: number;
  active?: boolean;
  onTitle?: (title: string) => void;
  onLocation?: (url: string) => void;
  onScroll?: (offset: number) => void;
  onControls?: (controls: WebPageControls | null) => void;
  onOpenLink?: (url: string) => boolean;
};
