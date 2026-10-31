import {useCallback, useEffect, useRef, type RefObject} from 'react';
import {Keyboard, Platform, type View} from 'react-native';

export function helpKeyboardOverlap(bottom: number, keyboardTop: number | null) {
  return keyboardTop === null ? 0 : Math.max(0, bottom - keyboardTop);
}

/** Measure the unchanged parent, rather than the moved dock. Works with both
 * adjustResize and edge-to-edge keyboards without subtracting the IME twice. */
export function useHelpKeyboardInset(parent: RefObject<View | null>, enabled: boolean, onInset: (height: number) => void) {
  const top = useRef<number | null>(null);
  const revision = useRef(0);
  const measure = useCallback(() => {
    if (!enabled || Platform.OS !== 'android') return;
    const request = ++revision.current;
    parent.current?.measureInWindow((_x, y, _width, height) => {
      if (request === revision.current) onInset(helpKeyboardOverlap(y + height, top.current));
    });
  }, [enabled, parent, onInset]);
  useEffect(() => {
    if (!enabled || Platform.OS !== 'android') return;
    top.current = Keyboard.isVisible() ? Keyboard.metrics()?.screenY ?? null : null;
    measure();
    const shown = Keyboard.addListener('keyboardDidShow', event => {top.current = event.endCoordinates.height > 0 ? event.endCoordinates.screenY : null; measure();});
    const hidden = Keyboard.addListener('keyboardDidHide', () => {top.current = null; ++revision.current; onInset(0);});
    return () => {++revision.current; shown.remove(); hidden.remove();};
  }, [enabled, measure, onInset]);
  return measure;
}
