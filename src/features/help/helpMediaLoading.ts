import { createContext } from 'react';

// Text is always rendered. Only originals near the viewport enter the native
// image loader; tiny previews already travel with the message metadata.
export const HelpMediaLoadingContext=createContext<'visible'|'near'|'deferred'>('visible');
