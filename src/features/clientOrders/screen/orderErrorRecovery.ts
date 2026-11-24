import {createContext} from 'react';

// The boundary owns this callback. A failing editor reads it during layout
// cleanup, before its passive effects cancel timers and release its account.
export const OrderScreenFailed = createContext<() => boolean>(() => false);
