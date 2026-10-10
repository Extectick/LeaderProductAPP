import React from 'react';

const HISTORY_KEY = '__leaderProductPhoto';
let sequence = 0;
type Entry = { id: string; url: string };

/** A same-URL history entry for the overlay; never put the photo or share token in state. */
export function createGalleryHistory(browser: Window, onClose: () => void) {
  let entry: Entry | null = null;
  let open = false;
  let pendingBack = false;
  let listening = false;
  let disposal: ReturnType<typeof setTimeout> | undefined;
  const ownsCurrent = () => entry && browser.location.href === entry.url && browser.history.state?.[HISTORY_KEY] === entry.id;
  const acquire = () => {
    if (!open || entry || pendingBack) return;
    entry = { id: `photo-${Date.now()}-${++sequence}`, url: browser.location.href };
    browser.history.pushState({ ...browser.history.state, [HISTORY_KEY]: entry.id }, '');
  };
  const release = () => {
    const shouldGoBack = ownsCurrent();
    entry = null;
    if (shouldGoBack && !pendingBack) { pendingBack = true; browser.history.back(); }
  };
  const pop = () => {
    if (pendingBack) {
      pendingBack = false;
      // A quick reopen must wait until the previous asynchronous Back completes.
      acquire();
      if (!listening) browser.removeEventListener('popstate', pop);
      return;
    }
    if (entry && !ownsCurrent()) {
      entry = null;
      open = false;
      onClose();
    }
  };
  return {
    sync(nextOpen: boolean) {
      clearTimeout(disposal);
      if (!listening) { browser.addEventListener('popstate', pop); listening = true; }
      open = nextOpen;
      if (open) acquire(); else release();
    },
    close() {
      open = false;
      release();
      onClose();
    },
    dispose() {
      // React Strict Mode replays effects; allow its immediate setup to reuse
      // the existing entry rather than creating a second asynchronous Back.
      disposal = setTimeout(() => {
        open = false;
        listening = false;
        release();
        if (!pendingBack) browser.removeEventListener('popstate', pop);
      }, 0);
    },
  };
}

export function useGalleryHistory(open: boolean, onClose: () => void) {
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  const controller = React.useRef<ReturnType<typeof createGalleryHistory> | null>(null);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    controller.current ??= createGalleryHistory(window, () => closeRef.current());
    controller.current.sync(open);
    return () => controller.current?.dispose();
  }, [open]);
  return React.useCallback(() => {
    if (controller.current) controller.current.close(); else closeRef.current();
  }, []);
}
