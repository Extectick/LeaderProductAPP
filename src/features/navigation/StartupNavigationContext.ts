import {createContext} from 'react';

/** Mount the navigator under startup cover without running its default redirect. */
export const StartupNavigationContext = createContext(false);
