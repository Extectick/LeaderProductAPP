import {createContext} from 'react';

/** Inactive navigation scenes must release native blur surfaces. */
export const HelpVisualEffectsContext = createContext(true);
