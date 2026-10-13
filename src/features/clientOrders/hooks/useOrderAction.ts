import React from 'react';

/** Header actions must keep their identity when the workspace object is rebuilt.
 * The header lives in a parent provider; publishing a new callback on every
 * render can feed a layout update straight back into the document screen.
 */
export function useOrderAction<Args extends unknown[], Result>(action: (...args: Args) => Result) {
  const current = React.useRef(action);
  React.useLayoutEffect(() => { current.current = action; });
  return React.useCallback((...args: Args) => current.current(...args), []);
}
